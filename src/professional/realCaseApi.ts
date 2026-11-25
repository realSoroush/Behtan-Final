import { proPlanAccessToken } from './planSession';
import { parsePilotServerTiming, recordPilotTiming } from '../utils/pilotTimings';
import { supabase } from "@/lib/supabaseClient";
import { rpc } from "./api";
import type { PrintedPlan, RealIntake } from "./menuPlan";
export type CaseSummary = Pick<RealCase,'id'|'display_name'|'phone'|'revision'|'updated_at'|'archived_at'|'archive_revision'>;
export interface WorkspaceStatus { nutrition_delivery?: boolean; plan_label?:string; modules?: import('./modules').ProModules; can_write:boolean; source:string; expires_at:string|null; case_limit:number|null; case_count:number }
export interface RealCase {
  id: string;
  organization_id: string;
  display_name: string;
  phone: string;
  answers: RealIntake;
  revision: number;
  updated_at: string;
  archived_at: string | null;
  archive_revision: number;
}
export interface SavedRealPlan {
  id: string;
  intake_revision: number;
  recorded_at: string;
  plan: PrintedPlan;
}
export interface RealRevision {
  revision: number;
  answers: RealIntake;
  recorded_at: string;
}
export const realCaseApi = {
  list: (org: string, search = '', page = 0, archived = false) => rpc<{rows: CaseSummary[];total:number}>('pro_browse_case_directory',{p_org:org,p_search:search,p_page:page,p_archived:archived}),
  archive: (org:string,record:string,expected:number,archived:boolean,key:string)=>rpc('pro_set_case_archived',{p_org:org,p_record:record,p_expected:expected,p_archived:archived,p_key:key}),
  duplicates:(org:string,phone:string)=>rpc<{id:string;display_name:string;archived_at:string|null}[]>('pro_duplicate_cases',{p_org:org,p_phone:phone}),
  status: (org: string) => rpc<WorkspaceStatus>('pro_workspace_status',{p_org:org}),
  get: (org: string, id: string) => readCase<RealCase>(org, id, '*'),
  getRevision: (org: string, id: string) =>
    readCase<Pick<RealCase, 'revision' | 'archived_at'>>(org, id, 'revision,archived_at'),
  history: async (org: string, id: string, page = 0) => rpc<{rows:RealRevision[];total:number}>('pro_browse_case_history',{p_org:org,p_record:id,p_kind:'intakes',p_page:page}),
  plans: async (org: string, id: string, page = 0) => rpc<{rows:SavedRealPlan[];total:number}>('pro_browse_case_history',{p_org:org,p_record:id,p_kind:'plans',p_page:page}),
  save: (
    org: string,
    id: string | null,
    revision: number,
    a: RealIntake,
    key: string,
  ) =>
    rpc<{ id: string; revision: number }>("pro_save_real_case", {
      p_org: org,
      p_record: id,
      p_expected: revision,
      p_answers: a,
      p_key: key,
    }),
  catalog: (org:string,record:string,revision:number)=>planRequest<{foods:import('@/types').FoodItem[]}>({action:'catalog',org,record,revision,key:crypto.randomUUID()}),
  generatePlan: (org: string, id: string, revision: number, count: number, date: string, notes: string, key: string, mealSettings?: import('../utils/mealSettings').MealSettings) =>
    planRequest<{ draft_id: string; plan: PrintedPlan }>({ action:'generate', org, record:id, revision, count, date, notes, key, ...(mealSettings ? { mealSettings } : {}) }),
  savePlan: async (org: string, id: string, revision: number, draft: string, key: string) =>
    (await planRequest<{id: string}>({action:'save',org,record:id,revision,draft,key})).id,
};
async function readCase<T>(org: string, id: string, columns: string): Promise<T> {
  const { data, error, status } = await supabase
    .from('pro_real_cases').select(columns).eq('organization_id', org).eq('id', id)
    .abortSignal(AbortSignal.timeout(10_000)).retry(false).single();
  if (error) {
    if (status === 401 || status === 403 || error.code === '42501' || error.code === 'PGRST116')
      throw new Error('PRO_ACCESS_DENIED');
    throw new Error('PRO_CONNECTION_ERROR');
  }
  if (!data) throw new Error('PRO_ACCESS_DENIED');
  return data as T;
}

async function planRequest<T>(body: Record<string, unknown>): Promise<T> {
  const start = performance.now();
  const reportGeneration = (response?: Response) => {
    if (body.action !== 'generate' || typeof body.count !== 'number') return;
    const requestId = response?.headers.get('X-Request-Id');
    recordPilotTiming({
      event: 'generate',
      elapsed_ms: performance.now() - start,
      menus: body.count,
      status: response?.status ?? 0,
      ...(requestId && /^[a-f0-9-]{36}$/i.test(requestId) ? { request_id: requestId } : {}),
      ...(response ? { phases_ms: parsePilotServerTiming(response.headers.get('Server-Timing')) } : {}),
    });
  };
  const signal = AbortSignal.timeout(65_000);
  let response: Response;
  try {
    const token = await proPlanAccessToken(AbortSignal.any([signal, AbortSignal.timeout(8_000)]));
    response = await fetch('/api/pro-plan', {
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify(body), signal,
    });
  } catch (error) {
    reportGeneration();
    if (error instanceof Error && error.message === 'PRO_AUTH_REQUIRED') throw error;
    const timedOut = signal.aborted || (error instanceof Error && error.name === 'TimeoutError');
    throw new Error(timedOut ? 'PRO_REQUEST_TIMEOUT' : 'PRO_CONNECTION_ERROR');
  }
  const id = response.headers.get('X-Request-Id');
  const fail = (code: string) => new Error(code + (id ? ' [' + id + ']' : ''));
  let value: {error?: string} | null;
  try { value = await response.json(); } catch {
    reportGeneration(response);
    if (signal.aborted || response.status === 504) throw fail('PRO_REQUEST_TIMEOUT');
    throw fail(response.status === 404 || response.ok ? 'PRO_API_NOT_DEPLOYED' : 'PRO_API_UNAVAILABLE');
  }
  reportGeneration(response);
  if (!response.ok) {
    throw fail(value?.error || (response.status === 504 ? 'PRO_REQUEST_TIMEOUT' : 'PRO_CONNECTION_ERROR'));
  }
  return value as T;
}
