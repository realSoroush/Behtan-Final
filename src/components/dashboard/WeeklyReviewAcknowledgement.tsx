import { AppLoading } from '@/components/ui/AppLoading';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { MemberDialog } from './MemberDialog';

const table = 'member_weekly_review_acknowledgements';

async function persistReview(userId: string, reviewKey: string, signal: AbortSignal) {
  const { error } = await supabase.from(table)
    .upsert({ user_id: userId, review_key: reviewKey }, {
      onConflict: 'user_id,review_key',
      ignoreDuplicates: true,
    })
    .abortSignal(signal);
  if (error) throw error;
}

export function WeeklyReviewAcknowledgement({ userId, reviewKey, recommendation }: {
  userId: string;
  reviewKey: string;
  recommendation: string;
}) {
  const [status, setStatus] = useState<'loading' | 'unread' | 'read' | 'unavailable'>('loading');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const storageKey = `behtan:weekly-review:${userId}`;

  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
      try {
        let legacyReviewed = false;
        try { legacyReviewed = localStorage.getItem(storageKey) === reviewKey; } catch { /* Optional migration. */ }
        if (legacyReviewed) {
          await persistReview(userId, reviewKey, signal);
          try {
            if (localStorage.getItem(storageKey) === reviewKey) localStorage.removeItem(storageKey);
          } catch { /* Server acknowledgement is already saved. */ }
          if (!controller.signal.aborted) setStatus('read');
          return;
        }

        const { data, error } = await supabase.from(table).select('review_key')
          .eq('user_id', userId).eq('review_key', reviewKey).abortSignal(signal).maybeSingle();
        if (error) throw error;
        if (!controller.signal.aborted) {
          setStatus(previous => data || previous === 'read' ? 'read' : 'unread');
        }
      } catch {
        if (!controller.signal.aborted) setStatus(previous => previous === 'read' ? previous : 'unavailable');
      } finally {
        checking = false;
      }
    };
    void check();
    window.addEventListener('focus', check);
    return () => {
      controller.abort();
      window.removeEventListener('focus', check);
    };
  }, [userId, reviewKey, storageKey]);

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await persistReview(userId, reviewKey, AbortSignal.timeout(12000));
      setStatus('read');
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'read') return <p role="status" className="text-xs">پیشنهاد مرور شد.</p>;
  if (status === 'loading') return <AppLoading variant="inline" label="در حال دریافت وضعیت مرور…" />;

  return (
    <>
      {status === 'unavailable' && <p className="text-xs">وضعیت مرور دریافت نشد. می‌توانی پیشنهاد را دوباره مرور کنی.</p>}
      <button type="button" className="member-secondary" onClick={() => { setSaveError(false); setOpen(true); }}>
        مرور پیشنهاد
      </button>
      {open && (
        <MemberDialog title="تأیید مرور هفتگی" variant="confirmation" onClose={() => setOpen(false)} dismissible={!saving}>
          <div className="meal-confirmation-content">
            <p>{recommendation}</p>
            {saveError && <p role="alert">تأیید مرور ذخیره نشد. دوباره تلاش کن.</p>}
            <div className="meal-confirmation-actions">
              <button type="button" className="member-primary" disabled={saving} onClick={() => void confirm()}>
                {saving ? 'در حال ذخیره…' : 'مرور شد'}
              </button>
              <button type="button" className="member-secondary" disabled={saving} onClick={() => setOpen(false)}>بعداً</button>
            </div>
          </div>
        </MemberDialog>
      )}
    </>
  );
}
