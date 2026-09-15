import { canRenderSnapshot } from './validateSnapshot';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { PhoneAuth } from '@/components/PhoneAuth';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { MealCard } from '@/components/dashboard/MealCard';
import { MacroSummary } from '@/components/dashboard/MacroSummary';
import { NutritionQualitySummary } from '@/components/dashboard/NutritionQualitySummary';
import { evaluateDailyFoodQuality } from '@/utils/nutritionQuality';
import { getLocalDateKey } from '@/utils/dailyMealProgress';
import type { DailyMealPlan, MacroTargets } from '@/types';

type UserRow = { id: string; phone: string | null; email: string | null; created_at: string; last_sign_in_at: string | null; onboarding_completed: boolean | null; active_until: string | null; paid_toman: number };
type Plan = { code: string; name: string; is_active: boolean; price_toman: number };
type Subscription = { id: string; plan_code: string; mode: string; starts_at: string; expires_at: string; revoked_at: string | null; grant_source: string };
type Order = { id: string; plan_name: string; price_toman: number; mode: string; status: string; ref_id: string | null; created_at: string; user_id?: string; phone?: string };
type Saved = { updated_at: string; revision: number; snapshot: { schemaVersion: number; plan: DailyMealPlan; targets: MacroTargets; isWorkoutDay: boolean; profile: Record<string, unknown> } };
type Detail = { profile: Record<string, unknown> | null; subscriptions: Subscription[]; orders: Order[]; dates: string[]; saved_plan: Saved | null; checkins: unknown[]; audit: { id: string; action: string; reason: string; created_at: string; actor_id: string; before_data: unknown; after_data: unknown }[] };
type Overview = { stats: Record<string, number>; users: UserRow[]; plans: Plan[] };
const number = (n: number) => Number(n).toLocaleString('fa-IR');
const dateTime = (s: string | null) => s ? new Date(s).toLocaleString('fa-IR') : '—';
const money = (n: number) => n === 0 ? 'رایگان' : `${number(n)} تومان`;
const statuses: Record<string, string> = { creating: 'در حال ایجاد', pending: 'در انتظار تأیید', paid: 'تأییدشده', failed: 'ناموفق' };
function explain(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('ADMIN_REQUIRED')) return 'این حساب دسترسی مدیریت ندارد یا دسترسی آن لغو شده است.';
  if (message.includes('PENDING_ORDER_EXISTS')) return 'کاربر سفارش تعیین‌تکلیف‌نشده دارد؛ ابتدا نتیجهٔ آن را در جریان پرداخت بررسی کنید.';
  if (message.includes('ALREADY_ACTIVE')) return 'کاربر اشتراک فعال دارد؛ همان اشتراک را ویرایش کنید.';
  if (message.includes('STALE_SUBSCRIPTION')) return 'اشتراک قبلاً تغییر کرده؛ صفحه را تازه کنید و دوباره بررسی کنید.';
  if (message.includes('INVALID_EXPIRY')) return 'تاریخ پایان باید بعد از شروع اشتراک و حداکثر تا ۱۰ سال آینده باشد.';
  return `عملیات انجام نشد: ${message}`;
}
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
function JsonView({ value }: { value: unknown }) { return <pre dir="ltr" className="admin-json">{JSON.stringify(value, null, 2)}</pre>; }
function Orders({ orders }: { orders: Order[] }) {
  return <div className="admin-table"><table><thead><tr><th>تاریخ</th><th>پلن / کاربر</th><th>مبلغ</th><th>وضعیت</th><th>محیط</th><th>کد پیگیری</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td>{dateTime(o.created_at)}</td><td>{o.plan_name}<small>{o.phone}</small></td><td>{money(o.price_toman)}</td><td>{statuses[o.status] ?? o.status}</td><td>{o.mode}</td><td dir="ltr">{o.ref_id ?? '—'}</td></tr>)}</tbody></table>{orders.length === 0 && <p>پرداختی ثبت نشده است.</p>}</div>;
}
function PaymentBrowser() {
  const [page, setPage] = useState(0); const [status, setStatus] = useState(''); const [mode, setMode] = useState('live');
  const [rows, setRows] = useState<Order[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; setBusy(true); setError(''); rpc<Order[]>('admin_payments', { p_page: page, p_status: status, p_mode: mode }).then(r => { if (alive) setRows(r); }).catch(e => { if (alive) setError(explain(e)); }).finally(() => { if (alive) setBusy(false); }); return () => { alive = false; }; }, [page, status, mode]);
  return <section className="admin-card"><h2>پرداخت‌ها</h2><div className="admin-tools"><select aria-label="وضعیت پرداخت" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">همه وضعیت‌ها</option>{Object.entries(statuses).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select><select aria-label="محیط پرداخت" value={mode} onChange={e => { setMode(e.target.value); setPage(0); }}><option value="live">واقعی</option><option value="sandbox">آزمایشی</option></select></div>{error && <p role="alert">{error}</p>}{busy ? <p>در حال دریافت…</p> : <Orders orders={rows} />}<button disabled={busy || !page} onClick={() => setPage(p => p-1)}>قبلی</button><button disabled={busy || rows.length<50} onClick={() => setPage(p => p+1)}>بعدی</button></section>;
}
function Snapshot({ saved }: { saved: Saved | null }) {
  if (!saved) return <div className="admin-card">برای این روز نسخهٔ کامل برنامه ذخیره نشده است. کاربر باید نسخهٔ جدید اپ را باز کند؛ برنامهٔ قدیمی را بازسازی یا حدس نمی‌زنیم.</div>;
  const snap = saved.snapshot;
  if (!canRenderSnapshot(snap)) return <p role="alert">ساختار نسخهٔ ذخیره‌شده پشتیبانی نمی‌شود.</p>;
  const meals = snap.plan.meals;
  const sum = (consumedOnly: boolean): MacroTargets => meals.filter(m => !consumedOnly || m.consumed).reduce((a,m) => ({ targetCalories:a.targetCalories+m.totalKcal, proteinGrams:a.proteinGrams+m.totalProtein, carbGrams:a.carbGrams+m.totalCarbs, fatGrams:a.fatGrams+m.totalFat, proteinCal:0,carbCal:0,fatCal:0 }), { targetCalories:0,proteinGrams:0,carbGrams:0,fatGrams:0,proteinCal:0,carbCal:0,fatCal:0 });
  const total = sum(false);
  return <><p className="admin-note">آخرین همگام‌سازی: {dateTime(saved.updated_at)} · نسخه {number(saved.revision)} · نمای فقط‌خواندنی آخرین گزارش اپ؛ نه اتصال زنده به صفحهٔ کاربر.</p><div className="admin-plan"><MacroSummary targets={snap.targets} consumed={sum(true)} isWorkoutDay={snap.isWorkoutDay} /><div className="admin-card">جمع کل برنامه: {number(Math.round(total.targetCalories))} کالری · پروتئین {number(Math.round(total.proteinGrams))} · کربوهیدرات {number(Math.round(total.carbGrams))} · چربی {number(Math.round(total.fatGrams))} گرم</div><NutritionQualitySummary quality={evaluateDailyFoodQuality(meals, snap.targets.targetCalories)} />{meals.map(m => <MealCard key={m.slot} meal={m} readOnly onToggleConsumed={() => {}} onSwapComponent={() => {}} />)}</div><details><summary>دادهٔ کامل برنامه و ورودی محاسبات در زمان ثبت</summary><JsonView value={snap} /></details></>;
}
function SubscriptionEditor({ userId, subscription, plans, onDone, onCancel }: { userId: string; subscription: Subscription | null; plans: Plan[]; onDone: () => void; onCancel: () => void }) {
  const [action, setAction] = useState(subscription ? 'expiry' : 'grant');
  const [plan, setPlan] = useState(subscription?.plan_code ?? plans.find(p => p.is_active)?.code ?? '');
  const toLocal = (d: Date) => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const [expiry, setExpiry] = useState(toLocal(subscription ? new Date(subscription.expires_at) : new Date(Date.now()+30*86400000)));
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useRef<{ key: string; id: string } | null>(null);
  const submit = async () => {
    if (!window.confirm(`تغییر اشتراک کاربر ${userId} ثبت شود؟\n${action === 'revoke' ? 'قطع فوری دسترسی' : `پایان: ${dateTime(new Date(expiry).toISOString())}`}\nدلیل: ${reason}`)) return;
    setBusy(true); setError('');
    try {
      const args = { p_user: userId, p_action: action, p_subscription: subscription?.id ?? null, p_plan: plan, p_expiry: action === 'revoke' ? null : new Date(expiry).toISOString(), p_expected_expiry: subscription?.expires_at ?? null, p_reason: reason.trim() };
      const key = JSON.stringify(args); if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      await rpc('admin_change_subscription', { ...args, p_request: request.current.id }); onDone();
    } catch (e) { setError(explain(e)); } finally { setBusy(false); }
  };
  return <form className="admin-card" onSubmit={e => { e.preventDefault(); void submit(); }}><h3>{subscription ? 'ویرایش اشتراک' : 'اعطای اشتراک دستی'}</h3><p>این عملیات پرداخت یا بازپرداخت ثبت نمی‌کند. زمان‌ها به وقت دستگاه شما نمایش داده می‌شوند.</p>{subscription && <select aria-label="نوع تغییر" value={action} onChange={e => setAction(e.target.value)} disabled={busy}><option value="expiry">تغییر زمان پایان</option><option value="revoke">قطع فوری اشتراک</option></select>}{!subscription && <label>پلن<select value={plan} onChange={e => setPlan(e.target.value)} required disabled={busy}>{plans.filter(p => p.is_active).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>}{action !== 'revoke' && <label>پایان اشتراک<input type="datetime-local" required value={expiry} onChange={e => setExpiry(e.target.value)} disabled={busy} /><span className="admin-tools">{[-7,-1,1,7,30].map(days => <button type="button" key={days} disabled={busy || !expiry} onClick={() => setExpiry(toLocal(new Date(new Date(expiry).getTime()+days*86400000)))}>{days>0?'+':''}{days} روز</button>)}</span></label>}<label>دلیل تغییر<textarea minLength={3} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} disabled={busy} /></label>{error && <p role="alert">{error}</p>}<button disabled={busy || reason.trim().length<3}>{busy ? 'در حال ثبت…' : 'ثبت تغییر'}</button><button type="button" disabled={busy} onClick={onCancel}>انصراف</button></form>;
}
function UserDetail({ user, plans, onBack }: { user: UserRow; plans: Plan[]; onBack: () => void }) {
  const [date, setDate] = useState(getLocalDateKey()); const [detail, setDetail] = useState<Detail | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Subscription | null | undefined>(undefined);
  useEffect(() => { let alive = true; setLoading(true); setError(''); setDetail(null); rpc<Detail>('admin_user_detail', { p_user: user.id, p_date: date }).then(d => { if (alive) setDetail(d); }).catch(e => { if (alive) setError(explain(e)); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [user.id, date, refresh]);
  return <><div className="admin-tools"><button onClick={onBack}>بازگشت به کاربران</button><h2 dir="ltr">{user.phone ?? user.email ?? user.id}</h2><button onClick={() => setRefresh(n => n+1)} disabled={loading}>به‌روزرسانی</button></div><small dir="ltr">{user.id}</small>{error && <p role="alert">{error}</p>}{loading && <p>در حال دریافت اطلاعات…</p>}{detail && <><section className="admin-card"><h2>مشخصات کاربر</h2><p>عضویت: {dateTime(user.created_at)} · آخرین ورود: {dateTime(user.last_sign_in_at)}</p><p>آنبوردینگ: {detail.profile?.onboarding_completed ? 'تکمیل‌شده' : 'تکمیل‌نشده'} · قد: {String(detail.profile?.height ?? '—')} · وزن: {String(detail.profile?.weight ?? '—')} · هدف: {String(detail.profile?.goal ?? '—')}</p><details><summary>تمام اطلاعات پروفایل</summary><JsonView value={detail.profile} /></details></section><section className="admin-card"><h2>اشتراک‌ها</h2><button onClick={() => setEditor(null)}>اشتراک دستی جدید</button>{detail.subscriptions.length === 0 && <p>اشتراکی وجود ندارد.</p>}{detail.subscriptions.map(s => <div key={s.id} className="admin-sub"><b>{plans.find(p => p.code === s.plan_code)?.name ?? s.plan_code}</b><span>{s.mode} · {s.grant_source === 'admin' ? 'دستی' : 'پرداخت'} · {s.revoked_at ? 'لغوشده' : new Date(s.starts_at).getTime()>Date.now() ? 'شروع در آینده' : new Date(s.expires_at).getTime()>Date.now() ? 'فعال' : 'منقضی'}</span><span>شروع: {dateTime(s.starts_at)} · پایان: {dateTime(s.expires_at)}</span><button disabled={Boolean(s.revoked_at)} onClick={() => setEditor(s)}>ویرایش / قطع دسترسی</button></div>)}{editor !== undefined && <SubscriptionEditor key={editor?.id ?? 'new'} userId={user.id} subscription={editor} plans={plans} onDone={() => { setEditor(undefined); setRefresh(n => n+1); }} onCancel={() => setEditor(undefined)} />}</section><section className="admin-card"><h2>برنامه و ماکروهای روزانه</h2><label>روز برنامه<input type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></label><div className="admin-tools">{detail.dates.slice(0,7).map(d => <button key={d} onClick={() => setDate(d)}>{d}</button>)}</div><Snapshot saved={detail.saved_plan} /><details><summary>تیک وعده‌های ذخیره‌شدهٔ این روز ({detail.checkins.length})</summary><JsonView value={detail.checkins} /></details></section><section className="admin-card"><h2>۱۰۰ سفارش اخیر کاربر</h2><Orders orders={detail.orders} /></section><section className="admin-card"><h2>۱۰۰ تغییر مدیریتی اخیر</h2>{detail.audit.map(a => <details key={a.id}><summary>{dateTime(a.created_at)} · {a.action} · {a.reason}</summary><p dir="ltr">Admin: {a.actor_id}</p><JsonView value={{ before: a.before_data, after: a.after_data }} /></details>)}</section></>}</>;
}
export function AdminApp() {
  const { user, loading, signOut } = useAuth(); const [overview, setOverview] = useState<Overview | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [page, setPage] = useState(0); const [refresh, setRefresh] = useState(0); const [selected, setSelected] = useState<UserRow | null>(null); const [tab, setTab] = useState('users');
  const logout = useCallback(() => { void signOut().catch(e => setError(explain(e))); }, [signOut]);
  useEffect(() => { let alive = true; setOverview(null); setError(''); if (!user) return; setBusy(true); rpc<Overview>('admin_overview', { p_search: query, p_page: page }).then(o => { if (alive) setOverview(o); }).catch(e => { if (alive) setError(explain(e)); }).finally(() => { if (alive) setBusy(false); }); return () => { alive = false; }; }, [user?.id, query, page, refresh]);
  if (loading) return <p className="p-8">در حال بررسی ورود…</p>;
  if (!user) return <><h1 className="text-center p-4 font-bold">ورود به پنل مدیریت به‌تن</h1><PhoneAuth /></>;
  return <div className="admin-shell" dir="rtl"><header><h1>مدیریت به‌تن</h1><div className="admin-tools"><ThemeToggle /><button onClick={logout}>خروج</button></div></header>{error && <p role="alert" className="admin-card">{error}<button onClick={() => setRefresh(n => n+1)}>تلاش دوباره</button></p>}{busy && <p>در حال دریافت…</p>}{overview && (selected ? <UserDetail key={selected.id} user={selected} plans={overview.plans} onBack={() => { setSelected(null); setRefresh(n => n+1); }} /> : <><div className="admin-stats">{Object.entries({ users:'کل کاربران',new_users_7d:'کاربران جدید ۷ روز',active_users:'کاربران با اشتراک واقعی فعال',paid_count:'پرداخت‌های واقعی موفق',revenue_toman:'مجموع پرداخت تأییدشده (تومان)' }).map(([key,label]) => <div className="admin-card" key={key}><span>{label}</span><strong>{number(overview.stats[key] ?? 0)}</strong></div>)}</div><nav className="admin-tools"><button onClick={() => setTab('users')}>کاربران و اشتراک‌ها</button><button onClick={() => setTab('payments')}>تمام پرداخت‌ها</button><button onClick={() => setRefresh(n => n+1)}>به‌روزرسانی</button></nav>{tab === 'payments' ? <PaymentBrowser /> : <section className="admin-card"><form className="admin-tools" onSubmit={e => { e.preventDefault(); setPage(0); setQuery(search.trim().replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/^\+/, '').replace(/^0(?=9\d{9}$)/, '98')); }}><input aria-label="جستجوی کاربر" placeholder="شماره با 989، ایمیل یا UUID" value={search} onChange={e => setSearch(e.target.value)} maxLength={100} /><button>جستجو</button></form><div className="admin-table"><table><thead><tr><th>کاربر</th><th>عضویت</th><th>آنبوردینگ</th><th>پایان اشتراک فعال</th><th>پرداخت واقعی</th><th>جزئیات</th></tr></thead><tbody>{overview.users.map(u => <tr key={u.id}><td dir="ltr">{u.phone ?? u.email ?? u.id}</td><td>{dateTime(u.created_at)}</td><td>{u.onboarding_completed ? 'کامل' : 'ناقص'}</td><td>{dateTime(u.active_until)}</td><td>{number(u.paid_toman)} تومان</td><td><button onClick={() => setSelected(u)}>مشاهده و مدیریت</button></td></tr>)}</tbody></table></div>{overview.users.length === 0 && <p>کاربری پیدا نشد.</p>}<div className="admin-tools"><button disabled={!page} onClick={() => setPage(p => p-1)}>قبلی</button><span>صفحه {number(page+1)}</span><button disabled={overview.users.length<50} onClick={() => setPage(p => p+1)}>بعدی</button></div></section>}</>)}</div>;
}
