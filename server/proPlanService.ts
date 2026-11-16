import type { PrintedPlan, RealIntake } from '../src/professional/menuPlan.ts';
import { generatePrintedPlan, ProMenuCountError } from '../src/professional/menuPlan.ts';
import { createMealPlanEngine, MealPlanFeasibilityError, MealPlanGenerationError } from '../src/utils/mealPlanEngine.ts';
import type { NutritionCatalog, ProteinEnginePolicy } from '../src/types/index.ts';
import { proNutritionDraftAllowed } from '../src/professional/intake.ts';

export class ProServerError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export interface DraftRequest { date: string; count: number; notes: string }
export interface ServerDraft { draft_id: string; plan: PrintedPlan }
type CurrentCase = { revision: number; answers: RealIntake };
type GenerationRequest = { org: string; record: string; revision: number; actor: string; key: string; request: DraftRequest };
type GenerationCase = CurrentCase | { draft: ServerDraft };
export type PlanPhase = 'auth' | 'case' | 'catalog' | 'solve' | 'stage' | 'publish';

export interface PlanDependencies {
  reportFailure?(input:{id:string;actor:string;org:string;operation:'generate'|'save';code:string}):Promise<void>;
  verifyToken(token: string): Promise<string>;
  readCase(token: string, org: string, record: string): Promise<CurrentCase>;
  prepareGeneration?(input: GenerationRequest, token: string): Promise<GenerationCase>;
  loadNutrition(token: string): Promise<{ catalog: NutritionCatalog; policy: ProteinEnginePolicy; revision?: string; cacheHit?: boolean }>;
  stage(input: { org: string; record: string; revision: number; actor: string; key: string; request: DraftRequest; plan: PrintedPlan }): Promise<ServerDraft>;
  publish(input: { org: string; record: string; revision: number; actor: string; draft: string; key: string }): Promise<string>;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function processPlanRequest(
  body: unknown, token: string, deps: PlanDependencies,
  observe?: (phase: PlanPhase, milliseconds: number, details?: { cacheHit?: boolean }) => void,
) {
  async function measure<T>(phase: PlanPhase, work: () => T | Promise<T>): Promise<T> {
    const start = performance.now();
    let details: { cacheHit?: boolean } | undefined;
    try {
      const result = await work();
      if (phase === 'catalog' && result && typeof result === 'object' && 'cacheHit' in result)
        details = { cacheHit: result.cacheHit === true };
      return result;
    } finally {
      observe?.(phase, Math.round(performance.now() - start), details);
    }
  }
  if (!token || token.length > 8192) throw new ProServerError('PRO_AUTH_REQUIRED', 401);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProServerError('PRO_INVALID_REQUEST');
  const b = body as Record<string, unknown>;
  const keys = b.action === 'generate' ? ['action','org','record','revision','key','date','count','notes']
    : b.action === 'catalog' ? ['action','org','record','revision','key'] : b.action === 'save' ? ['action','org','record','revision','key','draft'] : [];
  if (!keys.length || Object.keys(b).some(k => !keys.includes(k)) || keys.some(k => !(k in b))
      || !uuid(b.org) || !uuid(b.record) || !uuid(b.key) || !Number.isSafeInteger(b.revision) || Number(b.revision) < 1)
    throw new ProServerError('PRO_INVALID_REQUEST');
  if (b.action === 'save' && !uuid(b.draft)) throw new ProServerError('PRO_INVALID_REQUEST');
  if (b.action === 'generate') {
    if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)
        || !Number.isFinite(Date.parse(b.date + 'T12:00:00Z'))
        || new Date(b.date + 'T12:00:00Z').toISOString().slice(0,10) !== b.date
        || !Number.isInteger(b.count) || Number(b.count) < 1 || Number(b.count) > 5
        || typeof b.notes !== 'string' || b.notes.length > 2000)
      throw new ProServerError('PRO_INVALID_REQUEST');
  }
  const actor = await measure('auth', () => deps.verifyToken(token));
  const identity = { org: b.org, record: b.record, revision: Number(b.revision), actor, key: b.key };
  if (b.action === 'save') {
    // SQL rechecks access, including retries of already committed writes.
    return { id: await measure('publish', () => deps.publish({ ...identity, draft: b.draft as string })) };
  }
  if (b.action === 'catalog') {
    const current = await measure('case', () => deps.readCase(token, identity.org, identity.record));
    if (current.revision !== b.revision) throw new ProServerError('PRO_STALE_REVISION', 409);
    const { catalog } = await measure('catalog', () => deps.loadNutrition(token));
    return { foods: catalog.foods };
  }
  const request: DraftRequest = { date:b.date as string, count:b.count as number, notes:(b.notes as string).trim() };
  const input = { ...identity, request };
  const current = await measure('case', () => deps.prepareGeneration
    ? deps.prepareGeneration(input, token)
    : deps.readCase(token, identity.org, identity.record));
  if ('draft' in current) return current.draft;
  if (current.revision !== b.revision) throw new ProServerError('PRO_STALE_REVISION', 409);
  // A future program date must not make a currently ineligible client eligible.
  if (!proNutritionDraftAllowed(current.answers, new Date())
      || !proNutritionDraftAllowed(current.answers, new Date(request.date + 'T12:00:00Z')))
    throw new ProServerError('PRO_MEDICAL_STOP', 422);
  const { catalog, policy, revision } = await measure('catalog', () => deps.loadNutrition(token));
  const plan = await measure('solve', () => {
    try {
      const engine = createMealPlanEngine(catalog, revision);
      const result = generatePrintedPlan(current.answers, current.revision, request.count, policy, request.date, request.notes, engine);
      if (revision) result.catalog_revision = revision;
      return result;
    } catch (error) {
      if (error instanceof ProMenuCountError)
        throw new ProServerError(error.reason === 'search-limit' ? 'PRO_MENU_SEARCH_LIMIT' : 'PRO_MENU_COUNT_UNAVAILABLE', 422);
      if (error instanceof MealPlanGenerationError)
        throw new ProServerError(error.reason === 'no-eligible-options' ? 'PRO_NO_ELIGIBLE_MEAL' : 'PRO_MENU_SEARCH_LIMIT', 422);
      if (error instanceof MealPlanFeasibilityError) throw new ProServerError('PRO_MENU_SEARCH_LIMIT', 422);
      throw new ProServerError('PRO_GENERATION_FAILED', 422);
    }
  });
  return measure('stage', () => deps.stage({ ...input, plan }));
}
