import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { MemberDialog } from "../components/dashboard/MemberDialog";
function Counter({ from, to }: { from: number; to: number }) {
  const [v, setV] = useState(from),
    reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      setV(to);
      return;
    }
    let id = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 850);
      setV(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [from, to, reduced]);
  return <strong className="text-3xl">{v.toLocaleString("fa-IR")}</strong>;
}
export function ProgressCelebration({
  before,
  after,
  onClose,
}: {
  before: number;
  after: number;
  onClose: () => void;
}) {
  return (
    <MemberDialog title="اطلاعات تازه‌ات ثبت شد" onClose={onClose}>
      <div className="member-celebration">
        {Array.from({ length: 16 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${i * 6}%`,
              animationDelay: `${(i % 4) * 0.08}s`,
              background: i % 2 ? "#39b98c" : "#d7f46b",
            }}
            aria-hidden="true"
          />
        ))}
        <p>مبنای محاسبه به‌روز شد؛ ثبت منظم اطلاعاتت ارزشمند است.</p>
        <div className="grid grid-cols-2 gap-4 py-8">
          <div>
            <small className="block">هدف قبلی</small>
            <strong className="text-2xl">
              {before.toLocaleString("fa-IR")}
            </strong>
          </div>
          <div>
            <small className="block">هدف جدید</small>
            <Counter from={before} to={after} />
          </div>
        </div>
        <p className="member-muted">
          کالری کمتر یا بیشتر، امتیاز بهتر نیست؛ برنامه با اطلاعات تازهٔ تو
          هماهنگ می‌شود. ثبت غذاهای خورده‌شده حفظ می‌شود.
        </p>
        <button className="member-primary" onClick={onClose}>
          دیدن برنامهٔ به‌روز
        </button>
      </div>
    </MemberDialog>
  );
}
