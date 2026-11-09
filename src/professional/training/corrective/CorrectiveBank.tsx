import './corrective.css';
import {useEffect,useState}from'react';
import {PanelSelect}from'@/components/ui/PanelSelect';
import {AppLoading}from'@/components/ui/AppLoading';
import {normalizedSearch}from'../../studioModel';
import {correctiveApi}from'./api';
import {CORRECTIVE_CATEGORIES,EQUIPMENT,STATUS_LABELS,safeMedia,type CorrectiveExercise}from'./types';
import {CorrectiveEditor}from'./CorrectiveEditor';
export function CorrectiveBank({org,onAdd}:{org:string;onAdd:(exercise:CorrectiveExercise)=>void}){
 const [rows,setRows]=useState<CorrectiveExercise[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [search,setSearch]=useState(''),[filters,setFilters]=useState<Record<string,string>>({}),[view,setView]=useState<CorrectiveExercise|null>(null),[custom,setCustom]=useState(false),[ack,setAck]=useState(false);
 useEffect(()=>{let active=true;setBusy(true);setError('');correctiveApi.list(org).then(data=>{if(!Array.isArray(data))throw Error('INVALID_BANK');if(active)setRows(data);}).catch(()=>{if(active)setError('دریافت بانک اصلاحی انجام نشد؛ اجرای مایگریشن بانک و اتصال را بررسی کنید.');}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[org,attempt]);
 const fields=[['categories','دسته اصلاحی'],['bodyRegions','ناحیه بدن'],['subgroups','زیرگروه اصلاحی'],['goals','هدف تمرین'],['muscles','عضلات هدف'],['equipment','تجهیزات اصلاحی'],['difficulty','سطح دشواری'],['position','وضعیت بدن'],['movementTypes','نوع حرکت'],['pattern','الگوی حرکت'],['laterality','یک‌طرفه / دوطرفه'],['stages','مرحله اصلاحی'],['status','وضعیت انتشار']] as const;
 const label=(key:string,value:string)=>key==='categories'||key==='bodyRegions'?CORRECTIVE_CATEGORIES.find(([id])=>id===value)?.[1]||value:key==='equipment'?EQUIPMENT.find(([id])=>id===value)?.[1]||value:key==='status'?STATUS_LABELS[value as keyof typeof STATUS_LABELS]:value;
 const values=(r:CorrectiveExercise,key:string)=>{const value=r[key as keyof CorrectiveExercise];return Array.isArray(value)?value:typeof value==='string'&&value?[value]:[];};
 const visible=rows.filter(r=>(r.status!=='archived'||filters.status==='archived')&&normalizedSearch([r.nameFa,r.nameEn,...r.aliases].join(' ')).includes(normalizedSearch(search))&&Object.entries(filters).every(([key,value])=>!value||values(r,key).includes(value)));
 return <div className="corrective-bank"><h4>حرکات اصلاحی</h4><small>{visible.length.toLocaleString('fa-IR')} حرکت · نسخهٔ پیشنهادی / بازبینی‌شده</small><p className="studio-help">انتخاب براساس ارزیابی متخصص است. این فهرست ابزار تشخیص یا نسخهٔ درمانی خودکار نیست.</p>
 <input type="search" aria-label="جستجوی حرکت اصلاحی" placeholder="نام فارسی، انگلیسی یا مترادف…" value={search}onChange={e=>setSearch(e.target.value)}/>
 <details><summary>فیلترهای اصلاحی</summary>{fields.map(([key,title])=><label key={key}>{title}<PanelSelect aria-label={title} value={filters[key]||''}onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}><option value="">همه</option>{[...new Set(rows.flatMap(r=>values(r,key)))].sort().map(value=><option key={value}value={value}>{label(key,value)}</option>)}</PanelSelect></label>)}<button type="button"onClick={()=>setFilters({})}>پاک‌کردن فیلترها</button></details>
 {busy&&<AppLoading label="در حال دریافت حرکات اصلاحی…"/>}{error&&<p role="alert">{error}<button type="button"onClick={()=>setAttempt(n=>n+1)}>تلاش دوباره</button></p>}
 <div className="studio-bank-list">{visible.map(r=><button type="button"key={r.id}onClick={()=>{setView(r);setAck(false);}}><span><strong>{r.nameFa}</strong><small lang="en"dir="ltr">{r.nameEn}</small><small>{r.ownerOrg?'حرکت اختصاصی مربی':STATUS_LABELS[r.status]}</small></span></button>)}</div>
 {!busy&&!error&&!visible.length&&<p>حرکتی با این فیلترها پیدا نشد.</p>}
 {view&&<section className="corrective-detail"aria-label="اطلاعات حرکت اصلاحی"><div className="studio-row"><h4>{view.nameFa}</h4><button type="button"onClick={()=>setView(null)}>بستن اطلاعات حرکت</button></div><small>{STATUS_LABELS[view.status]} · {view.id}</small>
 {view.status!=='published'&&<p className="studio-notice">این حرکت هنوز انتشار علمی تأییدشده ندارد؛ افزودن آن فقط به‌عنوان تدوین اختصاصی شما و با تعیین دوز مجاز است.</p>}
 <p>{view.start||'وضعیت شروع هنوز ثبت نشده است.'}</p><ol>{view.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>{!view.steps.length&&<p>شرح اجرا نیازمند تکمیل و بازبینی است.</p>}
 <p>تجهیزات: {view.equipment.map(e=>label('equipment',e)).join('، ')||'نیازمند تکمیل'}</p><p>عضلات: {view.muscles.join('، ')||'نیازمند بازبینی'}</p>
 <p>احتیاط: {view.precautions.join('؛ ')||'موارد اختصاصی هنوز ثبت نشده‌اند؛ پیش از انتخاب بررسی کنید.'}</p><p>خطاهای رایج: {view.mistakes.join('؛ ')||'ثبت نشده'}</p>{view.breathing&&<p>تنفس: {view.breathing}</p>}
 <p className="studio-help">درد شدید یا افزایشی، بی‌حسی، ضعف پیشرونده، آسیب حاد یا جراحی اخیر نیازمند ارزیابی تخصصی است. مراحل Inhibit / Lengthen / Activate / Integrate توالی اجباری نیستند.</p>
 {view.imageUrl&&safeMedia(view.imageUrl)&&<img src={view.imageUrl}alt={view.nameFa}loading="lazy"/>}{view.videoUrl&&safeMedia(view.videoUrl)&&<video src={view.videoUrl}controls preload="none"/>}
 <p>بازبین: {view.reviewer||'هنوز تعیین نشده'}{view.reviewerQualification?' · '+view.reviewerQualification:''}{view.reviewedAt?' · '+new Date(view.reviewedAt+'T12:00:00').toLocaleDateString('fa-IR'):''}</p>{view.sourceUrls.filter(s=>s.startsWith('https://')).map(url=><a key={url}href={url}target="_blank"rel="noopener noreferrer">منبع حرکت</a>)}
 <label><input type="checkbox"checked={ack}onChange={e=>setAck(e.target.checked)}/>تناسب این حرکت را بررسی می‌کنم و دوز را برای مراجع تعیین می‌کنم.</label>
 <button type="button"disabled={!ack||view.status==='archived'}onClick={()=>onAdd(view)}>افزودن حرکت اصلاحی به برنامه</button>
 {view.ownerOrg&&<CorrectiveEditor key={view.id+':'+view.revision}initial={view}org={org}onSaved={()=>{setView(null);setAttempt(n=>n+1);}}/>}
 </section>}
 <button type="button"onClick={()=>setCustom(v=>!v)}>+ حرکت اصلاحی اختصاصی</button>{custom&&<CorrectiveEditor org={org}onSaved={()=>{setCustom(false);setAttempt(n=>n+1);}}/>}
 </div>;
}
