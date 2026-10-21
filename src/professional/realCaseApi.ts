import { supabase } from "@/lib/supabaseClient";
import { rpc } from "./api";
import type { PrintedPlan, RealIntake } from "./menuPlan";
export type CaseSummary = Pick<RealCase,'id'|'display_name'|'phone'|'revision'|'updated_at'|'archived_at'|'archive_revision'>;
export interface WorkspaceStatus { can_write:boolean; source:string; expires_at:string|null; case_limit:number|null; case_count:number }
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
  async get(org: string, id: string): Promise<RealCase> {
    const { data, error, status } = await supabase
      .from("pro_real_cases").select("*").eq("organization_id", org).eq("id", id).abortSignal(AbortSignal.timeout(10000)).retry(false).single();
    if (error) {
      if (status === 401 || status === 403 || error.code === '42501' || error.code === 'PGRST116')
        throw new Error('PRO_ACCESS_DENIED');
      throw new Error('PRO_CONNECTION_ERROR');
    }
    if (!data) throw new Error('PRO_ACCESS_DENIED');
    return data;
  },
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
  generatePlan: (org: string, id: string, revision: number, count: number, date: string, notes: string, key: string) =>
    planRequest<{ draft_id: string; plan: PrintedPlan }>({ action:'generate', org, record:id, revision, count, date, notes, key }),
  savePlan: async (org: string, id: string, revision: number, draft: string, key: string) =>
    (await planRequest<{id: string}>({action:'save',org,record:id,revision,draft,key})).id,
};
async function planRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('PRO_AUTH_REQUIRED');
  let response: Response;
  try {
    response = await fetch('/api/pro-plan', {
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},
      body:JSON.stringify(body), signal:AbortSignal.timeout(60000),
    });
  } catch { throw new Error('PRO_CONNECTION_ERROR'); }
  let value: {error?: string};
  try { value = await response.json(); } catch {
    throw new Error(response.status === 404 || response.ok ? 'PRO_API_NOT_DEPLOYED' : 'PRO_API_UNAVAILABLE');
  }
  if (!response.ok) {
    const id=response.headers.get('X-Request-Id');
    throw new Error((value.error || 'PRO_CONNECTION_ERROR') + (id ? ' ['+id+']' : ''));
  }
  return value as T;
}
