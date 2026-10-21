import { supabase } from "@/lib/supabaseClient";
import { rpc } from "./api";
import type { PrintedPlan, RealIntake } from "./menuPlan";
export interface RealCase {
  id: string;
  organization_id: string;
  display_name: string;
  phone: string;
  answers: RealIntake;
  revision: number;
  updated_at: string;
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
  async list(org: string): Promise<RealCase[]> {
    const { data, error } = await supabase
      .from("pro_real_cases")
      .select("*")
      .eq("organization_id", org)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  },
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
  async history(org: string, id: string): Promise<RealRevision[]> {
    const { data, error } = await supabase
      .from("pro_real_intake_versions")
      .select("revision,answers,recorded_at")
      .eq("organization_id", org)
      .eq("record_id", id)
      .order("revision", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data;
  },
  async plans(org: string, id: string): Promise<SavedRealPlan[]> {
    const { data, error } = await supabase
      .from("pro_real_plans")
      .select("id,intake_revision,recorded_at,plan")
      .eq("organization_id", org)
      .eq("record_id", id)
      .order("recorded_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data;
  },
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
  try { value = await response.json(); } catch { throw new Error('PRO_SERVER_NOT_CONFIGURED'); }
  if (!response.ok) throw new Error(value.error || 'PRO_CONNECTION_ERROR');
  return value as T;
}
