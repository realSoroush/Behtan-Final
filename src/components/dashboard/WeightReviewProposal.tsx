import { useState } from 'react';
import { memberRequest } from '../../member/api';
import type { MacroTargets } from '../../types';
import type { smoothedWeightReview } from '../../utils/weightReview';
import { MemberDialog } from './MemberDialog';
type Proposal = { reviewKey: string; weight: number; before: MacroTargets; after: MacroTargets; trend: NonNullable<ReturnType<typeof smoothedWeightReview>> };
const number = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });
export function WeightReviewProposal({ userId }: { userId: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function preview() {
    if (busy) return; setBusy(true); setMessage('');
    try {
      const result = await memberRequest<{ proposal: Proposal | null }>('weight_review', { input: { kind: 'preview' } }, { userId });
      setProposal(result.proposal);
      if (!result.proposal) setMessage('برای پیشنهاد تازه، در هر دو هفته حداقل سه وزن، یک وزن در سه روز اخیر و پاسخ کاملِ بدون مانع لازم است؛ یا وزن مبنا از قبل با روند برابر است.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'بازبینی دریافت نشد.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!proposal || busy) return; setBusy(true); setMessage('');
    try {
      await memberRequest('weight_review', { input: { kind: 'apply', reviewKey: proposal.reviewKey } }, { userId });
      setProposal(null); setMessage('وزن مبنا با تأیید تو به‌روز شد. ثبت‌های مصرف حفظ شده‌اند.');
      window.dispatchEvent(new Event('member-profile-changed'));
    } catch (e) { setProposal(null); setMessage(e instanceof Error ? e.message : 'تغییر ذخیره نشد.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-2"><button type="button" className="member-secondary" disabled={busy} onClick={() => void preview()}>{busy ? 'در حال بررسی…' : 'بازبینی برنامه با روند وزن'}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {proposal && <MemberDialog title="پیشنهاد به‌روزرسانی وزن مبنا" onClose={() => setProposal(null)} dismissible={!busy}>
      <p>میانهٔ هفتهٔ قبل: {number(proposal.trend.prior.median)}؛ هفتهٔ اخیر: {number(proposal.weight)} کیلوگرم.</p>
      <p>بازهٔ وزن‌های هفتهٔ اخیر: {number(proposal.trend.latest.min)} تا {number(proposal.trend.latest.max)}، از {number(proposal.trend.latest.count)} ثبت. این بازه میزان پراکندگی ثبت‌هاست.</p>
      <table className="w-full text-sm"><caption>مقایسهٔ هدف روز استراحت</caption>
        <thead><tr><th scope="col">هدف</th><th scope="col">قبلی</th><th scope="col">پیشنهادی</th></tr></thead>
        <tbody>{([['targetCalories','کالری'],['proteinGrams','پروتئین (گرم)'],['carbGrams','کربوهیدرات (گرم)'],['fatGrams','چربی (گرم)']] as const).map(([key,label]) =>
          <tr key={key}><th scope="row">{label}</th><td>{number(proposal.before[key])}</td><td>{number(proposal.after[key])}</td></tr>)}</tbody>
      </table>
      <p>فقط وزن مبنا با میانهٔ ثبت‌ها جایگزین می‌شود؛ سرعت هدف تغییر نمی‌کند. این پیشنهاد سرعت تغییر وزن را تأیید نمی‌کند. تغییر محسوس یا ناخواسته را با متخصص مرور کن.</p>
      <button type="button" className="member-primary" disabled={busy} onClick={() => void apply()}>تأیید و به‌روزرسانی برنامه</button>
      <button type="button" className="member-secondary" disabled={busy} onClick={() => setProposal(null)}>فعلاً حفظ برنامه</button>
    </MemberDialog>}
  </section>;
}
