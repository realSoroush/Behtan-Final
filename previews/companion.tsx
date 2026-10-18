import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { ThemeToggle } from '../src/components/ui/ThemeToggle';
import { BehtanMascot, CompanionAssets, type MascotMood } from '../src/components/companion/BehtanMascot';
import { CompanionCard } from '../src/components/companion/CompanionCard';
import { getDailyCompanion } from '../src/components/companion/companionState';
import { LandingPage } from '../src/components/landing/LandingPage';
import '../src/index.css';
import './companion-preview.css';

const embedded = (window as unknown as { __BEHTAN_ASSETS__?: {rive:string;fallback:string;wasm:string} }).__BEHTAN_ASSETS__;
const moods: [MascotMood,string,string][] = [
 ['idle','کنارت هستم','یک نفس آرام. از همین‌جا شروع کنیم.'],
 ['welcome','سلام!','خوش آمدی. خوشحالم اینجایی.'],
 ['listening','حواسم به توست','قرار نیست شبیه کسی باشی؛ از خودت بگو.'],
 ['thinking','دارم فکر می‌کنم','بگذار قدم بعدی را مرتب کنیم.'],
 ['celebrate','ثبت شد!','همین قدم‌های کوچک هم حساب‌اند.'],
 ['calm','آرام ادامه بده','اگر روزت طبق برنامه نبود، می‌توانیم از همین‌جا ادامه بدهیم.'],
 ['guide','از اینجا','یک انتخاب کوچک؛ برای ادامهٔ امروز.'],
 ['rest','خسته نباشی','برای امروز کافی است. فردا هم کنارتم.'],
];
function Studio(){
 const [mood,setMood]=useState<MascotMood>('idle'); const [nonce,setNonce]=useState(0);
 const selected=moods.find(x=>x[0]===mood)!;
 return <section className="studio-grid">
  <div className="character-stage"><div className="stage-orbit"/><div className="stage-chip"><span/> همراه به‌تن</div>
   <BehtanMascot size="studio" mood={mood} reactionKey={nonce} priority/>
   <div className="stage-caption"><strong>{selected[1]}</strong><p>{selected[2]}</p></div>
   <span className="touch-hint">لمسم کن، یا نشانگر را دور صورتم حرکت بده</span>
  </div>
  <div className="studio-control"><p className="eyebrow">یک همراه، با حال‌های مختلف</p><h1>حضور کوچک.<br/> <span>حسِ همراهی.</span></h1>
   <p className="intro">گرم و آرام؛ با واکنشی متناسب با لحظهٔ تو.</p>
   <div className="mood-grid">{moods.map(([id,label],i)=><button type="button" key={id} aria-pressed={mood===id} className={mood===id?'selected':''} onClick={()=>{setMood(id);setNonce(n=>n+1);}}><span className="mood-symbol" aria-hidden="true">{['◡','✺','◉','◌','✧','≈','↗','☾'][i]}</span>{label}</button>)}</div>
   <div className="studio-footnote"><span>چشم‌ها نگاهت را دنبال می‌کنند.</span><span>دست‌ها، چهره و بدن مستقل حرکت می‌کنند.</span></div>
  </div>
 </section>;
}
function OnboardingDemo(){
 const [step,setStep]=useState(0);const [answer,setAnswer]=useState<Record<number,string>>({});const [nonce,setNonce]=useState(0);const [focused,setFocused]=useState(false);
 const questions=[{title:'دوست داری به کجا برسی؟',sub:'هدفی که برای خودت می‌خواهی.',options:['کاهش وزن','حفظ وزن','افزایش وزن']},{title:'روزت معمولاً چطور می‌گذرد؟',sub:'همان روزهای عادی را در نظر بگیر.',options:['بیشتر نشسته‌ام','کمی در رفت‌وآمدم','بیشتر روز در حرکت‌ام']},{title:'غذاها چطور با روزت جور شوند؟',sub:'انتخاب‌ها را به شرایطت نزدیک‌تر کنیم.',options:['اقتصادی و ساده','متعادل و متنوع','پروتئین بیشتر']}];
 const q=questions[step];
 return <section className="context-shell"><div className="context-intro"><p className="eyebrow">آغاز مسیر</p><h1>با تو آشنا می‌شویم،<br/> قدم‌به‌قدم.</h1><p>یکی از گزینه‌ها را انتخاب کن و به مرحلهٔ بعد برو.</p></div><div className="phone-surface onboarding-surface">
 <div className="phone-top"><strong>به‌تن</strong><span>{(step+1).toLocaleString('fa-IR')} از ۳ · نمونه</span></div><div className="step-track">{questions.map((_,i)=><i key={i} className={i<=step?'done':''}/>)}</div>
 <div className="onboarding-mascot"><BehtanMascot size="hero" mood={focused?'listening':answer[step]?'guide':step===0?'welcome':'calm'} reactionKey={`${step}-${nonce}`}/></div>
 <h2>{q.title}</h2><p className="question-sub">{q.sub}</p><div className="option-list">{q.options.map(option=><button key={option} aria-pressed={answer[step]===option} className={answer[step]===option?'selected':''} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onClick={()=>{setAnswer({...answer,[step]:option});setFocused(false);setNonce(n=>n+1);}}><span>{option}</span><i>{answer[step]===option?'✓':''}</i></button>)}</div>
 <button className="primary-button" disabled={!answer[step]} onClick={()=>{setStep((step+1)%3);setFocused(false);}}>ادامه <span>←</span></button><button className="quiet-button" onClick={()=>setStep(Math.max(0,step-1))} disabled={step===0}>مرحلهٔ قبل</button>
 </div></section>;
}
function DayDemo(){
 const [consumed,setConsumed]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState(false);const [event,setEvent]=useState<'recorded'|null>(null);const [nonce,setNonce]=useState(0);
 useEffect(()=>{if(!saving)return;const t=window.setTimeout(()=>{setSaving(false);if(!error){setConsumed(true);setEvent('recorded');setNonce(n=>n+1);}},850);return()=>clearTimeout(t);},[saving,error]);
 const message=getDailyCompanion({total:1,consumed:consumed?1:0,saving,error,event});
 const record=()=>{setError(false);setEvent(null);if(consumed){setConsumed(false);}else setSaving(true);};
 return <section className="context-shell"><div className="context-intro"><p className="eyebrow">روزمره، با همراهی</p><h1>یک قدم کوچک.<br/> همین حالا.</h1><p>ثبت وعده را امتحان کن. واکنش تشویق، بعد از پایان ذخیره‌سازی نمونه ظاهر می‌شود.</p><div className="demo-actions"><button onClick={()=>{setError(true);setEvent(null);}}>حالت خطا</button><button onClick={()=>{setError(false);setConsumed(false);setEvent(null);}}>شروع دوباره</button></div></div>
 <div className="phone-surface day-surface"><div className="phone-top"><strong>امروزِ تو</strong><span>روز نمونه</span></div><CompanionCard message={message} reactionKey={nonce} onAction={()=>document.getElementById('demo-meal')?.focus()}/>
 <div className="daily-strip"><span>هر ثبت، تصویر روزت را روشن‌تر می‌کند.</span><strong>{consumed?'۱':'۰'} ثبت</strong></div>
 <article id="demo-meal" tabIndex={-1} className="demo-meal"><div className="meal-heading"><span>ناهار</span><span>وعدهٔ نمونه</span></div><div className="plate-art" aria-hidden="true"><div className="plate"><i className="rice"/><i className="chicken"/><i className="greens"/></div></div><h2>مرغ، برنج و سالاد</h2><p>انتخابی آشنا، برای یک روز معمولی.</p><button className={`primary-button ${consumed?'recorded':''}`} disabled={saving||error} onClick={record}>{saving?'در حال ثبت…':consumed?'✓ ثبت شد · اصلاح ثبت':'خوردم؛ ثبتش کن'}<span>{consumed?'↶':'✓'}</span></button></article>
 {error&&<div className="demo-error" role="alert">ذخیره تأیید نشد. ثبت قبلی حفظ شده.<button onClick={()=>setError(false)}>تلاش دوباره</button></div>}
 <nav className="phone-nav" aria-label="نمایش نمونه"><span className="active">⌂<br/>امروز</span><span>◴<br/>روند من</span></nav></div></section>;
}
function Preview(){
 const [screen,setScreen]=useState('studio');
 return <div className="companion-preview" dir="rtl"><header className="preview-header"><a href="#" onClick={e=>{e.preventDefault();setScreen('studio');}} className="preview-brand"><img src="/behtan-logo.png" alt=""/><strong>به‌تن</strong><span>همراه تازهٔ تو</span></a><ThemeToggle/></header>
 <nav className="preview-tabs" aria-label="بخش پیش‌نمایش">{[['studio','کاراکتر'],['onboarding','آغاز مسیر'],['day','امروز'],['landing','لندینگ']].map(([key,label])=><button key={key} aria-current={screen===key?'page':undefined} onClick={()=>setScreen(key)}>{label}</button>)}</nav>
 <main>{screen==='studio'?<Studio/>:screen==='onboarding'?<OnboardingDemo/>:screen==='day'?<DayDemo/>:<LandingPage onStart={()=>setScreen('onboarding')}/>}</main>
 <footer className="preview-note">پیش‌نمایش تعاملی · اطلاعات و ثبت‌ها نمایشی‌اند و به حساب یا دیتابیس متصل نیستند.</footer></div>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider>{embedded?<CompanionAssets.Provider value={embedded}><Preview/></CompanionAssets.Provider>:<Preview/>}</ThemeProvider>);
