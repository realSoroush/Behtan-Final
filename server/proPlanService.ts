import type { PrintedPlan, RealIntake } from '../src/professional/menuPlan.ts';
import { generatePrintedPlan } from '../src/professional/menuPlan.ts';
import { configureNutritionCatalog } from '../src/utils/mealPlanEngine.ts';
import type { NutritionCatalog, ProteinEnginePolicy } from '../src/types/index.ts';
import { proNutritionDraftAllowed } from '../src/professional/intake.ts';

export class ProServerError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export interface DraftRequest { date: string; count: number; notes: string }
export interface ServerDraft { draft_id: string; plan: PrintedPlan }
export interface PlanDependencies {
  reportFailure?(input:{id:string;actor:string;org:string;operation:'generate'|'save';code:string}):Promise<void>;
  verifyToken(token: string): Promise<string>;
  readCase(token: string, org: string, record: string): Promise<{ revision: number; answers: RealIntake }>;
  loadNutrition(token: string): Promise<{ catalog: NutritionCatalog; policy: ProteinEnginePolicy }>;
  stage(input: { org: string; record: string; revision: number; actor: string; key: string; request: DraftRequest; plan: PrintedPlan }): Promise<ServerDraft>;
  publish(input: { org: string; record: string; revision: number; actor: string; draft: string; key: string }): Promise<string>;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function processPlanRequest(body: unknown, token: string, deps: PlanDependencies) {
  if (!token || token.length > 8192) throw new ProServerError('PRO_AUTH_REQUIRED', 401);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProServerError('PRO_INVALID_REQUEST');
  const b = body as Record<string, unknown>;
  const keys = b.action === 'generate' ? ['action','org','record','revision','key','date','count','notes']
    : b.action === 'save' ? ['action','org','record','revision','key','draft'] : [];
  if (!keys.length || Object.keys(b).some(k => !keys.includes(k)) || keys.some(k => !(k in b))
      || !uuid(b.org) || !uuid(b.record) || !uuid(b.key) || !Number.isSafeInteger(b.revision) || Number(b.revision) < 1)
    throw new ProServerError('PRO_INVALID_REQUEST');
  if (b.action === 'save' && !uuid(b.draft)) throw new ProServerError('PRO_INVALID_REQUEST');
  if (b.action === 'generate') {
    if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)
        || !Number.isFinite(Date.parse(b.date + 'T12:00:00Z'))
        || new Date(b.date + 'T12:00:00Z').toISOString().slice(0,10) !== b.date
        || !Number.isInteger(b.count) || Number(b.count) < 1 || Number(b.count) > 4
        || typeof b.notes !== 'string' || b.notes.length > 2000)
      throw new ProServerError('PRO_INVALID_REQUEST');
  }
  const actor = await deps.verifyToken(token);
  if (b.action === 'save') {
    // SQL rechecks current access under the org lock; an already-committed
    // response-loss retry can succeed even if the intake has since changed.
    return { id: await deps.publish({ org:b.org, record:b.record, revision:Number(b.revision), actor, key:b.key, draft:b.draft as string }) };
  }
  // Always use the user's JWT for RLS reads. Never accept answers/targets from the request.
  const current = await deps.readCase(token, b.org, b.record);
  if (current.revision !== b.revision) throw new ProServerError('PRO_STALE_REVISION', 409);
  const request: DraftRequest = { date:b.date as string, count:b.count as number, notes:(b.notes as string).trim() };
  // A future program date must not make a currently ineligible client eligible.
  if (!proNutritionDraftAllowed(current.answers, new Date())
      || !proNutritionDraftAllowed(current.answers, new Date(request.date + 'T12:00:00Z')))
    throw new ProServerError('PRO_MEDICAL_STOP', 422);
  const { catalog, policy } = await deps.loadNutrition(token);
  let plan: PrintedPlan;
  try {
    // No await between configuring and using the legacy synchronous engine: requests
    // cannot interleave catalogs on this Node event loop.
    configureNutritionCatalog(catalog);
    plan = generatePrintedPlan(current.answers, current.revision, request.count, policy, request.date, request.notes);
  } catch {
    throw new ProServerError('PRO_GENERATION_FAILED', 422);
  }
  return deps.stage({ org:b.org, record:b.record, revision:current.revision, actor, key:b.key, request, plan });
}
