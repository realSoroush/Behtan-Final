import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AuthoredNutritionPreview } from '@/professional/AuthoredNutritionPreview';
import type { AuthoredContent } from '@/professional/authoredPlan';

type Prescription = { id: string; content: AuthoredContent; recorded_at: string; delivered_at: string };
const pageSize = 10;

export function PrescribedNutrition() {
  const [rows, setRows] = useState<Prescription[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);

  async function load(more = false) {
    if (busy) return;
    setBusy(true);
    setError(false);
    const last = more && rows ? rows[rows.length - 1] : undefined;
    if (!more) { setRows(null); setActive(null); }
    try {
      const { data, error: failure } = await supabase.rpc('member_prescribed_nutrition', {
        p_before: last?.delivered_at ?? null, p_before_id: last?.id ?? null,
      }).abortSignal(AbortSignal.timeout(12000)).retry(false);
      if (failure) throw failure;
      const page = (data ?? []) as Prescription[];
      setRows(previous => [...(more ? previous ?? [] : []), ...page.slice(0, pageSize)]);
      setHasMore(page.length > pageSize);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  return <section aria-label="برنامه‌های متخصص" className="my-4 space-y-3 rounded-xl border border-current/20 p-4" aria-busy={busy}>
    <h2 className="font-bold">برنامه‌های متخصص</h2>
    <button type="button" className="member-secondary" disabled={busy} onClick={() => void load()}>
      {busy ? 'در حال دریافت…' : rows ? 'تازه‌سازی برنامه‌ها' : 'دریافت برنامه‌ها'}
    </button>
    {error && <p role="alert">دریافت برنامه‌ها انجام نشد. دوباره تلاش کن.</p>}
    {rows?.length === 0 && <p>هنوز برنامه‌ای از متخصص دریافت نکرده‌ای.</p>}
    {rows?.map(row => <article key={row.id} className="space-y-3 rounded-lg border border-current/20 p-3">
      <button type="button" className="w-full text-start font-semibold" aria-expanded={active === row.id}
        onClick={() => setActive(active === row.id ? null : row.id)}>
        {row.content.title} · {new Date(row.recorded_at).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })}
      </button>
      {active === row.id && <AuthoredNutritionPreview content={row.content} showTitle={false} />}
    </article>)}
    {rows && hasMore && <button type="button" className="member-secondary" disabled={busy} onClick={() => void load(true)}>برنامه‌های قدیمی‌تر</button>}
  </section>;
}
