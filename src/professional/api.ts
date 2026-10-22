import { supabase } from "@/lib/supabaseClient";
import type {
  ProMembership,
  ProOrganization,
  SandboxPatient,
} from "./contracts";
export async function rpc<T>(
  name: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, params).abortSignal(AbortSignal.timeout(15000)).retry(false);
  if (error?.code==='PGRST202') throw new Error('PRO_MIGRATION_REQUIRED');
  if (error) throw new Error(error.message.includes('PRO_')||error.message.includes('ADMIN_REQUIRED') ? error.message : 'PRO_CONNECTION_ERROR');
  return data as T;
}
export const proApi = {
  status: () => rpc<boolean>("pro_pilot_status"),
  createOrganization: (key: string) =>
    rpc<ProOrganization>("pro_create_sandbox_organization", {
      p_request_key: key,
    }),
  createPatient: (organizationId: string, key: string) =>
    rpc<SandboxPatient>("pro_create_sandbox_patient", {
      p_organization_id: organizationId,
      p_request_key: key,
    }),
  async workspaces(): Promise<{
    organizations: ProOrganization[];
    memberships: ProMembership[];
  }> {
    const [orgs, members] = await Promise.all([
      supabase
        .from("pro_organizations")
        .select("id,name,mode,status")
        .order("created_at"),
      supabase
        .from("pro_memberships")
        .select("organization_id,user_id,roles,status"),
    ]);
    if (orgs.error || members.error)
      throw new Error(orgs.error?.message || members.error?.message);
    return {
      organizations: orgs.data as ProOrganization[],
      memberships: members.data as ProMembership[],
    };
  },
  async patients(organizationId: string): Promise<SandboxPatient[]> {
    const { data, error } = await supabase
      .from("pro_sandbox_patients")
      .select("id,organization_id,case_code,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error?.code==='PGRST202') throw new Error('PRO_MIGRATION_REQUIRED');
  if (error) throw new Error(error.message.includes('PRO_')||error.message.includes('ADMIN_REQUIRED') ? error.message : 'PRO_CONNECTION_ERROR');
    return data;
  },
};
