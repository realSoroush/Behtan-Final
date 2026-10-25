import {track} from '../member/analytics';
import {ProOnboarding} from './ProOnboarding';
import {paymentRequest} from '../lib/payments';
import {PanelModal} from "@/components/ui/PanelModal";
import { ProSubscription } from "./ProSubscription";
import { PanelSelect } from "@/components/ui/PanelSelect";
import { ArrowUpLeft, FolderHeart, LifeBuoy, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { ProServiceCheck } from './ProServiceCheck';
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
  const authenticatedUserId = user?.id;
  useEffect(()=>{if(authenticatedUserId)track('app_open',{source:'pro'});},[authenticatedUserId]);
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
    <div className="pro-app pro-shell" dir="rtl">
      <a className="pro-skip" href="#pro-workspace">رفتن به فضای کاری</a>
      <aside className="pro-sidebar" aria-label="راهنمای پنل">
        <a href="#pro-workspace" className="pro-wordmark" aria-label="به‌تن حرفه‌ای، فضای کاری">
          <img src="/behtan-logo.png" width="36" height="44" alt="" />
          <span><strong>به‌تن</strong><small>PROFESSIONAL</small></span>
        </a>
        <div className="pro-sidebar-section">پنل برنامه‌دهی</div>
        <nav aria-label="ناوبری اصلی">
          <a href="#pro-workspace" className="pro-nav-link" aria-current="page"><FolderHeart size={20} />فضای کاری<ArrowUpLeft size={15} /></a>
          <a href="#pro-support" className="pro-nav-link"><LifeBuoy size={20} />راهنمای استفاده</a>
        </nav>
        <div className="pro-sidebar-note">
          <Sparkles size={22} />
          <strong>تمرکز روی مراجع،<br />جزئیات با به‌تن.</strong>
          <p>از اولین گفت‌وگو تا برنامه‌ای آمادهٔ ارائه.</p>
        </div>
        <div className="pro-sidebar-footer"><ShieldCheck size={16} /><span>فضای اختصاصی شما</span></div>
      </aside>
      <div className="pro-content">
        <header className="pro-header">
          <div className="pro-brand"><span className="pro-mobile-logo"><img src="/behtan-logo.png" alt="" /></span><strong>به‌تن حرفه‌ای</strong><span className="pro-header-divider">/</span><span className="pro-header-caption">پنل برنامه‌دهی</span></div>
          <div className="pro-actions">
            <a className="pro-help-link" href="#pro-support" aria-label="راهنمای استفاده"><LifeBuoy size={18} /></a>
            <ThemeToggle className="pro-theme" />
            <button className="pro-signout" aria-label="خروج" onClick={() => void signOut()}><LogOut size={17} /><span>خروج</span></button>
          </div>
        </header>
        <Workspace key={user.id} userId={user.id} />
      </div>
    </div>
  );
}
function Workspace({ userId }: { userId: string }) {
  const [panel,setPanel]=useState("cases"),[subscriptionBusy,setSubscriptionBusy]=useState(false);
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
    let alive=true,verifying=false;
    const refresh=async()=>{
      if(verifying||pending.current)return;
      const token=new URLSearchParams(window.location.search).get('payment');
      if(!token){await load();return;}
      verifying=true;
      try{
        const result=await paymentRequest<{order:{status:string}}>({action:'verify',token});
        if(!alive)return;
        if(result.order.status!=='paid'){
          setError(result.order.status==='failed'?'پرداخت تأیید نشد. برای بررسی دوباره صفحه را تازه کن.':'نتیجهٔ پرداخت هنوز قطعی نیست. برای بررسی دوباره صفحه را تازه کن.');setBusy(false);return;
        }
        window.history.replaceState(null,'',window.location.pathname);await load();
      }catch{if(alive){setError('تأیید پرداخت انجام نشد؛ صفحه را دوباره باز کن.');setBusy(false);}}
      finally{verifying=false;}
    };
    void refresh();
    const focus=()=>{void refresh();};
    window.addEventListener("focus", focus);
    return () => {
      alive=false;
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
    <main id="pro-workspace" tabIndex={-1}>
      <section className="pro-intro">
        <div>
          <p className="pro-eyebrow"><span /> فضای کاری حرفه‌ای شما</p>
          <h1>برنامه‌ریزی بهتر،<br className="pro-mobile-break" /> همراهی نزدیک‌تر.</h1>
          <p>پرونده مراجع را کامل کنید؛ برنامه تخصصی را آماده و ارائه کنید.</p>
        </div>
        {orgs.length > 0 && <label className="pro-select pro-workspace-picker">
          <span>فضای کاری</span>
          <PanelSelect aria-label="فضای کاری" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={busy}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name === "کلینیک آزمایشی" ? "فضای کاری به‌تن" : o.name}</option>)}
          </PanelSelect>
        </label>}
      </section>
      {error && (
        <p className="pro-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">در حال دریافت فضای کاری…</p>}
      {allowed === false && (
        <ProOnboarding onComplete={()=>void load()}/>
      )}
      {allowed && !orgs.length && !busy && !error && (
        <button className="pro-primary" onClick={() => void create()}>
          ساخت فضای کاری
        </button>
      )}
      {orgs.length > 0 && (
        <>
          <nav className="pro-workspace-tabs" aria-label="بخش‌های فضای کاری"><button aria-pressed={panel==='cases'} onClick={()=>setPanel('cases')}>مراجعان و برنامه‌ها</button><button aria-pressed={panel==='subscription'} onClick={()=>setPanel('subscription')}>اشتراک و ظرفیت</button></nav>
          <div><RealCaseWorkspace key={selected} org={selected} roles={roles} /></div>
          {panel==='subscription'&&<PanelModal title="اشتراک و ظرفیت" busy={subscriptionBusy} onClose={()=>setPanel('cases')}><ProSubscription onBusy={setSubscriptionBusy} key={selected} org={selected}/><details><summary>انتخاب یا ارتقای اشتراک</summary><ProOnboarding existing onComplete={()=>void load()}/></details></PanelModal> }
        </>
      )}
      <section id="pro-support" className="pro-support">
        <div className="pro-support-heading"><LifeBuoy size={19} /><h2>کنار شما، در هر مرحله</h2></div>
        <div className="pro-help-grid">
          <p><b>۱. پرونده را کامل کنید</b><span>مشخصات، هدف و ترجیحات مراجع را ثبت و ذخیره کنید.</span></p>
          <p><b>۲. برنامه را بسازید</b><span>تعداد منوها و تاریخ را انتخاب و نتیجه را بررسی کنید.</span></p>
          <p><b>۳. آمادهٔ ارائه</b><span>برنامه را ذخیره و نسخه PDF را از پنجره چاپ دریافت کنید.</span></p>
        </div>
        <details className="pro-service-details"><summary>بررسی فنی سرویس ساخت برنامه</summary><ProServiceCheck /></details>
      </section>
    </main>
  );
}
