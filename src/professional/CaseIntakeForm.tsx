import { PanelSelect } from "@/components/ui/PanelSelect";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useId, useRef, useState } from "react";
import { JalaliBirthDate } from "@/components/ui/JalaliBirthDate";
import { intakeEligibility, type CaseIntake } from "./intake";
const conditions = [
  ["diabetes", "دیابت"],
  ["kidney_disease", "بیماری کلیه"],
  ["heart_disease", "بیماری قلبی"],
  ["advanced_liver_disease", "بیماری پیشرفتهٔ کبد"],
  ["fatty_liver", "کبد چرب"],
  ["pcos", "تخمدان پلی‌کیستیک"],
  ["thyroid", "تیروئید"],
] as const;
const allergies = [
  ["dairy", "لبنیات"],
  ["gluten", "گلوتن"],
  ["peanut", "بادام زمینی"],
  ["tree_nut", "مغزهای درختی"],
  ["soy", "سویا"],
  ["seafood", "غذای دریایی"],
] as const;
export function CaseIntakeForm({
  value: a,
  onChange,
  disabled = false,
  identity,
}: {
  value: CaseIntake;
  onChange: (a: CaseIntake) => void;
  disabled?: boolean;
  identity?: React.ReactNode;
}) {
  const [step, setStep] = useState(0);
  const instance = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const sections = ["مشخصات اولیه", "فعالیت و هدف", "ترجیحات غذایی", "ایمنی پزشکی"];
  const hints = ["مشخصات پایه برای شروع یک برنامه شخصی.", "هدف و سبک زندگی مراجع را مشخص کنید.", "برنامه‌ای هماهنگ با سلیقه و شرایط مراجع.", "پاسخ‌ها را بررسی و برای ذخیره تأیید کنید."];
  const patch = (p: Partial<CaseIntake>) =>
    onChange({ ...a, ...p, safety_confirmed: p.safety_confirmed ?? false });
  const result = intakeEligibility(a);
  return (
    <div className="pro-intake">
      <div className="pro-intake-title"><div><span className="pro-section-kicker">اطلاعات مراجع</span><h3>{sections[step]}</h3><p>{hints[step]}</p></div><span className="pro-step-count">{(step + 1).toLocaleString('fa-IR')} / ۴</span></div>
      <div
        ref={tabs}
        className="pro-tabs"
        role="tablist"
        aria-label="بخش‌های اطلاعات مراجع"
      >
        {sections.map(
          (x, i) => (
            <button
              key={x}
              role="tab"
              aria-selected={step === i}
              id={`${instance}-tab-${i}`}
              aria-controls={`${instance}-panel`}
              tabIndex={step === i ? 0 : -1}
              onKeyDown={(e) => {
                const next = e.key === 'ArrowLeft' ? (i + 1) % 4 : e.key === 'ArrowRight' ? (i + 3) % 4 : e.key === 'Home' ? 0 : e.key === 'End' ? 3 : null;
                if (next !== null) { e.preventDefault(); setStep(next); (tabs.current?.children[next] as HTMLButtonElement)?.focus(); }
              }}
              onClick={() => setStep(i)}
              type="button"
            >
              <span className="pro-step-number" aria-hidden="true">{(i + 1).toLocaleString('fa-IR')}</span>{x}
            </button>
          ),
        )}
      </div>
      <fieldset disabled={disabled} id={`${instance}-panel`} role="tabpanel" aria-labelledby={`${instance}-tab-${step}`} tabIndex={0}>
        {step === 0 && (
          <div className="pro-form-grid">
            {identity}
            <label>
              جنسیت
              <PanelSelect
                value={a.gender}
                onChange={(e) =>
                  patch({
                    gender: e.target.value as CaseIntake["gender"],
                    pregnancy_status:
                      e.target.value === "male"
                        ? "not_applicable"
                        : "not_pregnant",
                    medical_conditions:
                      e.target.value === "male"
                        ? a.medical_conditions.filter((c) => c !== "pcos")
                        : a.medical_conditions,
                  })
                }
              >
                <option value="female">زن</option>
                <option value="male">مرد</option>
              </PanelSelect>
            </label>
            <JalaliBirthDate
              selectComponent={PanelSelect}
              value={a.birth_date}
              onChange={(birth_date) => patch({ birth_date })}
              invalid={Boolean(a.birth_date && result.age === null)}
            />
            <label>
              قد (سانتی‌متر)
              <input
                aria-label="قد (سانتی‌متر)"
                type="number"
                min={100}
                max={250}
                step={0.1}
                value={a.height_cm || ""}
                onChange={(e) => patch({ height_cm: Number(e.target.value) })}
              />
            </label>
            <label>
              وزن (کیلوگرم)
              <input
                aria-label="وزن (کیلوگرم)"
                type="number"
                min={30}
                max={300}
                step={0.1}
                value={a.weight_kg || ""}
                onChange={(e) => patch({ weight_kg: Number(e.target.value) })}
              />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="pro-form-grid">
            <label>
              هدف
              <PanelSelect
                value={a.goal}
                onChange={(e) =>
                  patch({ goal: e.target.value as CaseIntake["goal"] })
                }
              >
                <option value="weight_loss">کاهش وزن</option>
                <option value="weight_gain">افزایش وزن</option>
                <option value="maintenance">حفظ وزن</option>
              </PanelSelect>
            </label>
            <label>
              تحرک روزانه
              <PanelSelect
                value={a.activity_level}
                onChange={(e) =>
                  patch({
                    activity_level: e.target
                      .value as CaseIntake["activity_level"],
                  })
                }
              >
                <option value="sedentary">کم‌تحرک</option>
                <option value="lightly_active">فعالیت سبک</option>
                <option value="moderate">فعالیت متوسط</option>
                <option value="active">فعالیت زیاد</option>
              </PanelSelect>
            </label>
            <label>
              جلسات ورزش در هفته
              <input
                type="number"
                min={0}
                max={7}
                step={1}
                value={a.workout_days}
                onChange={(e) => {
                  const days = Number(e.target.value);
                  patch({
                    workout_days: days,
                    training_type:
                      days === 0
                        ? "none"
                        : a.training_type === "none"
                          ? "resistance"
                          : a.training_type,
                  });
                }}
              />
            </label>
            <label>
              نوع تمرین
              <PanelSelect
                value={a.training_type}
                disabled={a.workout_days === 0}
                onChange={(e) =>
                  patch({
                    training_type: e.target
                      .value as CaseIntake["training_type"],
                  })
                }
              >
                {a.workout_days === 0 ? (
                  <option value="none">ورزش ندارد</option>
                ) : (
                  <>
                    <option value="resistance">مقاومتی</option>
                    <option value="cardio">هوازی</option>
                    <option value="mixed">ترکیبی</option>
                  </>
                )}
              </PanelSelect>
            </label>
          </div>
        )}
        {step === 2 && (
          <>
            <div className="pro-form-grid">
              <label>
                ترجیح منابع پروتئین
                <PanelSelect
                  value={a.protein_budget}
                  onChange={(e) =>
                    patch({
                      protein_budget: e.target
                        .value as CaseIntake["protein_budget"],
                    })
                  }
                >
                  <option value="economic">اقتصادی</option>
                  <option value="balanced">متعادل</option>
                  <option value="performance">عملکردی</option>
                </PanelSelect>
              </label>
              <label>
                الگوی غذایی
                <PanelSelect
                  value={a.vegetarian_status}
                  onChange={(e) =>
                    patch({
                      vegetarian_status: e.target
                        .value as CaseIntake["vegetarian_status"],
                    })
                  }
                >
                  <option value="none">بدون محدودیت گیاه‌خواری</option>
                  <option value="vegan">وگان</option>
                  <option value="lacto_ovo">
                    گیاه‌خواری با لبنیات و تخم‌مرغ
                  </option>
                  <option value="pescatarian">گیاه‌خواری با ماهی</option>
                  <option value="raw">خام‌گیاه‌خواری</option>
                </PanelSelect>
              </label>
            </div>
            <h4>حساسیت غذایی</h4>
            <div className="pro-check-grid">
              {allergies.map(([id, label]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={a.allergies.includes(id)}
                    onChange={(e) =>
                      patch({
                        allergies: e.target.checked
                          ? [...a.allergies, id]
                          : a.allergies.filter((x) => x !== id),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h4>شرایط پزشکی گزارش‌شده</h4>
            <div className="pro-check-grid">
              {conditions
                .filter(([id]) => id !== "pcos" || a.gender === "female")
                .map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={a.medical_conditions.includes(id)}
                      onChange={(e) =>
                        patch({
                          medical_conditions: e.target.checked
                            ? [...a.medical_conditions, id]
                            : a.medical_conditions.filter((x) => x !== id),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
            </div>
            <div className="pro-form-grid">
              <label>
                بارداری و شیردهی
                <PanelSelect
                  value={a.pregnancy_status}
                  disabled={a.gender === "male"}
                  onChange={(e) =>
                    patch({
                      pregnancy_status: e.target
                        .value as CaseIntake["pregnancy_status"],
                    })
                  }
                >
                  {a.gender === "male" ? (
                    <option value="not_applicable">موضوعیت ندارد</option>
                  ) : (
                    <>
                      <option value="not_pregnant">باردار یا شیرده نیست</option>
                      <option value="pregnant">باردار</option>
                      <option value="breastfeeding">شیرده</option>
                    </>
                  )}
                </PanelSelect>
              </label>
              <label>
                وضعیت اختلال خوردن
                <PanelSelect
                  value={a.eating_disorder_status}
                  onChange={(e) =>
                    patch({
                      eating_disorder_status: e.target
                        .value as CaseIntake["eating_disorder_status"],
                    })
                  }
                >
                  <option value="none">گزارش نشده</option>
                  <option value="history">سابقه در گذشته</option>
                  <option value="active_or_treatment">فعال یا تحت درمان</option>
                </PanelSelect>
              </label>
            </div>
            <div className="pro-check-grid">
              <label>
                <input
                  type="checkbox"
                  checked={a.medications_present}
                  onChange={(e) =>
                    patch({ medications_present: e.target.checked })
                  }
                />
                مصرف دارو گزارش شده
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={a.injuries_present}
                  onChange={(e) =>
                    patch({ injuries_present: e.target.checked })
                  }
                />
                آسیب جسمی گزارش شده
              </label>
            </div>
            <label className="pro-confirm">
              <input
                type="checkbox"
                checked={a.safety_confirmed}
                onChange={(e) =>
                  onChange({ ...a, safety_confirmed: e.target.checked })
                }
              />
              پاسخ‌های ثبت‌شده را با مراجع بررسی کردم.
            </label>
            {a.safety_confirmed && result.status === "blocked" && (
              <div className="pro-error" role="status">
                <strong>ساخت خودکار برنامه برای این شرایط مجاز نیست.</strong>
                <ul>
                  {result.blockers.map((b) => (
                    <li key={b.code}>{b.title}</li>
                  ))}
                </ul>
                <p>ذخیرهٔ اطلاعات، این توقف پزشکی را رفع نمی‌کند.</p>
              </div>
            )}
          </>
        )}
      </fieldset>
      <div className="pro-intake-navigation"><button type="button" disabled={step === 0} onClick={() => setStep(s => s - 1)}><ArrowRight size={16} />بخش قبل</button><span>{sections[step]}</span>{step < 3 ? <button type="button" onClick={() => setStep(s => s + 1)}>بخش بعد<ArrowLeft size={16} /></button> : <span className="pro-last-step">آمادهٔ بررسی و ذخیره</span>}</div>
    </div>
  );
}
