import{useEffect,useState}from'react';
import{AppLoading}from'@/components/ui/AppLoading';
import{PROFESSIONS}from'@/professional/specialistProfile';
import{commercialRpc}from'./AdminProCatalog';
type Metrics={specialists:number;specialists_by_profession:{profession:string;count:number}[];specialists_date_unknown:number;specialists_date_fallback:number;clients:number;nutrition_total:number;nutrition_automatic:number;nutrition_authored:number;training_total:number;training_automatic:number;training_authored:number;body_reports:number};
const cards=[['specialists','متخصصین ثبت‌شده'],['clients','مراجعین ثبت‌شده'],['nutrition_total','کل برنامه‌های تغذیه'],['nutrition_authored','تغذیه اختصاصی'],['nutrition_automatic','تغذیه خودکار'],['training_total','کل برنامه‌های تمرینی'],['training_automatic','تمرین خودکار'],['training_authored','تمرین اختصاصی'],['body_reports','تحلیل‌های تصویری موفق']]as const;
const fa=(n:number)=>n.toLocaleString('fa-IR');
export function AdminProMetrics(){
 const[from,setFrom]=useState(''),[to,setTo]=useState(''),[range,setRange]=useState({from:'',to:''}),[tick,setTick]=useState(0);
 const[data,setData]=useState<Metrics|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[inputError,setInputError]=useState('');
 useEffect(()=>{let active=true;setBusy(true);setError('');setData(null);commercialRpc<Metrics>('admin_pro_metrics',{p_from:range.from||null,p_to:range.to||null}).then(value=>{if(!value||!Array.isArray(value.specialists_by_profession)||cards.some(([key])=>!Number.isFinite(value[key])||value[key]<0))throw Error('INVALID_METRICS');if(active)setData(value);}).catch(()=>{if(active)setError('دریافت آمار Pro انجام نشد؛ دسترسی مدیر، اتصال و مایگریشن آمار را بررسی کنید.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[range,tick]);
 return <section aria-label="آمار فعالیت پنل پرو"className="admin-pro-metrics"><h3>آمار فعالیت پنل پرو</h3>
 <form className="admin-tools"onSubmit={e=>{e.preventDefault();setInputError('');if(!from||!to||from>to){setInputError('ابتدا و انتهای بازه را به ترتیب وارد کنید.');return;}setRange({from,to});}}>
 <label>از تاریخ<input type="date"aria-label="آمار پرو از تاریخ"value={from}onChange={e=>setFrom(e.target.value)}/></label><label>تا تاریخ<input type="date"aria-label="آمار پرو تا تاریخ"value={to}onChange={e=>setTo(e.target.value)}/></label><button disabled={busy}>اعمال بازه</button>
 <button type="button"disabled={busy}onClick={()=>{setFrom('');setTo('');setInputError('');setRange({from:'',to:''});}}>همهٔ زمان‌ها</button><button type="button"disabled={busy}onClick={()=>setTick(n=>n+1)}>تازه‌سازی آمار</button></form>
 <p className="admin-note">{range.from?`${range.from} تا ${range.to}، شامل تمام روز پایان`:'همهٔ زمان‌ها'} · ساعت تهران. برنامه‌ها نسخه‌های ثبت‌شده‌اند؛ پیش‌نمایش موقت و تولید ناموفق شمرده نمی‌شوند. از هر دو نوع روز یک سند برنامه شمرده می‌شود.</p>
 {inputError&&<p role="alert">{inputError}</p>}{error&&<p role="alert">{error}</p>}{busy&&<AppLoading label="در حال دریافت آمار پرو…"/>}
 {data&&<><div className="admin-pro-metric-grid">{cards.map(([key,title])=><article key={key}><small>{title}</small><strong>{fa(data[key])}</strong></article>)}</div>
 <h4>متخصصین به تفکیک رسته کاری</h4><table><thead><tr><th>رسته</th><th>تعداد</th></tr></thead><tbody>{PROFESSIONS.map(([key,title])=><tr key={key}><td>{title}</td><td>{fa(data.specialists_by_profession.find(row=>row.profession===key)?.count||0)}</td></tr>)}</tbody></table>
 <p className="admin-note">متخصص، حساب دارای پروفایل حرفه‌ای کامل است و در چند فضای کاری دوباره شمرده نمی‌شود. مراجعین براساس پرونده و برنامه‌ها براساس سند ثبت‌شده شمارش می‌شوند. تغذیه و تمرین اختصاصی شامل نسخه‌های تدوین و تأییدشدهٔ متخصص است؛ تمرین خودکار پس از تأیید شمرده می‌شود. تحلیل تصویری، پردازش موفق است.</p>
 {(data.specialists_date_unknown>0||data.specialists_date_fallback>0)&&<p className="admin-note">برای {fa(data.specialists_date_fallback)} ثبت قدیمی، زمان درخواست Pro یا اولین عضویت استفاده شده است. تاریخ {fa(data.specialists_date_unknown)} پروفایل مشخص نیست؛ این موارد فقط در همهٔ زمان‌ها شمرده می‌شوند.</p>}
 </>}
 </section>;
}
