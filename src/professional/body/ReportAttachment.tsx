import { useEffect, useRef, useState } from "react";
import { PanelSelect } from "@/components/ui/PanelSelect";
import { bodyApi, bodyError } from "./api";
import type { StoredBodyReport } from "./contracts";
export function ReportAttachment({
  org,
  record,
  plan,
  revision,
  canWrite,
}: {
  org: string;
  record: string;
  plan: string;
  revision: number;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<StoredBodyReport[]>([]),
    [selected, setSelected] = useState(""),
    [attached, setAttached] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    let live = true;
    setError("");
    setAttached(false);
    setRows([]);
    setSelected("");
    Promise.all([bodyApi.list(org, record), bodyApi.forPlan(org, plan)])
      .then(([list, report]) => {
        if (live) {
          setRows(
            list.filter((x) => x.approved_at && x.intake_revision === revision),
          );
          setAttached(Boolean(report));
        }
      })
      .catch((e) => {
        if (live) setError(bodyError(e));
      });
    return () => {
      live = false;
    };
  }, [org, record, plan, revision]);
  return (
    <section className="pro-body-attachment">
      <h4>پیوست گزارش بدن</h4>
      {error && (
        <p className="pro-error" role="alert">
          {error}
        </p>
      )}
      {attached ? (
        <p role="status">
          گزارش تأییدشده به این برنامه متصل است و در انتهای PDF درج می‌شود.
        </p>
      ) : (
        <>
          <p className="pro-muted">
            فقط گزارش تأییدشده همان نسخه اطلاعات قابل اتصال است. پس از اتصال،
            پیوست این برنامه تغییر نمی‌کند.
          </p>
          {rows.length ? (
            <>
              <PanelSelect
                aria-label="گزارش بدن برای PDF"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={busy || !canWrite}
              >
                <option value="">انتخاب گزارش تأییدشده</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.created_at).toLocaleString("fa-IR")}
                  </option>
                ))}
              </PanelSelect>
              <button
                disabled={!selected || !canWrite || busy}
                onClick={async () => {
                  if (pending.current) return;
                  pending.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    await bodyApi.attach(org, plan, selected);
                    setAttached(true);
                  } catch (e) {
                    setError(bodyError(e));
                  } finally {
                    pending.current = false;
                    setBusy(false);
                  }
                }}
              >
                تأیید و پیوست به PDF این برنامه
              </button>
            </>
          ) : (
            <p>گزارش تأییدشده سازگار با این برنامه وجود ندارد.</p>
          )}
        </>
      )}
    </section>
  );
}
