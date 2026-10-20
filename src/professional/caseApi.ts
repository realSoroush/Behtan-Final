import { supabase } from "@/lib/supabaseClient";
import { rpc } from "./api";
import type { ProMembership } from "./contracts";
import type {
  CaseRecord,
  CaseAccess,
  CaseIntake,
  IntakeRevision,
  CaseAssignment,
  CasePermission,
  PermissionPurpose,
} from "./intake";
async function readRows<T>(
  table: string,
  columns: string,
  org: string,
  record?: string,
  order?: string,
): Promise<T[]> {
  let query = supabase.from(table).select(columns).eq("organization_id", org);
  if (record) query = query.eq("record_id", record);
  if (order) query = query.order(order, { ascending: false });
  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);
  return data as unknown as T[];
}
export const caseApi = {
  records: (org: string) =>
    readRows<CaseRecord>(
      "pro_case_records",
      "id,organization_id,case_code,created_at",
      org,
      undefined,
      "created_at",
    ),
  members: (org: string) =>
    readRows<ProMembership>(
      "pro_memberships",
      "organization_id,user_id,roles,status",
      org,
    ),
  create: (org: string, key: string) =>
    rpc<unknown>("pro_create_case", { p_org: org, p_key: key }),
  access: (org: string, record: string) =>
    rpc<CaseAccess>("pro_case_access", { p_org: org, p_record: record }),
  async latest(org: string, record: string): Promise<IntakeRevision | null> {
    const { data, error } = await supabase
      .from("pro_intake_revisions")
      .select("revision,answers,recorded_at,recorded_by")
      .eq("organization_id", org)
      .eq("record_id", record)
      .order("revision", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return (data[0] as IntakeRevision) || null;
  },
  history: (org: string, record: string) =>
    readRows<IntakeRevision>(
      "pro_intake_revisions",
      "revision,answers,recorded_at,recorded_by",
      org,
      record,
      "revision",
    ),
  assignments: (org: string, record: string) =>
    readRows<CaseAssignment>(
      "pro_case_assignments",
      "practitioner_id,status",
      org,
      record,
    ),
  permissions: (org: string, record: string) =>
    rpc<CasePermission[]>("pro_case_permission_summary", {
      p_org: org,
      p_record: record,
    }),
  assign: (
    org: string,
    record: string,
    practitioner: string,
    active: boolean,
    key: string,
  ) =>
    rpc<unknown>("pro_assign_case", {
      p_org: org,
      p_record: record,
      p_practitioner: practitioner,
      p_active: active,
      p_key: key,
    }),
  permission: (
    org: string,
    record: string,
    purpose: PermissionPurpose,
    decision: "grant" | "revoke",
    expires: string | null,
    key: string,
  ) =>
    rpc<unknown>("pro_simulate_case_permission", {
      p_org: org,
      p_record: record,
      p_purpose: purpose,
      p_decision: decision,
      p_expires: expires,
      p_key: key,
    }),
  save: (
    org: string,
    record: string,
    expected: number,
    answers: CaseIntake,
    key: string,
  ) =>
    rpc<unknown>("pro_save_intake", {
      p_org: org,
      p_record: record,
      p_expected: expected,
      p_answers: answers,
      p_key: key,
    }),
};
