import { useEffect, useState, useRef } from "react";
import { useOnboardingStore } from "../hooks/useOnboardingStore";
import { createEmptyOnboardingData, type BodyScanResult, type UserProfile } from "../types";
import { Step9BodyScan } from "../components/onboarding/Step9BodyScan";
import { Step10Analysis } from "../components/onboarding/Step10Analysis";
import { MemberDialog } from "../components/dashboard/MemberDialog";
import { memberRpc } from "./api";
import { supabase } from "../lib/supabaseClient";

export function BodyReview({
  profile,
  onClose,
}: {
  profile: UserProfile;
  onClose: () => void;
}) {
  const initialProfile = useRef(profile);
  const step = useOnboardingStore((s) => s.currentStep);
  const scanResult = useOnboardingStore((s) => s.data.bodyScanResult);
  const [nextAt,setNextAt] = useState<string|null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const profile = initialProfile.current;
    const previous = useOnboardingStore.getState();
    let alive = true;
    void memberRpc<{ scan_next_at: string | null }>("member_entitlements")
      .then(async (a) => {
        if (!alive) return;
        const reports = await supabase.from('member_body_reports').select('result').eq('user_id',profile.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
        if(!alive)return;
        if(reports.error)throw reports.error;
        const latest = reports.data?.result as BodyScanResult | undefined;
        setNextAt(a.scan_next_at);
        useOnboardingStore.setState({
          currentStep: latest ? 10 : 9,
          data: {
            ...createEmptyOnboardingData(),
            bodyScanResult: latest ?? null,
            displayName: profile.display_name ?? "",
            weight: profile.weight,
            height: profile.height,
            gender: profile.gender,
            birthDate: profile.birth_date ?? "",
          },
          isSubmitting: false,
          submitError: null,
          progressSaver: async () => {
            // The Edge Function stores the validated result before replying.
            setNextAt(new Date(Date.now()+5*86400000).toISOString());
            window.dispatchEvent(new Event("member-profile-changed"));
          },
        });
        setReady(true);
      })
      .catch(() => setError("دریافت وضعیت تحلیل انجام نشد."));
    return () => {
      alive = false;
      useOnboardingStore.setState(previous);
    };
  }, [profile.id]);
  return (
    <MemberDialog title="تحلیل پیشرفتهٔ ترکیب بدن" onClose={onClose}>
      <button className="member-secondary" onClick={onClose}>
        بازگشت
      </button>
      <p className="member-muted">
        برآورد تصویری است؛ جایگزین اندازه‌گیری پزشکی نیست و کالری برنامه را
        تغییر نمی‌دهد. هر ۵ روز یک بار در دسترس است.
      </p>
      {nextAt && <p className="member-muted">تحلیل بعدی از {new Date(nextAt).toLocaleDateString("fa-IR")} در دسترس است.</p>}
      {ready && (!nextAt || Date.parse(nextAt)<=Date.now()) && step===10 && <button className="member-secondary" onClick={()=>useOnboardingStore.setState({currentStep:9,data:{...useOnboardingStore.getState().data,bodyScanResult:null}})}>تحلیل جدید</button>}
      {error ? (
        <p role="alert">{error}</p>
      ) : !ready ? (
        <p>در حال آماده‌سازی…</p>
      ) : step >= 11 ? (
        <div>
          <p>{scanResult ? "نتیجه ثبت شد." : "تحلیل انجام نشد؛ هر وقت خواستی می‌توانی دوباره به این بخش برگردی."}</p>
          <button className="member-primary" onClick={onClose}>
            برگشت به حساب من
          </button>
        </div>
      ) : step === 9 ? (
        <Step9BodyScan />
      ) : (
        <Step10Analysis />
      )}
    </MemberDialog>
  );
}
