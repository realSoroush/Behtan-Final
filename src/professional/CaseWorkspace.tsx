import { useCallback, useEffect, useRef, useState } from "react";
import { caseApi } from "./caseApi";
import {
  proErrorMessage,
  canCreateSandboxPatient,
  type ProRole,
  type ProMembership,
} from "./contracts";
import { CaseIntakeForm } from "./CaseIntakeForm";
import {
  permissionState,
  syntheticIntake,
  type CaseRecord,
  type CaseAccess,
  type CasePermission,
  type CaseAssignment,
  type CaseIntake,
  type IntakeRevision,
  type PermissionPurpose,
} from "./intake";
import { requestKey, clearRequestKey } from "./requestKeys";
const purposeLabels: Record<PermissionPurpose, string> = {
  processing: "پردازش اطلاعات",
  relationship: "پذیرش ارتباط",
  progress_sharing: "اشتراک پیشرفت",
};
function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
export function CaseWorkspace({
  org,
  userId,
  roles,
}: {
  org: string;
  userId: string;
  roles: ProRole[];
}) {
  const [records, setRecords] = useState<CaseRecord[]>([]),
    [selected, setSelected] = useState<CaseRecord | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    pending = useRef(false);
  const [createKey] = useState(() =>
    requestKey(`${userId}.${org}.new-case`, storage()),
  );
  const activeCreate = useRef(createKey);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await caseApi.records(org);
      if (mounted.current) setRecords(data);
    } catch (e) {
      if (mounted.current) setError(proErrorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [org]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  async function create() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await caseApi.create(org, activeCreate.current);
      clearRequestKey(`${userId}.${org}.new-case`, storage());
      activeCreate.current = requestKey(`${userId}.${org}.new-case`, storage());
      if (mounted.current) await load();
    } catch (e) {
      if (mounted.current) setError(proErrorMessage(e));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (selected)
    return (
      <CaseDetail
        key={selected.id}
        org={org}
        userId={userId}
        record={selected}
        onBack={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  return (
    <section className="pro-panel pro-record-workspace" aria-busy={busy}>
      <div className="pro-toolbar">
        <h2>پرونده و اطلاعات ورودی</h2>
        <div className="pro-actions">
          <button disabled={busy} onClick={() => void load()}>
            دریافت پرونده‌ها
          </button>
          {canCreateSandboxPatient(roles) && (
            <button
              className="pro-primary"
              disabled={busy}
              onClick={() => void create()}
            >
              ساخت پروندهٔ جدید
            </button>
          )}
        </div>
      </div>
      <p className="pro-muted">
        فقط سناریوهای مصنوعی؛ پرونده‌های فاز اول جدا باقی مانده‌اند. نام، شماره،
        تصویر و اطلاعات فرد واقعی ثبت نکنید.
      </p>
      {error && (
        <p className="pro-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">در حال دریافت پرونده‌ها…</p>}
      {!busy && !error && records.length === 0 && (
        <p>هنوز پرونده‌ای در دسترس شما نیست.</p>
      )}
      <ul className="pro-cases">
        {records.map((r) => (
          <li key={r.id}>
            <div>
              <strong>سناریوی مصنوعی</strong>
              <code dir="ltr">{r.case_code}</code>
            </div>
            <button onClick={() => setSelected(r)}>بازکردن پرونده</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
function CaseDetail({
  org,
  userId,
  record,
  onBack,
}: {
  org: string;
  userId: string;
  record: CaseRecord;
  onBack: () => void;
}) {
  const [access, setAccess] = useState<CaseAccess | null>(null),
    [members, setMembers] = useState<ProMembership[]>([]),
    [assignees, setAssignees] = useState<CaseAssignment[]>([]),
    [permissions, setPermissions] = useState<CasePermission[]>([]);
  const [history, setHistory] = useState<IntakeRevision[]>([]),
    [form, setForm] = useState<CaseIntake | null>(null),
    [expected, setExpected] = useState(0),
    [viewRevision, setViewRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [masked, setMasked] = useState(false),
    [practitioner, setPractitioner] = useState("");
  const [conflict, setConflict] = useState(false);
  const loading = useRef(false);
  const assignmentRetry = useRef<Record<string, string>>({});
  const mounted = useRef(true),
    pending = useRef(false),
    sequence = useRef(0),
    retry = useRef<null | {
      answers: CaseIntake;
      expected: number;
      key: string;
    }>(null);
  const permissionRetry = useRef<
    Record<string, { key: string; expires: string | null }>
  >({});
  const clearHealth = () => {
    setForm(null);
    setHistory([]);
    setExpected(0);
    setViewRevision(null);
    retry.current = null;
    setConflict(false);
  };
  const reload = useCallback(async () => {
    const seq = ++sequence.current;
    loading.current = true;
    setBusy(true);
    setError("");
    setMasked(true);
    clearHealth();
    setAccess(null);
    try {
      const a = await caseApi.access(org, record.id);
      if (!mounted.current || seq !== sequence.current) return;
      setAccess(a);
      const [p, assign, team, h] = await Promise.all([
        caseApi.permissions(org, record.id),
        caseApi.assignments(org, record.id),
        a.can_manage ? caseApi.members(org) : Promise.resolve([]),
        a.can_edit ? caseApi.history(org, record.id) : Promise.resolve([]),
      ]);
      if (!mounted.current || seq !== sequence.current) return;
      setPermissions(p);
      setAssignees(assign);
      setMembers(team);
      setHistory(h);
      setExpected(h[0]?.revision || 0);
      setForm(a.can_edit ? h[0]?.answers || syntheticIntake() : null);
      setMasked(false);
    } catch (e) {
      if (mounted.current && seq === sequence.current) {
        setError(proErrorMessage(e));
        clearHealth();
        setAccess(null);
      }
    } finally {
      loading.current = false;
      if (mounted.current && seq === sequence.current) setBusy(false);
    }
  }, [org, record.id]);
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, [reload]);
  useEffect(() => {
    const check = async () => {
      if (document.hidden) {
        setMasked(true);
        return;
      }
      if (pending.current || loading.current) return;
      const seq = ++sequence.current;
      setMasked(true);
      try {
        const a = await caseApi.access(org, record.id);
        if (!mounted.current || seq !== sequence.current) return;
        setAccess(a);
        if (!a.can_edit) clearHealth();
        setMasked(false);
      } catch (e) {
        if (mounted.current && seq === sequence.current) {
          clearHealth();
          setAccess(null);
          setError(proErrorMessage(e));
        }
      }
    };
    const focus = () => {
      void check();
    };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 30000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("focus", focus);
    };
  }, [org, record.id]);
  async function mutate(operation: () => Promise<unknown>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      if (mounted.current) {
        await reload();
        setNotice(success);
      }
    } catch (e) {
      if (mounted.current) {
        setError(proErrorMessage(e));
        if (e instanceof Error && e.message.includes("PRO_INVALID_INTAKE"))
          retry.current = null;
        if (e instanceof Error && e.message.includes("PRO_STALE_REVISION"))
          setConflict(true);
        if (e instanceof Error && /ACCESS_DENIED/.test(e.message)) {
          clearHealth();
          setAccess(null);
        }
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function assign(active: boolean) {
    const id = `${practitioner}.${active}`;
    const key = (assignmentRetry.current[id] ||= crypto.randomUUID());
    await mutate(
      async () => {
        await caseApi.assign(org, record.id, practitioner, active, key);
        delete assignmentRetry.current[id];
      },
      active ? "تخصیص ثبت شد." : "تخصیص لغو شد.",
    );
  }
  async function permission(
    purpose: PermissionPurpose,
    decision: "grant" | "revoke",
  ) {
    const id = `${purpose}.${decision}`;
    const request = (permissionRetry.current[id] ||= {
      key: crypto.randomUUID(),
      expires:
        decision === "grant"
          ? new Date(Date.now() + 7 * 86400000).toISOString()
          : null,
    });
    await mutate(async () => {
      await caseApi.permission(
        org,
        record.id,
        purpose,
        decision,
        request.expires,
        request.key,
      );
      delete permissionRetry.current[id];
    }, "رویداد مجوز آزمایش ثبت شد.");
  }
  async function save() {
    if (!form) return;
    const request = retry.current || {
      answers: structuredClone(form),
      expected,
      key: crypto.randomUUID(),
    };
    retry.current = request;
    await mutate(
      () =>
        caseApi.save(
          org,
          record.id,
          request.expected,
          request.answers,
          request.key,
        ),
      "نسخهٔ جدید ذخیره شد.",
    );
  }
  const dirty =
    form !== null &&
    JSON.stringify(form) !==
      JSON.stringify(history[0]?.answers || syntheticIntake());
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function discard() {
    return !dirty || window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟");
  }
  const shown =
    viewRevision === null
      ? form
      : history.find((h) => h.revision === viewRevision)?.answers || null;
  return (
    <section className="pro-panel pro-record-workspace" aria-busy={busy}>
      <div className="pro-toolbar">
        <div>
          <h2>پروندهٔ مصنوعی</h2>
          <code className="pro-case-code" dir="ltr">
            {record.case_code}
          </code>
        </div>
        <div className="pro-actions">
          <button
            disabled={busy}
            onClick={() => {
              if (discard()) onBack();
            }}
          >
            فهرست پرونده‌ها
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (!conflict && !discard()) return;
              setNotice("");
              void reload();
            }}
          >
            دریافت آخرین نسخه
          </button>
        </div>
      </div>
      <p className="pro-muted">
        این بخش رضایت و صلاحیت حرفه‌ای واقعی ثبت نمی‌کند. مجوزهای پایین فقط برای
        آزمون سناریوی مصنوعی‌اند.
      </p>
      {error && (
        <p className="pro-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="pro-success">
          {notice}
        </p>
      )}
      {busy && <p role="status">در حال بررسی و ذخیره…</p>}
      {access?.can_manage && (
        <details className="pro-permissions" open={!access.can_edit}>
          <summary>تخصیص متخصص و مجوزهای آزمایش</summary>
          <div className="pro-form-grid">
            <label>
              متخصص آزمایش
              <select
                aria-label="متخصص آزمایش"
                value={practitioner}
                onChange={(e) => setPractitioner(e.target.value)}
                disabled={busy}
              >
                <option value="">انتخاب عضو</option>
                {members
                  .filter(
                    (m) =>
                      m.status === "active" && m.roles.includes("practitioner"),
                  )
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === userId ? "خودم" : m.user_id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="pro-actions">
              <button
                disabled={busy || !practitioner}
                onClick={() => void assign(true)}
              >
                تخصیص پرونده
              </button>
              <button
                disabled={
                  busy ||
                  !practitioner ||
                  !assignees.some(
                    (a) =>
                      a.practitioner_id === practitioner &&
                      a.status === "active",
                  )
                }
                onClick={() => void assign(false)}
              >
                لغو تخصیص
              </button>
            </div>
          </div>
          <ul className="pro-permission-list">
            {(
              [
                "processing",
                "relationship",
                "progress_sharing",
              ] as PermissionPurpose[]
            ).map((p) => {
              const state = permissionState(permissions, p);
              return (
                <li key={p}>
                  <div>
                    <strong>{purposeLabels[p]}</strong>
                    <span>
                      {
                        {
                          missing: "ثبت نشده",
                          granted: "فعال — آزمایشی",
                          revoked: "لغوشده",
                          expired: "منقضی‌شده",
                        }[state]
                      }
                    </span>
                  </div>
                  <div className="pro-actions">
                    <button
                      disabled={busy || state === "granted"}
                      onClick={() => void permission(p, "grant")}
                    >
                      اعطای آزمایشی {purposeLabels[p]}
                    </button>
                    <button
                      disabled={busy || state !== "granted"}
                      onClick={() => void permission(p, "revoke")}
                    >
                      لغو {purposeLabels[p]}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {access && !access.can_edit && (
        <div className="pro-empty">
          <h3>اطلاعات سلامت در دسترس نیست</h3>
          <p>
            نقش متخصص، تخصیص فعال پرونده، مجوز تخصصی آزمایش از مدیر سامانه و
            مجوز پردازش معتبر لازم‌اند. مالکیت سازمان به‌تنهایی کافی نیست.
          </p>
        </div>
      )}
      {masked && access?.can_edit && (
        <p role="status">در حال بررسی مجدد دسترسی…</p>
      )}
      {access?.can_edit && shown && (
        <div hidden={masked}>
          <div className="pro-toolbar">
            <h3>
              {viewRevision === null
                ? `اطلاعات ورودی · آخرین نسخه ${expected.toLocaleString("fa-IR")}`
                : `نمایش نسخهٔ ${viewRevision.toLocaleString("fa-IR")} · فقط خواندنی`}
            </h3>
            <label>
              تاریخچه
              <select
                aria-label="تاریخچهٔ اطلاعات"
                disabled={busy}
                value={viewRevision ?? ""}
                onChange={(e) =>
                  setViewRevision(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              >
                <option value="">ویرایش آخرین نسخه</option>
                {history.map((h) => (
                  <option key={h.revision} value={h.revision}>
                    نسخهٔ {h.revision.toLocaleString("fa-IR")} ·{" "}
                    {new Date(h.recorded_at).toLocaleString("fa-IR")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CaseIntakeForm
            key={viewRevision ?? "current"}
            value={shown}
            disabled={busy || viewRevision !== null || Boolean(retry.current)}
            onChange={(a) => {
              setForm(a);
              setNotice("");
            }}
          />
          {viewRevision === null && (
            <div className="pro-toolbar pro-save-row">
              <p>هر ذخیره، نسخهٔ جدید می‌سازد؛ سابقه بازنویسی نمی‌شود.</p>
              <button
                className="pro-primary"
                disabled={busy || conflict || !form?.safety_confirmed}
                onClick={() => void save()}
              >
                {conflict
                  ? "ابتدا آخرین نسخه را دریافت کنید"
                  : retry.current
                    ? "تلاش مجدد همان ذخیره"
                    : "ذخیرهٔ اطلاعات آزمایشی"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
