import { expect, test } from '@playwright/test';

test('OTP recovers from a CAPTCHA script outage and throttles repeated SMS requests', async ({ page }) => {
  let scriptAttempts = 0;
  let smsAttempts = 0;
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', async route => {
    scriptAttempts++;
    if (scriptAttempts === 1) return route.abort('failed');
    return route.fulfill({
      contentType: 'application/javascript',
      body: `window.turnstile = {
        render(_element, options) { queueMicrotask(() => options.callback('synthetic-otp-challenge')); return 'widget'; },
        remove() {}
      };`,
    });
  });
  await page.route('https://pro-test.supabase.co/auth/v1/otp*', route => {
    smsAttempts++;
    return route.fulfill({
      status: 429,
      json: { code: 'over_sms_send_rate_limit', msg: 'Synthetic rate limit' },
    });
  });
  await page.goto('/');
  const captchaRetry = page.getByRole('button', { name: 'بارگذاری دوبارهٔ تأیید امنیتی' });
  await expect(captchaRetry).toBeVisible();
  await captchaRetry.click();
  await page.getByLabel('شماره موبایل', { exact: true }).fill('09123456789');
  const send = page.getByRole('button', { name: /ارسال کد تأیید/ });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole('alert')).toContainText('درخواست‌های زیادی');
  await expect(page.getByRole('status')).toContainText('تلاش دوباره');
  await expect(send).toBeDisabled();
  expect(scriptAttempts).toBe(2);
  expect(smsAttempts).toBe(1);
});
