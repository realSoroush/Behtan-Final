import { useCallback, useEffect, useRef, useState } from 'react';
import { memberRequest } from '../../member/api';
import type { MacroTargets } from '../../types';
import type { latestWeightReview } from '../../utils/weightReview';
import { MemberDialog } from './MemberDialog';
type Proposal = { reviewKey: string; weight: number; before: MacroTargets; after: MacroTargets; measurement: NonNullable<ReturnType<typeof latestWeightReview>> };
const number = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });
export function WeightReviewProposal({ userId, previewRequest = 0 }: { userId: string; previewRequest?: number }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pending = useRef(false);
  const preview = useCallback(async () => {
    if (pending.current) return; pending.current = true; setBusy(true); setMessage('');
    try {
      const result = await memberRequest<{ proposal: Proposal | null; measurement?: unknown }>('weight_review', { input: { kind: 'preview' } }, { userId });
      setProposal(result.proposal);
      if (!result.proposal) setMessage(result.measurement ? 'برنامه از قبل با همین وزن محاسبه شده؛ تغییری لازم نیست.' : 'ابتدا وزن امروز را ثبت کن تا تغییرات برنامه را ببینی.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'بازبینی دریافت نشد.'); }
    finally { pending.current = false; setBusy(false); }
  }, [userId]);
  useEffect(() => { if (previewRequest > 0) void preview(); }, [previewRequest, preview]);
  async function apply() {
    if (!proposal || busy) return; setBusy(true); setMessage('');
    try {
      await memberRequest('weight_review', { input: { kind: 'apply', reviewKey: proposal.reviewKey } }, { userId });
      setProposal(null); setMessage('وزن مبنا با تأیید تو به‌روز شد. ثبت‌های مصرف حفظ شده‌اند.');
      window.dispatchEvent(new Event('member-profile-changed'));
    } catch (e) { setProposal(null); setMessage(e instanceof Error ? e.message : 'تغییر ذخیره نشد.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-2"><button type="button" className="member-secondary" disabled={busy} onClick={() => void preview()}>{busy ? 'در حال بررسی…' : 'مشاهدهٔ تغییرات برنامه'}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {proposal && <MemberDialog title="به‌روزرسانی برنامه با وزن جدید" onClose={() => setProposal(null)} dismissible={!busy}>
      <p>وزن ثبت‌شده: {number(proposal.weight)} کیلوگرم؛ {new Date(proposal.measurement.entryDate + 'T12:00:00').toLocaleDateString('fa-IR')}.</p>
      <table className="w-full text-sm"><caption>مقایسهٔ هدف روز استراحت</caption>
        <thead><tr><th scope="col">هدف</th><th scope="col">قبلی</th><th scope="col">پیشنهادی</th></tr></thead>
        <tbody>{([['targetCalories','کالری'],['proteinGrams','پروتئین (گرم)'],['carbGrams','کربوهیدرات (گرم)'],['fatGrams','چربی (گرم)']] as const).map(([key,label]) =>
          <tr key={key}><th scope="row">{label}</th><td>{number(proposal.before[key])}</td><td>{number(proposal.after[key])}</td></tr>)}</tbody>
      </table>
      <p>با تأیید تو، برنامه با این وزن دوباره محاسبه می‌شود. هدف و سرعت انتخابی تو حفظ می‌شوند.</p>
      <button type="button" className="member-primary" disabled={busy} onClick={() => void apply()}>تأیید و به‌روزرسانی برنامه</button>
      <button type="button" className="member-secondary" disabled={busy} onClick={() => setProposal(null)}>فعلاً حفظ برنامه</button>
    </MemberDialog>}
  </section>;
}
