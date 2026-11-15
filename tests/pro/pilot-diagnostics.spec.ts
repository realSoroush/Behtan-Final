import { expect, test } from '@playwright/test';
import { setup } from './real-fixture';

test('pilot reports safe timings and distinguishes migration 057 readiness', async ({ page }) => {
  const requestId = 'f6bbe9f8-5865-4ba3-9b1b-117ce3afb0bc';
  await setup(page, { existing: true });
  await page.route('**/api/pro-plan', route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { ready: true, missing: [], generationAccess: '057' } });
    return route.fulfill({
      status: 422,
      headers: { 'X-Request-Id': requestId, 'Server-Timing': 'auth;dur=3, total;dur=91' },
      json: { error: 'PRO_MENU_COUNT_UNAVAILABLE' },
    });
  });
  await page.goto('/?pilot=1');
  await page.getByRole('button', { name: 'بازکردن پرونده', exact: true }).click();
  await page.getByRole('button', { name: 'تولید و پیش‌نمایش برنامه', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: requestId })).toBeVisible();
  await page.getByText('بررسی فنی سرویس ساخت برنامه', { exact: true }).click();
  await page.getByRole('button', { name: 'بررسی سرویس ساخت برنامه', exact: true }).click();
  await expect(page.getByText(/مایگریشن ۰۵۷ در دسترس‌اند/)).toBeVisible();
  await page.getByRole('button', { name: 'نمایش گزارش زمان‌بندی', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'گزارش زمان‌بندی پایلوت' });
  const payload = JSON.parse(await field.inputValue());
  expect(payload.samples).toHaveLength(1);
  expect(payload.samples[0]).toEqual({
    event: 'generate', elapsed_ms: expect.any(Number), menus: 4, status: 422,
    request_id: requestId, phases_ms: { auth: 3, total: 91 }, at: expect.any(String),
  });
  await page.getByRole('button', { name: 'پاک‌کردن گزارش', exact: true }).click();
  await expect(field).toHaveCount(0);
});
