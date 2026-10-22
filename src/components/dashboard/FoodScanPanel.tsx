import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, ImagePlus, Loader2, Plus, ScanLine, Trash2, Check } from 'lucide-react';
import { MemberMealConfirmation } from './MemberMealConfirmation';
import { scannedMeal } from '@/utils/foodScan';
import type { FoodItem, Meal } from '@/types';
import { analyzeFoodPhoto, FOOD_SCAN_DEMO } from '@/lib/foodScanClient';
import { normalizeFoodPhoto } from '@/utils/foodScanImage';
import { foodScanTotals, parseFoodGrams, type FoodScanResult, type ScannedFood } from '@/utils/foodScan';
const n=(v:number)=>Math.round(v).toLocaleString('fa-IR');
export function FoodScanPanel({meals,catalog,onBack,onSave}:{meals:Meal[];catalog:FoodItem[];onBack:()=>void;onSave:(result:FoodScanResult,slot:Meal['slot'])=>Promise<void>}){
 const [image,setImage]=useState(''),[result,setResult]=useState<FoodScanResult|null>(null),[weights,setWeights]=useState<string[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[slot,setSlot]=useState<Meal['slot']>(meals.find(m=>!m.consumed)?.slot??meals[0].slot),[replace,setReplace]=useState(false),[extra,setExtra]=useState('');
 const [confirming,setConfirming]=useState(false);
 const [consent,setConsent]=useState(false);const controller=useRef<AbortController|null>(null);const mounted=useRef(true);const heading=useRef<HTMLHeadingElement>(null);const camera=useRef<HTMLInputElement>(null),upload=useRef<HTMLInputElement>(null);
 useEffect(()=>{heading.current?.focus();mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 const edited=result?.foods.map((f,i)=>({...f,grams:parseFoodGrams(weights[i]??'')??0}))??[];
 const valid=edited.length>0&&edited.every(f=>f.grams>=1)&&edited.reduce((s,f)=>s+f.grams,0)<=5000;
 const totals=foodScanTotals(edited);const occupied=meals.find(m=>m.slot===slot)?.consumed;
 const choose=async(file?:File)=>{if(!file)return;setError('');setLoading(true);try{const photo=await normalizeFoodPhoto(file);if(mounted.current){setImage(photo);setResult(null);}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'عکس خوانده نشد.');}finally{if(mounted.current)setLoading(false);}};
 const analyze=async(demo=false)=>{if(!demo&&(!image||!consent))return;setError('');setLoading(true);controller.current=new AbortController();try{const response=await analyzeFoodPhoto(image,controller.current.signal);if(mounted.current){setResult(response);setWeights(response.foods.map(f=>String(f.grams)));}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'بررسی عکس انجام نشد.');}finally{if(mounted.current)setLoading(false);}};
 const remove=(i:number)=>{if(!result)return;setResult({...result,foods:result.foods.filter((_,j)=>j!==i)});setWeights(weights.filter((_,j)=>j!==i));};
 const add=()=>{const f=catalog.find(f=>f.id===extra);if(!f||!result||result.foods.length>=12)return;const scale=100/f.gramsPerUnit;const item:ScannedFood={name:f.name,grams:100,kcalPer100:f.kcalPerUnit*scale,proteinPer100:f.proteinPerUnit*scale,carbsPer100:f.carbsPerUnit*scale,fatPer100:f.fatPerUnit*scale,fiberPer100:f.fiberPerUnit*scale};setResult({...result,foods:[...result.foods,item]});setWeights([...weights,'100']);setExtra('');};
 const save=async()=>{if(!result||!valid||(occupied&&!replace)||saving)return;setSaving(true);setError('');try{await onSave({...result,foods:edited},slot);}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'ثبت غذا انجام نشد. دوباره تلاش کن.');}finally{if(mounted.current)setSaving(false);}};
 return <section className="food-scan-panel member-surface" aria-labelledby="food-scan-title">
  <div className="food-scan-heading"><button type="button" className="member-icon-button" aria-label="بازگشت به برنامه" disabled={saving} onClick={onBack}><ArrowRight size={20}/></button><div><h1 id="food-scan-title" ref={heading} tabIndex={-1}>غذات رو چک کن</h1><p>عکس بگیر، مقدارها را بررسی کن، ثبت کن.</p></div></div>
  {FOOD_SCAN_DEMO&&<p className="scan-demo-notice">پیش‌نمایش: تحلیل زیر نمونه است و از عکس تو به دست نمی‌آید. عکسی به سرویس ارسال نمی‌شود.</p>}
  <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e=>{void choose(e.target.files?.[0]);e.target.value='';}}/>
  <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{void choose(e.target.files?.[0]);e.target.value='';}}/>
  {!result?<div className="scan-capture-card">
   {image?<img className="scan-photo" src={image} alt="عکس غذای انتخاب‌شده"/>:<div className="scan-photo-placeholder"><ScanLine size={42}/><strong>کل بشقاب داخل عکس باشد</strong><p>نور کافی و عکس از بالا، تشخیص را بهتر می‌کند.</p></div>}
   <div className="scan-photo-actions"><button type="button" className="member-secondary" disabled={loading} onClick={()=>camera.current?.click()}><Camera size={18}/>{image?'عکس دوباره':'عکس بگیر'}</button><button type="button" className="member-secondary" disabled={loading} onClick={()=>upload.current?.click()}><ImagePlus size={18}/>از گالری</button></div>
   {image&&<><label className="scan-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>با ارسال عکس غذا به سرویس تحلیل گوگل موافقم. عکس در حساب به‌تن ذخیره نمی‌شود.</label><button type="button" className="member-primary scan-full-button" disabled={!consent||loading} onClick={()=>void analyze()}>{loading?<Loader2 className="animate-spin" size={18}/>:<ScanLine size={18}/>}ارسال برای بررسی{FOOD_SCAN_DEMO?' نمایشی':''}</button></>}
   {FOOD_SCAN_DEMO&&!image&&<button type="button" className="member-primary scan-full-button" disabled={loading} onClick={()=>void analyze(true)}>دیدن نمونهٔ تحلیل</button>}
   {loading&&<div role="status" className="member-muted">در حال آماده‌سازی یا بررسی عکس… <button type="button" onClick={()=>controller.current?.abort()}>لغو بررسی</button></div>}
  </div>:<>
   <div className="scan-result-heading"><div><h2>نتیجهٔ تخمینی</h2><p>وزن‌ها برای بخش خوراکی و آمادهٔ خوردن هستند.</p></div><button type="button" disabled={saving} onClick={()=>{setResult(null);setError('');}}>عکس دیگر</button></div>
   {image&&<img className="scan-result-photo" src={image} alt="عکس غذای بررسی‌شده"/>}
   {result.confidence==='low'&&<p className="scan-estimate-note">تشخیص این عکس مطمئن نیست؛ نام مواد و وزن‌ها را بررسی کن.</p>}
   <p className="scan-estimate-note">{result.note||'وزن و روغن از روی عکس دقیق مشخص نیستند. مقدارهای واقعی را اصلاح کن.'}</p>
   {!result.foods.length&&<p role="status" className="member-empty">غذای مشخصی پیدا نشد. عکس روشن‌تری بگیر یا ماده را از فهرست اضافه کن.</p>}
   <div className="scan-foods">{edited.map((f,i)=><div className="scan-food-row" key={i}><div><strong>{f.name}</strong><span>حدود {n(f.kcalPer100*f.grams/100)} کالری</span></div><label>گرم<input aria-label={`وزن ${f.name}`} inputMode="decimal" value={weights[i]} disabled={saving} aria-invalid={parseFoodGrams(weights[i])===null} onChange={e=>setWeights(weights.map((v,j)=>j===i?e.target.value:v))}/></label><button type="button" className="member-icon-button" aria-label={`حذف ${f.name}`} disabled={saving} onClick={()=>remove(i)}><Trash2 size={16}/></button></div>)}</div>
   <div className="scan-add-food"><select aria-label="مادهٔ جاافتاده" value={extra} disabled={saving||result.foods.length>=12} onChange={e=>setExtra(e.target.value)}><option value="">ماده‌ای جا افتاده؟</option>{catalog.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><button type="button" className="member-icon-button" aria-label="افزودن ماده" disabled={!extra||saving||result.foods.length>=12} onClick={add}><Plus size={18}/></button></div>
   <div className="scan-totals" aria-live="polite"><strong>حدود {n(totals.kcal)}<small> کالری</small></strong><div><span>{n(totals.protein)} گرم پروتئین</span><span>{n(totals.carbs)} گرم کربوهیدرات</span><span>{n(totals.fat)} گرم چربی</span></div></div>
   {!valid&&<p className="scan-estimate-note">برای هر ماده وزنی بین ۱ تا ۲۰۰۰ گرم وارد کن؛ مجموع باید حداکثر ۵۰۰۰ گرم باشد.</p>}
   <div className="scan-log-card"><label>این غذا برای کدام وعده بود؟<select aria-label="وعدهٔ ثبت غذا" disabled={saving} value={slot} onChange={e=>{setSlot(e.target.value as Meal['slot']);setReplace(false);}}>{meals.map(m=><option key={m.slot} value={m.slot}>{m.label}{m.consumed?' · قبلاً ثبت شده':''}</option>)}</select></label>{occupied&&<label className="scan-consent"><input type="checkbox" checked={replace} disabled={saving} onChange={e=>setReplace(e.target.checked)}/>این تخمین جای ثبت قبلی این وعده را بگیرد.</label>}<p>با عنوان «وعدهٔ دلخواه» در امروز ثبت می‌شود.</p><button type="button" className="member-primary scan-full-button" disabled={!valid||saving||Boolean(occupied&&!replace)} onClick={()=>setConfirming(true)}>{saving?<Loader2 size={18} className="animate-spin"/>:<Check size={18}/>}این غذا رو خوردم</button></div>
  </>}
  {confirming&&result&&valid&&<MemberMealConfirmation meal={scannedMeal({...result,foods:edited},slot,meals.find(m=>m.slot===slot)?.label??'وعدهٔ دلخواه')} onCancel={()=>setConfirming(false)} onConfirm={()=>{setConfirming(false);void save();}}/>}
  {error&&<p role="alert" className="member-notice">{error}</p>}
 </section>;
}
