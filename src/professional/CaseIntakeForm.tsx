import { useState } from "react";
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
}: {
  value: CaseIntake;
  onChange: (a: CaseIntake) => void;
  disabled?: boolean;
}) {
  const [step, setStep] = useState(0);
  const patch = (p: Partial<CaseIntake>) =>
    onChange({ ...a, ...p, safety_confirmed: p.safety_confirmed ?? false });
  const result = intakeEligibility(a);
  return (
    <div className="pro-intake">
      <div
        className="pro-tabs"
        role="tablist"
        aria-label="بخش‌های اطلاعات مراجع"
      >
        {["مشخصات جسمی", "فعالیت و هدف", "ترجیحات غذایی", "ایمنی پزشکی"].map(
          (x, i) => (
            <button
              key={x}
              role="tab"
              aria-selected={step === i}
              onClick={() => setStep(i)}
              type="button"
            >
              {x}
            </button>
          ),
        )}
      </div>
      <fieldset disabled={disabled}>
        {step === 0 && (
          <div className="pro-form-grid">
            <label>
              جنسیت
              <select
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
              </select>
            </label>
            <JalaliBirthDate
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
              <select
                value={a.goal}
                onChange={(e) =>
                  patch({ goal: e.target.value as CaseIntake["goal"] })
                }
              >
                <option value="weight_loss">کاهش وزن</option>
                <option value="weight_gain">افزایش وزن</option>
                <option value="maintenance">حفظ وزن</option>
              </select>
            </label>
            <label>
              تحرک روزانه
              <select
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
              </select>
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
              <select
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
              </select>
            </label>
          </div>
        )}
        {step === 2 && (
          <>
            <div className="pro-form-grid">
              <label>
                ترجیح منابع پروتئین
                <select
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
                </select>
              </label>
              <label>
                الگوی غذایی
                <select
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
                </select>
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
                <select
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
                </select>
              </label>
              <label>
                وضعیت اختلال خوردن
                <select
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
                </select>
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
              پاسخ‌های ایمنی این سناریوی مصنوعی را بررسی کردم.
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
    </div>
  );
}
