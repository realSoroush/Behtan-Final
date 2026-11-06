import {workoutForDate} from '@/member/nutrition';
import { useState, useRef, useEffect } from "react";
import type {
  DailyMealPlan,
  UserProfile,
} from "@/types";
import type { MealIntent } from "@/hooks/useMemberMealSchedule";
import { addPlanDays, componentAmount, sumPlanIngredients } from "@/utils/mealPresentation";
import { MemberDialog } from "./MemberDialog";
import { FoodPlate } from "./visuals/FoodPlate";
type Schedule = {
  plans: Record<string, DailyMealPlan>;
  saving: boolean;
  error: string | null;
  submit: (date: string, intent: MealIntent) => Promise<void>;
};
export function WeekPlanner({
  today,
  plan,
  profile,
  schedule,
  onRetry,
  onClose,
}: {
  today: string;
  plan: DailyMealPlan;
  profile: UserProfile;
  schedule: Schedule;
  onRetry: () => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(today),
    [error, setError] = useState("");
  const [building, setBuilding] = useState(false);
  const [view,setView]=useState<'meals'|'ingredients'>('meals');
  const [progress,setProgress]=useState(0);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const days = Array.from({ length: 7 }, (_, i) => addPlanDays(today, i));
  const current = selected === today ? plan : schedule.plans[selected];
  const generate = async () => {
    setError("");
    setBuilding(true);
    try {
      for (const [offset, date] of days.slice(1).entries()) {
        if (!alive.current) return;
        if (schedule.plans[date]) continue;
        setProgress(offset + 1);
        await schedule.submit(date, {
          kind: 'generate', regenerate: false,
          workout: workoutForDate(date, profile.workout_weekdays, profile.workout_days ?? 0),
        });
      }
    } catch (e) {
      if(alive.current)setError(e instanceof Error ? e.message : "آماده‌سازی انجام نشد.");
    } finally {
      if(alive.current)setBuilding(false);
    }
  };
  const changeWorkout = async () => {
    if (selected === today || !current || schedule.error || building) return;
    setError('');
    try {
      await schedule.submit(selected, { kind: 'generate', workout: !current.isWorkoutDay, regenerate: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تغییر روز ذخیره نشد.");
    }
  };
  const available = days.every((d) => d === today || schedule.plans[d]);
  const readyPlans=days.flatMap(date=>date===today?[plan]:schedule.plans[date]?[schedule.plans[date]]:[]);
  const ingredients=sumPlanIngredients(readyPlans);
  return (
    <MemberDialog title="برنامهٔ هفت روز آینده" onClose={onClose} wide>
      <p className="member-muted">
        برنامهٔ روزهای آینده برای خرید و آماده‌سازی ذخیره می‌شود. اگر شرایط،
        ترجیحات یا اطلاعات مبنای برنامه را تغییر دهی، دوباره ساخته می‌شود.
      </p>
      <div className="week-dates" aria-label="انتخاب روز">
        {days.map((date) => (
          <button
            type="button"
            key={date}
            aria-pressed={selected === date}
            onClick={() => setSelected(date)}
          >
            <span>
              {date === today
                ? "امروز"
                : new Date(date + "T12:00:00").toLocaleDateString("fa-IR", {
                    weekday: "short",
                  })}
            </span>
            <b>
              {new Date(date + "T12:00:00").toLocaleDateString("fa-IR", {
                day: "numeric",
                month: "short",
              })}
            </b>
            <i
              className={
                schedule.plans[date] || date === today ? "is-ready" : ""
              }
            />
          </button>
        ))}
      </div>
      {schedule.error ? (
        <div role="alert" className="member-notice">
          {schedule.error}
          <button
            type="button"
            className="member-secondary"
            onClick={() => void onRetry()}
          >
            تلاش دوباره
          </button>
        </div>
      ) : (
        !available && (
          <button
            type="button"
            className="member-primary"
            onClick={() => void generate()}
            disabled={building || schedule.saving}
          >
            {building || schedule.saving
              ? `در حال آماده‌سازی ${progress.toLocaleString("fa-IR")} از ۶…`
              : "آماده‌سازی و ذخیرهٔ برنامهٔ هفته"}
          </button>
        )
      )}
      {error && (
        <p role="status" className="member-notice">
          {error}
        </p>
      )}
      <div className="week-view-switch" aria-label="نوع نمایش هفته"><button type="button" aria-pressed={view==='meals'} onClick={()=>setView('meals')}>وعده‌های روز</button><button type="button" aria-pressed={view==='ingredients'} onClick={()=>setView('ingredients')}>فهرست مواد</button></div>
      {view==='ingredients'?<div className="week-ingredients"><div><h3>مواد لازم برای {readyPlans.length.toLocaleString('fa-IR')} روز آماده</h3><p>جمع مقدارهای برنامه؛ وزن خشک و پختهٔ هر ماده را هنگام اندازه‌گیری بررسی کن.</p></div><ul>{ingredients.map(item=><li key={item.id}><span>{item.name}</span><strong>{(item.isLiquid?item.grams:item.unitLabel==='گرم'?item.grams:item.units).toLocaleString('fa-IR',{maximumFractionDigits:1})}<small> {item.isLiquid?'میلی‌لیتر':item.unitLabel}</small>{!item.isLiquid&&item.unitLabel!=='گرم'&&<em>{Math.round(item.grams).toLocaleString('fa-IR')} گرم</em>}</strong></li>)}</ul></div>:current ? (
        <>
          <div className="week-day-title">
            <h3>
              {selected === today
                ? "برنامهٔ امروز"
                : new Date(selected + "T12:00:00").toLocaleDateString("fa-IR", {
                    day: "numeric",
                    month: "long",
                  })}
            </h3>
            {selected !== today && (
              <button
                type="button"
                className="member-secondary"
                role="switch"
                aria-checked={current.isWorkoutDay}
                disabled={schedule.saving || building || Boolean(schedule.error)}
                onClick={() => void changeWorkout()}
              >
                {current.isWorkoutDay
                  ? "روز ورزشی ✓"
                  : "روز معمولی · تغییر به ورزشی"}
              </button>
            )}
          </div>
          {current.meals.map((meal) => (
            <article className="week-meal" key={meal.slot}>
              <FoodPlate meal={meal} />
              <div>
                <h4>{meal.label}</h4>
                <p>
                  {Math.round(meal.totalKcal).toLocaleString("fa-IR")} کالری
                </p>
                <ul>
                  {meal.components.map((c, i) => (
                    <li key={i}>
                      {c.foodItem.name}
                      <span>{componentAmount(c)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
          <p className="member-muted">
            ثبت مصرف و جایگزینی مواد از برنامهٔ همان روز انجام می‌شود. می‌توانی روز ورزشی را از همین‌جا تغییر بدهی.
          </p>
        </>
      ) : (
        <p className="member-empty">
          برنامهٔ این روز هنوز ساخته نشده؛ ابتدا برنامهٔ هفته را آماده کن.
        </p>
      )}
    </MemberDialog>
  );
}
