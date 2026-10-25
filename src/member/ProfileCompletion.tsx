import {Input} from '@/components/ui/Input';
import { useState, useEffect } from "react";
import type { UserProfile } from "../types";
import { supabase } from "../lib/supabaseClient";
import { WEEKDAYS } from "../training/engine";
export function ProfileCompletion({ profile }: { profile: UserProfile }) {
  const [city, setCity] = useState(profile.city ?? ""),
    [province, setProvince] = useState(profile.province ?? ""),
    [days, setDays] = useState<number[]>(profile.workout_weekdays ?? []),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(()=>{setCity(profile.city??'');setProvince(profile.province??'');setDays(profile.workout_weekdays??[]);},[profile.city,profile.province,profile.workout_weekdays]);
  return (
    <details className="member-chart-card member-profile-form">
      <summary>تکمیل پروفایل و روزهای ورزش</summary>
      <div className="profile-form-fields">
        <p className="member-muted">
          شهر و استان اختیاری‌اند. روزهای انتخابی، مبنای آماده‌سازی برنامهٔ هفته
          می‌شوند.
        </p>
        <Input label="استان" placeholder="استان محل زندگی"
            disabled={busy}
            maxLength={80}
            value={province}
            onChange={(e) => setProvince(e.target.value)}
          />

        <Input label="شهر" placeholder="شهر محل زندگی"
            disabled={busy}
            maxLength={80}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />

        <div className="member-period">
          {WEEKDAYS.map((d, i) => (
            <button
              type="button"
              disabled={busy}
              aria-pressed={days.includes(i)}
              key={i}
              onClick={() =>
                setDays((old) =>
                  old.includes(i) ? old.filter((x) => x !== i) : [...old, i],
                )
              }
            >
              {d}
            </button>
          ))}
        </div>
        <button
          className="member-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setNotice("");
            try {
            const { error } = await supabase
              .from("user_profiles")
              .update({
                city: city.trim(),
                province: province.trim(),
                workout_weekdays: days,
                workout_days: days.length,
              })
              .eq("id", profile.id);
            setNotice(
              error ? "ذخیره نشد. دوباره تلاش کن." : "پروفایل به‌روز شد.",
            );
            if (!error)
              window.dispatchEvent(new Event("member-profile-changed"));
            } catch {
              setNotice("ذخیره نشد. اتصال اینترنت را بررسی کن و دوباره تلاش کن.");
            } finally { setBusy(false); }
          }}
        >
          {busy ? "در حال ذخیره…" : "ذخیرهٔ تغییرات"}
        </button>
        <p role="status">{notice}</p>
      </div>
    </details>
  );
}
