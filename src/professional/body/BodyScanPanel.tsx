import { useEffect, useRef, useState } from "react";
import { PanelSelect } from "@/components/ui/PanelSelect";
import { PanelModal } from "@/components/ui/PanelModal";
import { bodyApi, bodyError, preparePhoto } from "./api";
import {
  views,
  viewLabels,
  type Measurements,
  type StoredBodyReport,
  type View,
} from "./contracts";
import { BodyReportView } from "./BodyReportView";
import "./body-report.css";
export function BodyScanPanel({
  org,
  record,
  revision,
  canWrite,
  onBusy,
}: {
  org: string;
  record: string;
  revision: number;
  canWrite: boolean;
  onBusy: (b: boolean) => void;
}) {
  const [photos, setPhotos] = useState<Partial<Record<View, string>>>({}),
    [consent, setConsent] = useState(false),
    [measurements, setMeasurements] = useState<Measurements>({}),
    [rows, setRows] = useState<StoredBodyReport[]>([]),
    [selected, setSelected] = useState<StoredBodyReport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID()),
    working = useRef(false),
    alive = useRef(true);
  const reload = async () => {
    const result = await bodyApi.list(org, record);
    if (alive.current) setRows(result);
  };
  useEffect(() => {
    alive.current = true;
    void reload().catch((e) => {
      if (alive.current) setError(bodyError(e));
    });
    return () => {
      alive.current = false;
    };
  }, [org, record]);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (alive.current) setError(bodyError(e));
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
      onBusy(false);
    }
  }
  function changed() {
    key.current = crypto.randomUUID();
    setPending(false);
  }
  async function analyze() {
    await run(async () => {
      setPending(true);
      const result = await bodyApi.analyze(
        org,
        record,
        revision,
        views
          .filter((v) => photos[v])
          .map((view) => ({ view, data: photos[view]! })),
        measurements,
        key.current,
      );
      setPhotos({});
      setConsent(false);
      setPending(false);
      key.current = crypto.randomUUID();
      await reload();
      setSelected({
        id: result.id,
        intake_revision: revision,
        created_at: result.report.created_at,
        report: result.report,
        approved_at: null,
      });
    });
  }
  return (
    <section className="pro-body-panel">
      <h3>تحلیل تصویری بدن · تا سه نما</h3>
      <p className="pro-muted">
        نماهای روشن و تمام‌قد با لباس مناسب، حالت ایستادن یکسان و پس‌زمینه ساده.
        بهتر است صورت و هر نشانه شناسایی را پیش از انتخاب عکس بپوشانید یا محو
        کنید.
      </p>
      {error && (
        <p role="alert" className="pro-error">
          {error}
        </p>
      )}
      {busy && <p role="status">در حال پردازش؛ این پنجره را باز نگه دارید…</p>}
      <fieldset disabled={!canWrite || busy || pending}>
        <div className="body-photo-grid">
          {views.map((view) => (
            <label className="body-photo-slot" key={view}>
              <strong>{viewLabels[view]}</strong>
              {photos[view] && (
                <img
                  src={photos[view]}
                  alt={"نمای انتخاب‌شده " + viewLabels[view]}
                />
              )}
              <input
                aria-label={"عکس " + viewLabels[view]}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    void run(async () => {
                      const data = await preparePhoto(file);
                      setPhotos((p) => ({ ...p, [view]: data }));
                      changed();
                    });
                }}
              />
              {photos[view] && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotos((p) => {
                      const next = { ...p };
                      delete next[view];
                      return next;
                    });
                    changed();
                  }}
                >
                  حذف عکس {viewLabels[view]}
                </button>
              )}
            </label>
          ))}
        </div>
        <h4>اندازه‌های اختیاری · واردشده توسط متخصص</h4>
        <div className="pro-form-grid">
          {[
            ["waist_cm", "دور کمر (سانتی‌متر)", 30, 250],
            ["hip_cm", "دور باسن (سانتی‌متر)", 40, 250],
            ["body_fat_pct", "درصد چربی اندازه‌گیری‌شده", 3, 70],
          ].map(([field, label, min, max]) => (
            <label key={field}>
              {label}
              <input
                aria-label={String(label)}
                type="number"
                min={Number(min)}
                max={Number(max)}
                step="0.1"
                value={measurements[field as keyof Measurements] ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setMeasurements((m) => {
                    const next = { ...m };
                    if (value === "") {
                      delete next[field as keyof Measurements];
                      if (field === "body_fat_pct") delete next.body_fat_method;
                    } else Object.assign(next, { [field]: Number(value) });
                    return next;
                  });
                  changed();
                }}
              />
            </label>
          ))}
          {measurements.body_fat_pct !== undefined && (
            <label>
              روش سنجش درصد چربی
              <PanelSelect
                aria-label="روش سنجش درصد چربی"
                value={measurements.body_fat_method ?? ""}
                onChange={(e) => {
                  setMeasurements((m) => ({
                    ...m,
                    body_fat_method: e.target
                      .value as Measurements["body_fat_method"],
                  }));
                  changed();
                }}
              >
                <option value="">انتخاب روش</option>
                <option value="bia">دستگاه BIA</option>
                <option value="dexa">DEXA</option>
                <option value="caliper">کالیپر</option>
              </PanelSelect>
            </label>
          )}
        </div>
        <label className="body-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          مراجع بزرگسال است و رضایت آگاهانه او برای ارسال این عکس‌ها به OpenAI و
          ثبت گزارش را دریافت کرده‌ام. عکس‌ها در به‌تن ذخیره نمی‌شوند؛ سیاست
          نگهداری ارائه‌دهنده جداست. نتیجه را پیش از استفاده بازبینی می‌کنم.
        </label>
      </fieldset>
      <div className="pro-actions">
        <button
          className="pro-primary"
          disabled={
            !canWrite ||
            busy ||
            !consent ||
            !Object.keys(photos).length ||
            (measurements.body_fat_pct !== undefined &&
              !measurements.body_fat_method)
          }
          onClick={() => void analyze()}
        >
          {pending ? "بررسی دوباره همان درخواست" : "تحلیل و ساخت گزارش"}
        </button>
        {pending && (
          <button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "اگر پاسخ قبلی در راه بوده باشد، گزارش آن در سوابق قابل مشاهده است. درخواست تازه‌ای آماده شود؟",
                )
              ) {
                changed();
                void reload().catch((e) => setError(bodyError(e)));
              }
            }}
          >
            ویرایش ورودی و درخواست تازه
          </button>
        )}
      </div>
      <p className="pro-muted">
        نگهداری در OpenAI مطابق تنظیمات حساب API است. به‌تن عکس‌ها را به
        Storage، PDF یا لاگ نمی‌فرستد. تصویر و رضایت با بستن این پنجره پاک
        می‌شوند.
      </p>
      <button disabled={busy} onClick={() => void run(reload)}>
        دریافت مجدد گزارش‌ها
      </button>
      <ul className="pro-cases">
        {rows.map((r) => (
          <li key={r.id}>
            <span>
              {new Date(r.created_at).toLocaleDateString("fa-IR")} · نسخه{" "}
              {r.intake_revision.toLocaleString("fa-IR")} ·{" "}
              {r.approved_at ? "تأییدشده" : "در انتظار بازبینی"}
            </span>
            <button onClick={() => setSelected(r)}>مشاهده گزارش بدن</button>
          </li>
        ))}
      </ul>
      {selected && (
        <PanelModal
          title="بازبینی گزارش بدن"
          busy={busy}
          onClose={() => setSelected(null)}
        >
          <BodyReportView report={selected.report} />
          {!selected.approved_at && (
            <button
              className="pro-primary"
              disabled={
                !canWrite || busy || selected.intake_revision !== revision
              }
              onClick={() =>
                void run(async () => {
                  await bodyApi.approve(org, selected.id);
                  setSelected((s) =>
                    s ? { ...s, approved_at: new Date().toISOString() } : null,
                  );
                  await reload();
                })
              }
            >
              گزارش را بازبینی کردم؛ تأیید
            </button>
          )}
          <p className="pro-muted">
            برای پیوست PDF، پس از تأیید گزارش، برنامه ذخیره‌شده همان نسخه
            اطلاعات را باز کنید.
          </p>
        </PanelModal>
      )}
    </section>
  );
}
