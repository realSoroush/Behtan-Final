import { useEffect, useState } from 'react';
import { AppLoading } from '@/components/ui/AppLoading';
import { commercialRpc } from './commercialRpc';

type Specialist = { user_id: string; phone: string | null; enabled: boolean };

export function AdminProNutritionDelivery({ org, onBusy }: { org: string; onBusy: (busy: boolean) => void }) {
  const [opened, setOpened] = useState(false);
  return <details className="admin-pro-module-editor" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary>دسترسی ارسال برنامه به مراجع</summary>
    {opened && <DeliverySettings key={org} org={org} onBusy={onBusy} />}
  </details>;
}

function DeliverySettings({ org, onBusy }: { org: string; onBusy: (busy: boolean) => void }) {
  const [rows, setRows] = useState<Specialist[] | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    commercialRpc<Specialist[]>('admin_pro_nutrition_delivery_access', { p_org: org })
      .then(data => { if (current) setRows(data); })
      .catch(() => { if (current) setError('دریافت دسترسی متخصصان انجام نشد.'); });
    return () => { current = false; };
  }, [org, refresh]);

  async function change(row: Specialist, enabled: boolean) {
    if (pending) return;
    setPending(row.user_id);
    setError('');
    setNotice('');
    onBusy(true);
    try {
      const saved = await commercialRpc<boolean>('admin_pro_set_nutrition_delivery', {
        p_org: org, p_user: row.user_id, p_enabled: enabled,
      });
      setRows(previous => previous?.map(item => item.user_id === row.user_id ? { ...item, enabled: saved } : item) ?? null);
      setNotice(saved ? 'ارسال برنامه برای این متخصص فعال شد.' : 'ارسال برنامه برای این متخصص غیرفعال شد.');
    } catch {
      setRows(null);
      setError('ثبت دسترسی تأیید نشد. وضعیت را دوباره دریافت کنید.');
    } finally {
      setPending(null);
      onBusy(false);
    }
  }

  return <div className="space-y-2">
    <p className="admin-note">ارسال اختیاری و پیش‌فرض خاموش است. خاموش کردن، دسترسی مراجع به نسخه‌های قبلاً ارسال‌شده را تغییر نمی‌دهد.</p>
    {!rows && !error && <AppLoading label="در حال دریافت دسترسی متخصصان…" />}
    {error && <div role="alert">{error} <button type="button" onClick={() => {
      setError('');
      setRefresh(value => value + 1);
    }}>دریافت مجدد دسترسی‌ها</button></div>}
    {notice && <p role="status">{notice}</p>}
    {rows?.length === 0 && <p>متخصص فعالی در این فضای کاری وجود ندارد.</p>}
    {rows?.map(row => <label className="admin-tools" key={row.user_id}>
      <input type="checkbox" role="switch" checked={row.enabled} disabled={pending !== null}
        aria-label={`ارسال برنامه برای ${row.phone ?? row.user_id}`}
        onChange={event => void change(row, event.target.checked)} />
      <bdi>{row.phone ?? row.user_id}</bdi> · {row.enabled ? 'روشن' : 'خاموش'}
    </label>)}
  </div>;
}
