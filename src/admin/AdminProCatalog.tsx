import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PanelModal } from "@/components/ui/PanelModal";
import { PanelSelect } from "@/components/ui/PanelSelect";
import { DURATIONS, type ProOffer } from "@/professional/modules";
export async function commercialRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(15000))
    .retry(false);
  if (error) throw new Error(error.message);
  return data as T;
}
const errorText = (e: unknown) =>
  e instanceof Error && e.message.includes("PRO_STALE_REVISION")
    ? "اطلاعات در جای دیگری تغییر کرده است؛ پنجره را ببندید و دوباره باز کنید."
    : e instanceof Error && e.message.includes("PRO_INVALID_REQUEST")
      ? "نام، امکانات و قیمت‌های صحیح را بررسی کنید."
      : "ثبت کامل نشد؛ با همان درخواست دوباره تلاش کنید.";
export function AdminProCatalog() {
  const [rows, setRows] = useState<ProOffer[]>([]),
    [selected, setSelected] = useState<ProOffer | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [working, setWorking] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setRows(await commercialRpc("admin_pro_offers"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="admin-pro-commercial">
      <div className="admin-pro-commercial-head">
        <div>
          <h3>تعرفه‌های پنل متخصصین</h3>
          <p className="admin-note">
            نام، امکانات و قیمت کل دوره در صفحهٔ عمومی نمایش داده می‌شوند؛ تغییر
            تعرفه، مجوز پنل‌های موجود را تغییر نمی‌دهد.
          </p>
        </div>
        <button disabled={busy} onClick={() => void load()}>
          دریافت تعرفه‌ها
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="admin-pro-offer-grid">
        {rows.map((o) => (
          <article key={o.code}>
            <strong>{o.title}</strong>
            <small>
              از {o.prices["1"].toLocaleString("fa-IR")} تومان / ماه
            </small>
            <span>{o.active ? "نمایش فعال" : "نمایش غیرفعال"}</span>
            <button onClick={() => setSelected(o)}>
              ویرایش تعرفه {o.title}
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <PanelModal
          title="ویرایش تعرفه و مشخصات پلن"
          busy={working}
          onClose={() => setSelected(null)}
        >
          <OfferEditor
            offer={selected}
            onBusy={setWorking}
            onSaved={() => {
              setSelected(null);
              void load();
            }}
          />
        </PanelModal>
      )}
    </section>
  );
}
function OfferEditor({
  offer,
  onBusy,
  onSaved,
}: {
  offer: ProOffer;
  onBusy: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(offer.title),
    [subtitle, setSubtitle] = useState(offer.subtitle),
    [features, setFeatures] = useState(offer.features.join("\n")),
    [prices, setPrices] = useState(offer.prices),
    [active, setActive] = useState(Boolean(offer.active)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<Record<string, unknown> | null>(null);
  async function save() {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const request = pending.current ?? {
        p_code: offer.code,
        p_expected: offer.revision,
        p_title: title.trim(),
        p_subtitle: subtitle.trim(),
        p_features: features
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        p_prices: prices,
        p_active: active,
        p_key: crypto.randomUUID(),
      };
      pending.current = request;
      await commercialRpc("admin_pro_save_offer", request);
      pending.current = null;
      onSaved();
    } catch (e) {
      if (
        e instanceof Error &&
        /INVALID_REQUEST|STALE_REVISION/.test(e.message)
      )
        pending.current = null;
      setError(errorText(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="admin-pro-offer-editor">
      {error && <p role="alert">{error}</p>}
      <fieldset
        disabled={busy || Boolean(pending.current)}
        className="pro-form-grid"
      >
        <label>
          نام کارت
          <input
            aria-label="نام کارت اشتراک"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          توضیح کوتاه
          <input
            value={subtitle}
            maxLength={300}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </label>
        <label className="admin-pro-wide">
          امکانات؛ هر سطر یک مورد
          <textarea
            aria-label="امکانات پلن"
            value={features}
            rows={6}
            onChange={(e) => setFeatures(e.target.value)}
          />
        </label>
        {DURATIONS.map((d) => (
          <label key={d.months}>
            قیمت کل دوره {d.label} (تومان)
            <input
              aria-label={"قیمت " + d.label}
              type="number"
              min={0}
              max={1000000000}
              step={1}
              value={prices[String(d.months)]}
              onChange={(e) =>
                setPrices({
                  ...prices,
                  [String(d.months)]: Number(e.target.value),
                })
              }
            />
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          نمایش در صفحه متخصصین
        </label>
      </fieldset>
      <button
        disabled={
          busy ||
          !title.trim() ||
          !features.trim() ||
          Object.values(prices).some(
            (v) => !Number.isSafeInteger(v) || v < 0 || v > 1000000000,
          )
        }
        onClick={() => void save()}
      >
        {pending.current ? "تلاش مجدد ثبت تعرفه" : "ذخیره تعرفه"}
      </button>
      <p className="admin-note">
        واحد ذخیره‌سازی تومان است. مبلغ هر دوره را کامل وارد کنید، نه مبلغ
        ماهانه.
      </p>
    </div>
  );
}
export function AdminProModules({
  org,
  onBusy,
}: {
  org: string;
  onBusy: (v: boolean) => void;
}) {
  const [data, setData] = useState<{
      nutrition: boolean;
      training: boolean;
      revision: number;
    } | null>(null),
    [mode, setMode] = useState("combined"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    let live = true;
    commercialRpc<NonNullable<typeof data>>("admin_pro_modules", { p_org: org })
      .then((d) => {
        if (live) {
          setData(d);
          setMode(
            d.nutrition && d.training
              ? "combined"
              : d.nutrition
                ? "nutrition"
                : "training",
          );
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [org]);
  async function save() {
    if (!data || busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const req = pending.current ?? {
        p_org: org,
        p_expected: data.revision,
        p_nutrition: mode !== "training",
        p_training: mode !== "nutrition",
        p_key: crypto.randomUUID(),
      };
      pending.current = req;
      const d = await commercialRpc<NonNullable<typeof data>>(
        "admin_pro_set_modules",
        req,
      );
      setData(d);
      pending.current = null;
      setNotice("ماژول‌های پنل ذخیره شدند.");
    } catch (e) {
      if (
        e instanceof Error &&
        /INVALID_REQUEST|STALE_REVISION/.test(e.message)
      )
        pending.current = null;
      setError(errorText(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="admin-pro-module-editor">
      <h4>ماژول‌های اشتراک این پنل</h4>
      <p className="admin-note">
        گزارش بدن در هر دو نوع پنل فعال است. غیرفعال‌کردن ماژول، ساخت جدید را
        می‌بندد و سوابق را حفظ می‌کند.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="admin-tools">
        <label>
          نوع پنل
          <PanelSelect
            aria-label="ماژول‌های پنل Pro"
            value={mode}
            disabled={!data || busy || Boolean(pending.current)}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="training">فقط تمرین</option>
            <option value="nutrition">فقط تغذیه</option>
            <option value="combined">تمرین + تغذیه</option>
          </PanelSelect>
        </label>
        <button disabled={!data || busy} onClick={() => void save()}>
          {pending.current ? "تلاش مجدد ثبت ماژول‌ها" : "ثبت ماژول‌های پنل"}
        </button>
      </div>
    </section>
  );
}
