import type { OnboardingData } from '@/types';
const goals={weight_loss:'کاهش وزن',weight_gain:'افزایش وزن',maintenance:'حفظ وزن'};
const fa=(n:number|null)=>n===null?'—':n.toLocaleString('fa-IR');
export function OnboardingReview({data}:{data:OnboardingData}){
 return <section className="onboarding-review" aria-label="خلاصهٔ پاسخ‌ها"><strong>{data.displayName?.trim()||'همراه به‌تن'}، این نقطهٔ شروع توست.</strong><dl><div><dt>قد</dt><dd>{fa(data.height)} سانتی‌متر</dd></div><div><dt>وزن فعلی</dt><dd>{fa(data.weight)} کیلوگرم</dd></div><div><dt>هدفت</dt><dd>{data.goal?goals[data.goal]:'—'}</dd></div></dl></section>;
}
