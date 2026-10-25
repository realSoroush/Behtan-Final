import { PanelSelect } from '@/components/ui/PanelSelect';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useNutritionCatalog } from '@/hooks/useNutritionCatalog';
import { useProteinEnginePolicy } from '@/hooks/useProteinEnginePolicy';
import { JalaliBirthDate } from '@/components/ui/JalaliBirthDate';
import { OptionCard, CheckboxCard } from '@/components/ui/Card';
import { MedicalSafetyForm, type MedicalSafetyFormValue } from '@/components/safety/MedicalSafetyForm';
import { PROVINCES, CITIES_BY_PROVINCE, DEFAULT_CITIES } from '@/components/onboarding/Step1Gender';
import { GOALS } from '@/components/onboarding/Step3Goal';
import { MOVEMENT_OPTIONS, STEP_OPTIONS } from '@/components/onboarding/Step4Activity';
import { LOCATIONS, TRAINING_TYPE_OPTIONS, DURATION_OPTIONS, INTENSITY_OPTIONS } from '@/components/onboarding/Step5Workout';
import { VEGETARIAN_OPTIONS, ALLERGIES, PROTEIN_BUDGET_OPTIONS } from '@/components/onboarding/Step7Dietary';
import { MacroSummary } from '@/components/dashboard/MacroSummary';
import { NutritionQualitySummary } from '@/components/dashboard/NutritionQualitySummary';
import { MealCard } from '@/components/dashboard/MealCard';
import { evaluateDailyFoodQuality } from '@/utils/nutritionQuality';
import { mergeActivityAnswers, deriveOnboardingActivity } from '@/utils/onboardingActivity';
import { evaluateOnboardingMedicalEligibility } from '@/utils/medicalEligibility';
import { tryCalculateAge } from '@/utils/nutritionHelpers';
import { emptyTestScenario, calculateTestScenario, type TestScenarioAnswers, type TestScenarioResult } from './testScenarioEngine';
import type { OnboardingData, Gender } from '@/types';

type RecordRow = { id: string; label: string; answers: TestScenarioAnswers; updated_at: string };
const n = (value: number) => Math.round(value).toLocaleString('fa-IR');
const steps = ['مشخصات و هدف', 'تحرک و ورزش', 'پزشکی', 'خوراک و نتیجه'];

export function AdminTestScenarios({ adminId }: { adminId: string }) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [scenario, setScenario] = useState<TestScenarioAnswers>(emptyTestScenario);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<TestScenarioResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const catalog = useNutritionCatalog();
  const protein = useProteinEnginePolicy();

  const load = async () => {
    setLoading(true);
    const response = await supabase.from('admin_test_scenarios').select('id,label,answers,updated_at')
      .eq('created_by', adminId).order('updated_at', { ascending: false });
    setLoading(false);
    if (response.error) setError(`دریافت سناریوها ناموفق بود: ${response.error.message}`);
    else setRows(response.data as RecordRow[]);
  };
  useEffect(() => { void load(); }, [adminId]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch: Partial<TestScenarioAnswers>) => {
    setScenario(prev => ({ ...prev, ...patch })); setResult(null); setError(''); setNotice('');
  };
  const update = (patch: Partial<OnboardingData>) => change({ data: { ...scenario.data, ...patch } });
  const activity = (patch: Partial<OnboardingData>) => update(mergeActivityAnswers(scenario.data, patch));
  const begin = () => { setCurrentId(null); setLabel(''); setScenario(emptyTestScenario()); setResult(null); setStep(0); setError(''); setNotice(''); };
  const open = (row: RecordRow) => {
    setCurrentId(row.id); setLabel(row.label);
    setScenario({ ...emptyTestScenario(), ...row.answers, data: { ...emptyTestScenario().data, ...row.answers.data, bodyScanImage: null } });
    setStep(0); setResult(null); setError(''); setNotice('');
  };
  const save = async () => {
    if (!label.trim() || label.trim().length > 80) { setError('نام سناریو باید بین ۱ تا ۸۰ نویسه باشد.'); return; }
    setBusy(true); setError(''); setNotice('');
    // Test scenarios never persist camera data or a body scan artifact.
    const answers = { ...scenario, data: { ...scenario.data, bodyScanImage: null, bodyScanResult: null } };
    const query = currentId
      ? supabase.from('admin_test_scenarios').update({ label: label.trim(), answers, updated_at: new Date().toISOString() }).eq('id', currentId).eq('created_by', adminId)
      : supabase.from('admin_test_scenarios').insert({ label: label.trim(), answers, created_by: adminId });
    const response = await query.select('id,label,answers,updated_at').single();
    setBusy(false);
    if (response.error) setError(`ذخیره انجام نشد: ${response.error.message}`);
    else { setCurrentId(response.data.id); setNotice('سناریو ذخیره شد.'); void load(); }
  };
  const remove = async () => {
    if (!currentId || !window.confirm(`سناریوی «${label}» حذف شود؟`)) return;
    setBusy(true);
    const response = await supabase.from('admin_test_scenarios').delete().eq('id', currentId).eq('created_by', adminId);
    setBusy(false);
    if (response.error) setError(`حذف انجام نشد: ${response.error.message}`);
    else { begin(); void load(); }
  };
  const generate = () => {
    setError(''); setNotice(''); setResult(null);
    if (!catalog.catalog || !protein.policy) { setError('کاتالوگ یا سیاست پروتئین هنوز آماده نیست.'); return; }
    try { setResult(calculateTestScenario(scenario, catalog.catalog, protein.policy)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تولید برنامه انجام نشد.'); }
  };
  const data = scenario.data;
  const gender = (value: Gender) => update({ gender: value, medicalConditions: value === 'male' ? data.medicalConditions.filter(c => c !== 'pcos') : data.medicalConditions, pregnancyStatus: value === 'male' ? 'not_applicable' : null, safetyAnswersConfirmed: false, safetyScreeningVersion: null });
  const blocked = evaluateOnboardingMedicalEligibility(data);
  const training = data.workoutLocation === 'home' || data.workoutLocation === 'gym';
  const age = data.birthDate ? tryCalculateAge(data.birthDate) : null;

  return <section className="admin-test-layout">
    <aside className="admin-card admin-test-sidebar"><h2>سناریوهای تست</h2><p className="admin-note">پرسونای تستی حساب واقعی، پرداخت یا اشتراک ایجاد نمی‌کند.</p><button type="button" onClick={begin}>سناریوی تازه</button>
      {loading ? <p>در حال دریافت…</p> : rows.map(row => <button type="button" key={row.id} className={`admin-test-row ${currentId === row.id ? 'is-active' : ''}`} onClick={() => open(row)}>{row.label}<small>{new Date(row.updated_at).toLocaleString('fa-IR')}</small></button>)}
    </aside>
    <div className="admin-test-main"><section className="admin-card"><h2>آزمایش برنامهٔ غذایی</h2><p className="admin-note">پاسخ‌ها را مانند آنبوردینگ پر کن، سپس برنامه را با موتور و کاتالوگ فعلی ببین. این پیش‌نمایش یک روز تازه، پیش از ثبت مصرف وعده‌هاست.</p>
      <label>نام سناریو<input value={label} maxLength={80} placeholder="مثلاً کاهش وزن، کم‌تحرک" onChange={e => setLabel(e.target.value)} /></label>
      <div className="admin-test-steps" role="tablist" aria-label="بخش‌های پرسشنامه">{steps.map((name, index) => <button type="button" role="tab" aria-selected={step === index} key={name} onClick={() => setStep(index)}>{index + 1}. {name}</button>)}</div>
      <div className="admin-test-form">
      {step === 0 && <>
        <h3>جنسیت</h3><div className="admin-test-options">{(['male','female'] as Gender[]).map(value => <OptionCard key={value} label={value === 'male' ? 'مرد' : 'زن'} icon={value === 'male' ? '🧔' : '👩'} selected={data.gender === value} onClick={() => gender(value)} />)}</div>
        <div className="admin-test-options"><label>استان<PanelSelect value={data.province} onChange={e => update({ province: e.target.value, city: '' })}><option value="">انتخاب کنید</option>{PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}</PanelSelect></label><label>شهر<PanelSelect value={data.city} disabled={!data.province} onChange={e => update({ city: e.target.value })}><option value="">انتخاب کنید</option>{(CITIES_BY_PROVINCE[data.province] ?? DEFAULT_CITIES).map(c => <option key={c} value={c}>{c}</option>)}</PanelSelect></label></div>
        <JalaliBirthDate value={data.birthDate} onChange={birthDate => update({ birthDate })} invalid={Boolean(data.birthDate && age === null)} />{data.birthDate && <p className="admin-note">سن: {age === null ? 'تاریخ تولد باید مربوط به ۱۸ تا ۷۰ سال باشد.' : `${n(age)} سال`}</p>}
        <div className="admin-test-options"><label>قد (سانتی‌متر)<input type="number" min={100} max={250} value={data.height ?? ''} onChange={e => update({ height: e.target.value ? Number(e.target.value) : null })} /></label><label>وزن (کیلوگرم)<input type="number" min={30} max={300} value={data.weight ?? ''} onChange={e => update({ weight: e.target.value ? Number(e.target.value) : null })} /></label></div>
        <h3>هدف شما چیست؟</h3>{GOALS.map(g => <OptionCard key={g.value} icon={g.icon} label={g.label} description={g.description} selected={data.goal === g.value} onClick={() => update({ goal: g.value })} />)}
      </>}
      {step === 1 && <>
        <h3>یک روز معمولی شما بیشتر شبیه کدام است؟</h3>{MOVEMENT_OPTIONS.map(o => <OptionCard key={o.value} icon={o.icon} label={o.label} description={o.description} selected={data.dailyMovement === o.value} onClick={() => activity({ dailyMovement: o.value })} />)}
        <h3>میانگین قدم روزانه</h3><div className="admin-test-options">{STEP_OPTIONS.map(o => <button type="button" key={o.value} aria-pressed={data.dailySteps === o.value} onClick={() => activity({ dailySteps: o.value })}>{o.label}</button>)}</div>
        <h3>ورزش ساختاریافته</h3><div className="admin-test-options">{LOCATIONS.map(o => <OptionCard key={o.value} icon={o.icon} label={o.label} selected={data.workoutLocation === o.value} onClick={() => activity({ workoutLocation: o.value, workoutDays: o.value === 'none' ? 0 : (data.workoutDays || 3) })} />)}</div>
        {training && <><h3>نوع تمرین</h3>{TRAINING_TYPE_OPTIONS.map(o => <OptionCard key={o.value} icon={o.icon} label={o.label} description={o.description} selected={data.trainingType === o.value} onClick={() => activity({ trainingType: o.value })} />)}
          <label>جلسه در هفته: {n(data.workoutDays)}<input type="range" min={1} max={7} value={data.workoutDays} onChange={e => activity({ workoutDays: Number(e.target.value) })} /></label>
          <h3>مدت تمرین</h3><div className="admin-test-options">{DURATION_OPTIONS.map(o => <OptionCard key={o.value} label={o.label} description={o.description} selected={data.workoutDuration === o.value} onClick={() => activity({ workoutDuration: o.value })} />)}</div>
          <h3>شدت تمرین</h3>{INTENSITY_OPTIONS.map(o => <OptionCard key={o.value} label={o.label} description={o.description} selected={data.workoutIntensity === o.value} onClick={() => activity({ workoutIntensity: o.value })} />)}</>}
        <p className="admin-note">سطح فعالیت محاسبه‌شده: {deriveOnboardingActivity(data) ?? 'پس از تکمیل پاسخ‌ها'}</p>
      </>}
      {step === 2 && <>{data.gender ? <MedicalSafetyForm gender={data.gender} value={data} onChange={(patch: Partial<MedicalSafetyFormValue>) => update(patch)} /> : <p>ابتدا جنسیت را در مشخصات انتخاب کن.</p>}{blocked.status === 'blocked' && <p role="alert">برنامهٔ خودکار صادر نمی‌شود: {blocked.blockers.map(b => b.title).join('، ')}</p>}</>}
      {step === 3 && <>
        <h3>نوع رژیم</h3>{VEGETARIAN_OPTIONS.map(o => <OptionCard key={o.value} icon={o.icon} label={o.label} description={o.description} selected={data.vegetarianStatus === o.value} onClick={() => update({ vegetarianStatus: o.value })} />)}
        <h3>آلرژی یا عدم تحمل غذایی (اختیاری)</h3><div className="admin-test-options">{ALLERGIES.map(o => <CheckboxCard key={o.value} icon={o.icon} label={o.label} checked={data.allergies.includes(o.value)} onChange={() => update({ allergies: data.allergies.includes(o.value) ? data.allergies.filter(a => a !== o.value) : [...data.allergies, o.value] })} />)}</div>
        <h3>اولویت هزینه برای پروتئین</h3>{PROTEIN_BUDGET_OPTIONS.map(o => <OptionCard key={o.value} icon={o.icon} label={o.label} description={o.description} selected={data.proteinBudgetPreference === o.value} onClick={() => update({ proteinBudgetPreference: o.value })} />)}
        <div className="admin-test-options"><label>روز برنامه<input type="date" value={scenario.date} onChange={e => change({ date: e.target.value })} /></label><label>روز تمرین<PanelSelect value={scenario.isWorkoutDay ? 'yes' : 'no'} onChange={e => change({ isWorkoutDay: e.target.value === 'yes' })}><option value="no">روز بدون تمرین</option><option value="yes" disabled={!training}>روز تمرین</option></PanelSelect></label></div>
      </>}
      </div>
      <div className="admin-tools"><button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>قبلی</button>{step < steps.length - 1 && <button type="button" onClick={() => setStep(step + 1)}>بعدی</button>}<button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : currentId ? 'ذخیره تغییرات' : 'ذخیره سناریو'}</button>{currentId && <button type="button" disabled={busy} onClick={() => void remove()}>حذف سناریو</button>}</div>
      {step === steps.length - 1 && <><button type="button" disabled={catalog.loading || protein.loading || !catalog.catalog || !protein.policy} onClick={generate}>تولید و مشاهدهٔ برنامه</button>{(catalog.loading || protein.loading) && <p>در حال بارگیری داده‌های برنامه…</p>}{(catalog.error || protein.error) && <p role="alert">{catalog.error ?? protein.error} <button type="button" onClick={() => { void catalog.refetch(); void protein.refetch(); }}>تلاش دوباره</button></p>}</>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </section>
    {result && <section className="admin-card"><h2>پیش‌نمایش همان برنامهٔ روزانه</h2><p className="admin-note">سناریوی تازه، بدون وعدهٔ مصرف‌شده یا سابقهٔ روزهای قبل. مجموع غذاهای تولیدشده ممکن است اندکی با هدف ماکرو تفاوت داشته باشد.</p>
      <div className="admin-test-metrics"><div>کالری هدف<strong>{n(result.targets.targetCalories)}</strong></div><div>پروتئین هدف<strong>{n(result.targets.proteinGrams)} گرم</strong></div><div>کربوهیدرات هدف<strong>{n(result.targets.carbGrams)} گرم</strong></div><div>چربی هدف<strong>{n(result.targets.fatGrams)} گرم</strong></div></div>
      <div className="admin-plan"><MacroSummary targets={result.targets} consumed={{ targetCalories: 0, proteinGrams: 0, carbGrams: 0, fatGrams: 0, proteinCal: 0, carbCal: 0, fatCal: 0 }} planned={{ targetCalories: result.totals.kcal, proteinGrams: result.totals.protein, carbGrams: result.totals.carbs, fatGrams: result.totals.fat, proteinCal: 0, carbCal: 0, fatCal: 0 }} isWorkoutDay={scenario.isWorkoutDay} />
        <div className="admin-card">جمع غذاهای برنامه: {n(result.totals.kcal)} کالری · پروتئین {n(result.totals.protein)} · کربوهیدرات {n(result.totals.carbs)} · چربی {n(result.totals.fat)} گرم</div>
        <NutritionQualitySummary quality={evaluateDailyFoodQuality(result.plan.meals, result.targets.targetCalories)} />{result.plan.meals.map(meal => <MealCard key={meal.slot} meal={meal} readOnly onToggleConsumed={() => {}} onSwapComponent={() => {}} />)}</div><details><summary>جزئیات محاسبات و خروجی</summary><pre dir="ltr" className="admin-json">{JSON.stringify({ targets: result.targets, trace: result.trace, meals: result.plan.meals }, null, 2)}</pre></details>
    </section>}
    </div>
  </section>;
}
