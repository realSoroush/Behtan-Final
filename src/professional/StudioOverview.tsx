import { useEffect, useState } from 'react';
import { ArrowUpLeft, Dumbbell, FolderHeart, RefreshCw, Utensils } from 'lucide-react';
import { realCaseApi, type WorkspaceStatus } from './realCaseApi';
import { proErrorMessage } from './contracts';
export type ProView = 'overview' | 'cases' | 'training' | 'nutrition' | 'history' | 'subscription' | 'settings';
export function StudioOverview({ org, navigate }: { org: string; navigate: (view: ProView) => void }) {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null), [error, setError] = useState(''), [tick, setTick] = useState(0);
  useEffect(() => { let alive = true; setError(''); realCaseApi.status(org).then(s => { if (alive) setStatus(s); }).catch(e => { if (alive) setError(proErrorMessage(e)); }); return () => { alive = false; }; }, [org, tick]);
  return <section className="studio-overview"><div className="studio-overview-hero"><span className="pro-section-kicker">فضای کاری متخصص</span><h2>از پرونده تا برنامه،<br />همه‌چیز در یک مسیر.</h2><p>اطلاعات مراجع را به‌روز کنید، برنامه را بسازید و نسخهٔ تأییدشده را ارائه کنید.</p><button className="pro-primary" onClick={() => navigate('cases')}>رفتن به مراجعان<ArrowUpLeft size={17} /></button></div>
    {error && <p className="pro-error" role="alert">{error}<button onClick={() => setTick(t => t + 1)}><RefreshCw size={15} />تلاش دوباره</button></p>}
    {!status && !error && <p role="status">در حال دریافت وضعیت فضای کاری…</p>}
    {status && <div className="studio-stats"><article><small>پرونده‌های ثبت‌شده</small><strong>{status.case_count.toLocaleString('fa-IR')}</strong><span>{status.case_limit === null ? 'بدون سقف ظرفیت' : 'ظرفیت کل ' + status.case_limit.toLocaleString('fa-IR') + ' پرونده'}</span></article><article><small>دسترسی فضای کاری</small><strong>{status.can_write ? 'فعال' : 'مشاهده سوابق'}</strong><span>{status.expires_at ? 'تا ' + new Date(status.expires_at).toLocaleDateString('fa-IR') : 'اعتبار فضای کاری'}</span></article><article><small>ماژول‌های قابل استفاده</small><strong>{[status.modules?.training && 'تمرین', status.modules?.nutrition && 'تغذیه'].filter(Boolean).join(' + ') || 'مشاهده سوابق'}</strong><span>پرونده و خروجی‌های قبلی در دسترس‌اند.</span></article></div>}
    <div className="studio-shortcuts">{([{ view: 'cases', title: 'مراجعان', copy: 'پرونده جدید، اطلاعات و پیگیری', icon: FolderHeart }, { view: 'training', title: 'استودیوی تمرین', copy: 'حرکات، جلسات و گروه‌های تمرینی', icon: Dumbbell }, { view: 'nutrition', title: 'استودیوی تغذیه', copy: 'بانک مواد، مقدارها و موتور به‌تن', icon: Utensils }] as const).map(({ view, title, copy, icon: Icon }) => <button key={view} onClick={() => navigate(view)}><Icon size={24} /><strong>{title}</strong><span>{copy}</span><ArrowUpLeft size={18} /></button>)}</div>
  </section>;
}
