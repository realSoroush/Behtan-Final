import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Building2,
  FlaskConical,
  Plus,
  RefreshCw,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PhoneAuth } from "@/components/PhoneAuth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
const CaseWorkspace = lazy(() =>
  import("./CaseWorkspace").then((m) => ({ default: m.CaseWorkspace })),
);
import { proApi } from "./api";
import { requestKey, clearRequestKey } from "./requestKeys";
import {
  canCreateSandboxPatient,
  proErrorMessage,
  type ProOrganization,
  type ProMembership,
  type SandboxPatient,
} from "./contracts";
function safeStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
const rolesFa = { owner: "مالک", assistant: "پذیرش", practitioner: "متخصص" };

export function ProApp() {
  if (import.meta.env.VITE_PRO_SANDBOX_ENABLED !== "true")
    return (
      <main className="pro-app" dir="rtl">
        <div className="pro-empty">
          <ShieldCheck size={40} />
          <h1>به‌تن حرفه‌ای</h1>
          <p>این محیط هنوز برای دسترسی عمومی فعال نشده است.</p>
        </div>
      </main>
    );
  return <ProSession />;
}
function ProSession() {
  const { user, loading, signOut } = useAuth();
  const [error, setError] = useState("");
  if (loading)
    return (
      <main className="pro-app" dir="rtl" aria-busy="true">
        <p role="status">در حال بررسی ورود…</p>
      </main>
    );
  if (!user) return <PhoneAuth />;
  return (
    <div className="pro-app" dir="rtl">
      <header className="pro-header">
        <div className="pro-brand">
          <Building2 />
          <strong>به‌تن حرفه‌ای</strong>
          <span>آزمایش داخلی</span>
        </div>
        <div className="pro-actions">
          <ThemeToggle className="pro-theme" />
          <button
            aria-label="خروج از حساب"
            onClick={() => {
              setError("");
              void signOut().catch((e) => setError(proErrorMessage(e)));
            }}
          >
            <LogOut size={18} /> خروج
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="pro-error">
          {error}
        </p>
      )}
      <ProWorkspace key={user.id} userId={user.id} />
    </div>
  );
}
function ProWorkspace({ userId }: { userId: string }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [organizations, setOrganizations] = useState<ProOrganization[]>([]);
  const [memberships, setMemberships] = useState<ProMembership[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showRecords, setShowRecords] = useState(false);
  const [patients, setPatients] = useState<SandboxPatient[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orgRequest] = useState(() =>
    requestKey(`${userId}.organization`, safeStorage()),
  );
  const patientRequests = useRef<Record<string, string>>({});
  const generation = useRef(0);
  const pending = useRef(false);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setBusy(true);
    setError("");
    setPatients([]);
    try {
      const access = await proApi.status();
      if (version !== generation.current) return;
      setAllowed(access);
      if (!access) {
        setOrganizations([]);
        setMemberships([]);
        setSelectedId("");
        return;
      }
      const data = await proApi.workspaces();
      if (version !== generation.current) return;
      setOrganizations(data.organizations);
      setMemberships(data.memberships);
      const id = data.organizations.some((o) => o.id === selectedRef.current)
        ? selectedRef.current
        : data.organizations[0]?.id || "";
      setSelectedId(id);
      if (id) {
        const rows = await proApi.patients(id);
        if (version === generation.current) setPatients(rows);
      }
    } catch (e) {
      if (version === generation.current) {
        setError(proErrorMessage(e));
        setOrganizations([]);
        setMemberships([]);
      }
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const onFocus = () => {
      if (!pending.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  async function selectOrganization(id: string) {
    const version = ++generation.current;
    setSelectedId(id);
    setPatients([]);
    setError("");
    setBusy(true);
    try {
      const rows = await proApi.patients(id);
      if (version === generation.current) setPatients(rows);
    } catch (e) {
      if (version === generation.current) setError(proErrorMessage(e));
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  async function create(kind: "organization" | "patient") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "organization") await proApi.createOrganization(orgRequest);
      else {
        const scope = `${userId}.patient.${selectedId}`;
        const key = (patientRequests.current[selectedId] ||= requestKey(
          scope,
          safeStorage(),
        ));
        await proApi.createPatient(selectedId, key);
        clearRequestKey(scope, safeStorage());
        delete patientRequests.current[selectedId];
      }
      await refresh();
    } catch (e) {
      setError(proErrorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const roles =
    memberships.find(
      (m) =>
        m.organization_id === selectedId &&
        m.user_id === userId &&
        m.status === "active",
    )?.roles || [];
  return (
    <main aria-busy={busy}>
      <section className="pro-intro">
        <div>
          <p className="pro-eyebrow">یک زیرساخت، تجربه‌ای مشترک</p>
          <h1>محیط کاری شما</h1>
          <p>پروندهٔ آزمایشی، مجوز روشن و اطلاعات نسخه‌بندی‌شده.</p>
        </div>
        <FlaskConical size={44} />
      </section>
      <aside className="pro-notice">
        <strong>فقط دادهٔ مصنوعی</strong>
        <p>
          فقط اطلاعات ساختگی ثبت کنید؛ نام و شمارهٔ فرد واقعی وارد نشود. تولید
          رژیم، دعوت بیمار و ارسال پیامک در این فاز فعال نیست.
        </p>
      </aside>
      {error && (
        <p className="pro-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">در حال دریافت اطلاعات…</p>}
      <div className="pro-toolbar">
        <h2>فضای کاری</h2>
        <button disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={17} /> دریافت مجدد
        </button>
      </div>
      {allowed === false && (
        <div className="pro-empty">
          <ShieldCheck />
          <h2>دسترسی آزمایش لازم است</h2>
          <p>
            ورود با شمارهٔ تأییدشده کافی نیست. مدیر آزمایش باید دسترسی زمان‌دار
            شما را ثبت کند.
          </p>
        </div>
      )}
      {allowed && organizations.length === 0 && !busy && !error && (
        <div className="pro-empty">
          <Building2 size={38} />
          <h2>اولین محیط آزمایش را بسازید</h2>
          <p>این کار اشتراک یا پرونده‌ای در اپ اصلی ایجاد نمی‌کند.</p>
          <button
            className="pro-primary"
            onClick={() => void create("organization")}
          >
            ساخت محیط آزمایش
          </button>
        </div>
      )}
      {organizations.length > 0 && (
        <>
          <label className="pro-select">
            سازمان
            <select
              aria-label="انتخاب سازمان"
              value={selectedId}
              disabled={busy}
              onChange={(e) => void selectOrganization(e.target.value)}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <p className="pro-role">
            نقش شما: {roles.map((r) => rolesFa[r]).join("، ")}
            <span>مالکیت به‌تنهایی مجوز درمان یا تأیید برنامه نیست.</span>
          </p>
          <div className="pro-tabs" role="group" aria-label="بخش‌های محیط کاری">
            <button
              aria-pressed={showRecords}
              onClick={() => setShowRecords(true)}
            >
              پرونده‌ها و اطلاعات ورودی
            </button>
            <button
              aria-pressed={!showRecords}
              onClick={() => setShowRecords(false)}
            >
              آزمایش سریع فاز اول
            </button>
          </div>
          {showRecords ? (
            <Suspense fallback={<p role="status">در حال بازکردن پرونده‌ها…</p>}>
              <CaseWorkspace
                key={selectedId}
                org={selectedId}
                userId={userId}
                roles={roles}
              />
            </Suspense>
          ) : (
            <section className="pro-panel">
              <div className="pro-toolbar">
                <h2>
                  پرونده‌های مصنوعی{" "}
                  <small>({patients.length.toLocaleString("fa-IR")})</small>
                </h2>
                {canCreateSandboxPatient(roles) && (
                  <button
                    className="pro-primary"
                    disabled={busy}
                    onClick={() => void create("patient")}
                  >
                    <Plus size={18} /> پروندهٔ آزمایشی
                  </button>
                )}
              </div>
              {patients.length === 0 && !busy && (
                <p className="pro-muted">پروندهٔ قابل دسترسی ندارید.</p>
              )}
              <ul className="pro-cases">
                {patients.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>مراجع مصنوعی</strong>
                      <code dir="ltr">{p.case_code}</code>
                    </div>
                    <time dateTime={p.created_at}>
                      {new Date(p.created_at).toLocaleDateString("fa-IR")}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
