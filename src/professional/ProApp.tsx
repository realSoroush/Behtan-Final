import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { PhoneAuth } from "@/components/PhoneAuth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { proApi } from "./api";
import {
  proErrorMessage,
  type ProMembership,
  type ProOrganization,
} from "./contracts";
import { RealCaseWorkspace } from "./RealCaseWorkspace";
export function ProApp() {
  const { user, loading, signOut } = useAuth();
  if (import.meta.env.VITE_PRO_SANDBOX_ENABLED !== "true")
    return (
      <main className="pro-app" dir="rtl">
        <h1>به‌تن حرفه‌ای</h1>
        <p>این محیط فعال نشده است.</p>
      </main>
    );
  if (loading)
    return (
      <main className="pro-app" dir="rtl">
        <p role="status">در حال بررسی ورود…</p>
      </main>
    );
  if (!user) return <PhoneAuth />;
  return (
    <div className="pro-app" dir="rtl">
      <header className="pro-header">
        <div className="pro-brand">
          <strong>به‌تن حرفه‌ای</strong>
          <span>پرونده و برنامه غذایی</span>
        </div>
        <div className="pro-actions">
          <ThemeToggle className="pro-theme" />
          <button onClick={() => void signOut()}>خروج</button>
        </div>
      </header>
      <Workspace key={user.id} userId={user.id} />
    </div>
  );
}
function Workspace({ userId }: { userId: string }) {
  const [orgs, setOrgs] = useState<ProOrganization[]>([]),
    [members, setMembers] = useState<ProMembership[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [allowed, setAllowed] = useState<boolean | null>(null),
    [error, setError] = useState("");
  const seq = useRef(0),
    createKey = useRef(crypto.randomUUID()),
    pending = useRef(false);
  const load = useCallback(async () => {
    const n = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const access = await proApi.status();
      if (seq.current !== n) return;
      setAllowed(access);
      if (!access) {
        setOrgs([]);
        setMembers([]);
        return;
      }
      const data = await proApi.workspaces();
      if (seq.current !== n) return;
      setOrgs(data.organizations);
      setMembers(data.memberships);
      setSelected((s) =>
        data.organizations.some((o) => o.id === s)
          ? s
          : data.organizations[0]?.id || "",
      );
    } catch (e) {
      if (seq.current === n) {
        // A network outage must not unmount a case with unsaved edits.
        // An explicit pilot-status false above still clears access immediately.
        setError(proErrorMessage(e));
      }
    } finally {
      if (seq.current === n) setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const focus = () => {
      if (!pending.current) void load();
    };
    window.addEventListener("focus", focus);
    return () => {
      seq.current++;
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  async function create() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await proApi.createOrganization(createKey.current);
      await load();
    } catch (e) {
      setError(proErrorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const roles =
    members.find(
      (m) =>
        m.organization_id === selected &&
        m.user_id === userId &&
        m.status === "active",
    )?.roles || [];
  return (
    <main>
      <section className="pro-intro">
        <div>
          <p className="pro-eyebrow">از اطلاعات مراجع تا برنامه غذایی</p>
          <h1>فضای کاری شما</h1>
          <p>ثبت پرونده، ویرایش پاسخ‌ها، تولید منو و خروجی PDF.</p>
        </div>
      </section>
      {error && (
        <p className="pro-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">در حال دریافت فضای کاری…</p>}
      {allowed === false && (
        <p className="pro-empty">دسترسی این حساب به پنل فعال نیست.</p>
      )}
      {allowed && !orgs.length && !busy && !error && (
        <button className="pro-primary" onClick={() => void create()}>
          ساخت فضای کاری
        </button>
      )}
      {orgs.length > 0 && (
        <>
          <label className="pro-select">
            فضای کاری
            <select
              aria-label="فضای کاری"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name === "کلینیک آزمایشی" ? "فضای کاری به‌تن" : o.name}
                </option>
              ))}
            </select>
          </label>
          <RealCaseWorkspace key={selected} org={selected} roles={roles} />
        </>
      )}
    </main>
  );
}
