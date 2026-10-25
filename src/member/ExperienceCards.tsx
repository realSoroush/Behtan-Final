import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { ProgressEntry } from "../utils/progressJournal";
import { experienceLabels } from "./experienceLabels";
export function ExperienceCards({ userId }: { userId: string }) {
  const [rows, setRows] = useState<
      (ProgressEntry & { id: string; created_at: string })[]
    >([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => {
      setLoading(true);
      setError(false);
      void supabase
        .from("member_experiences")
        .select(
          "id,entry_date,created_at,weight_kg,adherence,hunger,difficulty",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5)
        .then(({ data, error }) => {
          if (active) {
            setLoading(false);
            setError(Boolean(error));
            setRows(data ?? []);
          }
        });
    };
    load();
    window.addEventListener("member-profile-changed", load);
    return () => {
      active = false;
      window.removeEventListener("member-profile-changed", load);
    };
  }, [userId,retry]);
  return (
    <section className="member-experience-cards space-y-3">
      <h2 className="font-bold">۵ تجربهٔ آخر تو</h2>
      {loading ? <p role="status" className="member-muted">در حال دریافت تجربه‌ها…</p> : error ? (
        <div role="alert"><p>دریافت تجربه‌ها انجام نشد.</p><button type="button" className="member-secondary" onClick={()=>setRetry(v=>v+1)}>تلاش دوباره</button></div>
      ) : !rows.length ? (
        <p className="member-muted">
          اولین وزن و تجربه‌ات را در «روند من» ثبت کن.
        </p>
      ) : (
        rows.map((e) => (
          <article key={e.id} className="member-chart-card">
            <small>{new Date(e.created_at).toLocaleString("fa-IR")}</small>
            {e.weight_kg && (
              <strong className="block text-lg">
                {Number(e.weight_kg).toLocaleString("fa-IR")} کیلوگرم
              </strong>
            )}
            <p>
              {[e.adherence, e.hunger, e.difficulty]
                .filter(Boolean)
                .map((x) => experienceLabels[x!] ?? x)
                .join(" · ") || "وزن تازه ثبت شد"}
            </p>
          </article>
        ))
      )}
    </section>
  );
}
