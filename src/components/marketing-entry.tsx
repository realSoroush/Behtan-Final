import { useEffect } from "react";
/** Separate HTML entry preserves the approved design without leaking styles into the app. */
export function MarketingEntry({
  professional = false,
}: {
  professional?: boolean;
}) {
  const href = (professional ? "/professionals" : "/");
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return (
    <main dir="rtl">
      <a href={href}>ورود به وب‌سایت به‌تن</a>
    </main>
  );
}
