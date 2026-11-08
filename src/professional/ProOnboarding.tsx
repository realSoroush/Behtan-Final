import { PanelSelect } from '@/components/ui/PanelSelect';
import { useEffect, useState } from "react";
import { memberRpc } from "../member/api";
import { paymentRequest, type PaymentOrder } from "../lib/payments";
import { DURATIONS, offerPrice, type ProOffer } from "./modules";
import { track } from "../member/analytics";
import { registrationField, type SpecialistProfile } from './specialistProfile';
export function ProOnboarding({
  onComplete,
  profile,
  existing = false,
}: {
  onComplete: () => void;
  profile: SpecialistProfile;
  existing?: boolean;
}) {
  const [code, setCode] = useState(() => {
      const plan = new URLSearchParams(location.search).get('plan');
      return ['training','nutrition','combined'].includes(plan || '') ? plan! : existing ? 'nutrition' : 'trial';
    }),
    [months, setMonths] = useState(() => {
      const value = Number(new URLSearchParams(location.search).get('months'));
      return [1,3,6,12].includes(value) ? value : 1;
    }),
    [offers, setOffers] = useState<ProOffer[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    memberRpc<ProOffer[]>("pro_offer_catalog")
      .then(setOffers)
      .catch(() => setError("دریافت اشتراک‌ها انجام نشد."));
  }, []);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await memberRpc("pro_register", {
        p_name: profile.full_name,
        p_field: registrationField(profile.profession),
        p_trial: code === "trial",
      });
      track("pro_signup", { source: "pro" });
      if (code === "trial") {
        onComplete();
        return;
      }
      const offer = offers.find((o) => o.code === code);
      if (!offer) throw Error("اشتراک را دوباره انتخاب کن.");
      const r = await paymentRequest<{ order: PaymentOrder }>({
        action: "pro_checkout",
        planCode: code,
        priceToman: offerPrice(offer, months),
        durationDays: months * 30,
      });
      if (r.order.paymentUrl) {
        const url = new URL(r.order.paymentUrl);
        if (
          ![
            "https://payment.zarinpal.com",
            "https://sandbox.zarinpal.com",
          ].includes(url.origin)
        )
          throw Error("درگاه معتبر نیست.");
        window.location.assign(url.href);
      } else onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت انجام نشد.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="pro-empty pro-panel space-y-5">
      <h1 className="text-2xl font-bold">فضای کاری خودت را بساز</h1>
      <p>
        {profile.full_name}، مشخصات حرفه‌ای شما ثبت شده است. اشتراک مناسب خود را انتخاب کنید.
      </p>
      {error && <p role="alert">{error}</p>}
      <>
          <label>
            مدت دوره
            <PanelSelect
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {DURATIONS.map((d) => (
                <option key={d.months} value={d.months}>
                  {d.label}
                </option>
              ))}
            </PanelSelect>
          </label>
          <div className="space-y-3">
            {!existing && (
              <label className="block rounded-2xl border p-4">
                <input
                  type="radio"
                  name="pro-plan"
                  checked={code === "trial"}
                  onChange={() => setCode("trial")}
                />
                آزمایشی · رایگان · یک ماه · ساخت ۳ پرونده در مجموع
              </label>
            )}
            {offers.map((o) => (
              <label className="block rounded-2xl border p-4" key={o.code}>
                <input
                  type="radio"
                  name="pro-plan"
                  checked={code === o.code}
                  onChange={() => setCode(o.code)}
                />
                <strong>{o.title}</strong>
                <p>
                  {offerPrice(o, months).toLocaleString("fa-IR")} تومان برای کل
                  دوره
                </p>
                <small>{o.features.join(" · ")}</small>
              </label>
            ))}
          </div>
          <button
            className="pro-primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy
              ? "در حال ثبت…"
              : code === "trial"
                ? "ساخت پنل آزمایشی"
                : "پرداخت و ساخت پنل"}
          </button>
      </>
    </section>
  );
}
