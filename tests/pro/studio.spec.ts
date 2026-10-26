import { test, expect, type Page } from '@playwright/test';
import { setup, org, record, base } from './real-fixture';
import type { AuthoredSnapshot } from '../../src/professional/authoredPlan';
import { foodTotals, nutritionTotals } from '../../src/professional/studioModel';
async function arrange(page: Page, lostResponse = false, workout = false) {
  const fixture = await setup(page, { existing: true });
  if(workout){fixture.cases[0].answers.workout_days=3;fixture.cases[0].answers.training_type='resistance';}
  const snapshots: AuthoredSnapshot[] = [], requests: any[] = [];
  const archiveRequests: URL[] = [];
  let archiveFailure = false;
  await page.route('**/rest/v1/pro_authored_plans?*', route => {
    const url = new URL(route.request().url()), kind = url.searchParams.get('kind')?.replace('eq.', '');
    expect(url.searchParams.get('organization_id')).toBe('eq.' + org);
    expect(url.searchParams.get('record_id')).toBe('eq.' + record);
    if (!kind) {
      archiveRequests.push(url);
      if (archiveFailure) return route.fulfill({ status: 503, json: { message: 'Synthetic archive outage' } });
    }
    const rows = snapshots.filter(s => !kind || s.kind === kind).sort((a,b) => b.recorded_at.localeCompare(a.recorded_at) || a.id.localeCompare(b.id));
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 11);
    return route.fulfill({ json: rows.slice(offset, offset + limit) });
  });
  await page.route('**/rest/v1/rpc/pro_save_authored_plan', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    expect(body.p_org).toBe(org); expect(body.p_record).toBe(record); expect(body.p_revision).toBe(1);
    if (!snapshots.some(s => s.id === body.p_key)) snapshots.unshift({ id: body.p_key, kind: body.p_kind, content: body.p_content, intake_revision: body.p_revision, display_name: base.display_name, recorded_at: '2026-10-26T15:00:00Z' });
    if (lostResponse) { lostResponse = false; await route.abort('failed'); return; }
    await route.fulfill({ json: body.p_key });
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'بازکردن پرونده', exact: true }).click();
  await expect(page.getByText('آخرین تغییرات ذخیره شده‌اند', { exact: true })).toBeVisible();
  return { fixture, snapshots, requests, errors, archiveRequests, failArchive: (value: boolean) => { archiveFailure = value; } };
}
async function training(page: Page) {
  await page.getByRole('button', { name: 'برنامه تمرینی مراجع', exact: true }).click();
  await expect(page.locator('.pro-authored-editor')).toBeVisible();
}
async function chooseKind(page: Page, kind: string) {
  await page.getByRole('combobox', { name: 'نوع گروه جدید', exact: true }).click();
  await page.getByRole('option', { name: kind, exact: true }).click();
  await page.getByRole('button', { name: 'گروه جدید', exact: true }).click();
}
async function addExercise(page: Page, name: string) { await page.locator('.studio-bank').getByRole('button', { name, exact: true }).first().click(); }
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await page.locator('dialog[open]').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
}
test('linked groups: fill, reorder, retry lost response, reopen immutable version and PDF', async ({ page }) => {
  const state = await arrange(page, true); await training(page);
  await addExercise(page, 'پرس سینه هالتر');
  await chooseKind(page, 'سوپرست');
  await addExercise(page, 'نشر جانب دمبل'); await addExercise(page, 'نشر خم دمبل');
  await page.getByRole('spinbutton', { name: 'ست حرکت 2', exact: true }).fill('4');
  await chooseKind(page, 'تریپل‌ست');
  await addExercise(page, 'جلو بازو دمبل'); await addExercise(page, 'جلو بازو چکشی');
  await page.getByRole('checkbox', { name: 'تأیید برنامه اختصاصی متخصص' }).check();
  await expect(page.getByRole('button', { name: 'ثبت نسخهٔ تأییدشده', exact: true })).toBeDisabled();
  await addExercise(page, 'پشت بازو سیم‌کش');
  await page.getByRole('button', { name: 'پایین بردن گروه 1', exact: true }).click();
  await page.getByRole('checkbox', { name: 'تأیید برنامه اختصاصی متخصص' }).check();
  await noOverflow(page);
  await page.getByRole('button', { name: 'ثبت نسخهٔ تأییدشده', exact: true }).click();
  await expect(page.getByRole('button', { name: 'تلاش مجدد ثبت نسخه' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'نام حرکت 1', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'تلاش مجدد ثبت نسخه' }).click();
  await expect(page.getByRole('button', { name: 'PDF نسخه ثبت‌شده', exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(2); expect(state.requests[0].p_key).toBe(state.requests[1].p_key); expect(state.snapshots).toHaveLength(1);
  const saved = state.snapshots[0].content; expect(saved.sections[0].lines[0].training?.kind).toBe(2); expect(saved.sections[0].lines[0].training?.sets).toBe(4);
  await page.getByRole('button', { name: 'بستن پنجره', exact: true }).click();
  await expect(page.getByRole('region', { name: 'آرشیو برنامه‌های اختصاصی', exact: true }).getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'آرشیو برنامه‌های اختصاصی', exact: true })).toContainText('تمرین اختصاصی');
  await training(page);
  await page.getByRole('button', { name: 'مشاهده نسخه', exact: true }).click();
  await expect(page.getByRole('region', { name: 'نسخه ذخیره‌شده' })).toContainText('سوپرست');
  await page.getByRole('button', { name: 'ساخت نسخه جدید', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'ست حرکت 1', exact: true })).toHaveValue('4');
  const popup = page.waitForEvent('popup'); await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const print = await popup; await expect(print.locator('body')).toContainText('تریپل‌ست'); await expect(print.locator('body')).toContainText('مراجع تست'); await print.pdf({path:test.info().outputPath('training.pdf'),format:'A4',printBackground:true}); await print.close();
  await page.locator('.studio-columns').evaluate(e=>e.scrollIntoView({block:'start'})); await page.screenshot({ path: test.info().outputPath('training-studio.png'), animations: 'disabled' });
  expect(state.errors).toEqual([]);
});
test('nutrition: real catalog grams, meal ordering, server engine, snapshots and separate day totals', async ({ page }) => {
  const state = await arrange(page,false,true);
  await page.getByRole('button', { name: 'تدوین اختصاصی تغذیه و سوابق', exact: true }).click();
  const first = page.locator('.studio-bank-list button').first(); await expect(first).toBeVisible(); await first.click();
  const weight = page.locator('.studio-food input[type=number]').first(); await weight.fill('125');
  await page.getByRole('button', { name: 'وعده', exact: true }).click();
  await page.getByRole('textbox', { name: 'نام وعده', exact: true }).fill('ناهار'); await first.click();
  await page.getByRole('button', { name: 'انتقال وعده به قبل', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'وعده‌های تغذیه' }).getByRole('button').first()).toHaveText('ناهار');
  await page.getByRole('checkbox', { name: 'تأیید برنامه اختصاصی متخصص' }).check();
  await page.getByRole('button', { name: 'ثبت نسخهٔ تأییدشده', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF نسخه ثبت‌شده' })).toBeVisible();
  const saved = state.snapshots[0].content; expect(saved.sections[1].lines[0].food?.grams).toBe(125);
  expect(nutritionTotals(saved.sections).kcal).toBeCloseTo(foodTotals(saved.sections[0].lines[0].food!).kcal + foodTotals(saved.sections[1].lines[0].food!).kcal);
  await page.getByRole('button', { name: 'بستن پنجره', exact: true }).click();
  await expect(page.getByRole('region', { name: 'آرشیو برنامه‌های اختصاصی', exact: true }).getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'آرشیو برنامه‌های اختصاصی', exact: true })).toContainText('تغذیه اختصاصی');
  await page.getByRole('button', { name: 'تدوین اختصاصی تغذیه و سوابق', exact: true }).click();
  await page.getByRole('button', { name: 'ساخت نسخه جدید', exact: true }).click();
  expect(await page.locator('.studio-food input[type=number]').first().inputValue()).toBe('100');
  await page.getByRole('button', { name: 'صبحانه', exact: true }).click(); await expect(page.locator('.studio-food input[type=number]').first()).toHaveValue('125');
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'ساخت برنامه توسط به‌تن', exact: true }).click();
  await expect(page.getByText('پیش‌نویس موتور بر اساس پرونده آماده شد.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ثبت نسخهٔ تأییدشده', exact: true })).toBeDisabled();
  await expect(page.getByRole('navigation',{name:'نوع روز تغذیه'})).toBeVisible();
  await page.getByRole('button',{name:'روز تمرین',exact:true}).click();
  await expect(page.getByLabel('جمع تغذیه')).toContainText('روز تمرین');
  await noOverflow(page);
  await page.locator('.studio-columns').evaluate(e=>e.scrollIntoView({block:'start'})); await page.screenshot({ path: test.info().outputPath('nutrition-studio.png'), animations: 'disabled' });
  expect(state.errors).toEqual([]);
});
test('unsaved studio cannot be silently closed; subscription expiry keeps saved history readable', async ({ page }) => {
  const state = await arrange(page); await training(page); await addExercise(page, 'پرس سینه هالتر');
  page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: 'بستن پنجره', exact: true }).click();
  await expect(page.locator('.pro-authored-editor')).toBeVisible();
  await page.getByRole('checkbox', { name: 'تأیید برنامه اختصاصی متخصص' }).check(); await page.getByRole('button', { name: 'ثبت نسخهٔ تأییدشده', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF نسخه ثبت‌شده' })).toBeVisible(); await page.getByRole('button', { name: 'بستن پنجره', exact: true }).click();
  state.fixture.expire(); await page.reload(); await page.getByRole('button', { name: 'بازکردن پرونده', exact: true }).click();
  await expect(page.getByRole('region', { name: 'آرشیو برنامه‌های اختصاصی', exact: true }).getByRole('article')).toHaveCount(1);
  await training(page);
  await expect(page.getByRole('button', { name: 'ثبت نسخهٔ تأییدشده', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});
test('case archive shows both authored kinds, pages older versions and opens the saved content and PDF', async ({ page }) => {
  const state = await arrange(page);
  const archive = page.getByRole('region', { name: 'آرشیو برنامه‌های اختصاصی', exact: true });
  await expect(archive.getByText('هنوز برنامهٔ اختصاصی ثبت نشده است.')).toBeVisible();
  for (let i = 0; i < 12; i++) state.snapshots.push({
    id: `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`, kind: i % 2 ? 'nutrition' : 'training',
    content: { version: 1, title: `برنامه بایگانی ${i}`, reviewed: true, notes: 'یادداشت نسخه ثبت‌شده', sections: [{ title: 'بخش ذخیره‌شده', lines: [{ name: `محتوای نسخه ${i}`, details: 'دستور ثبت‌شده' }] }] },
    intake_revision: 1, display_name: 'نام هنگام ثبت', recorded_at: new Date(Date.UTC(2026, 9, 26, 12, i)).toISOString(),
  });
  const before = JSON.stringify(state.snapshots);
  await archive.getByRole('button', { name: 'به‌روزرسانی آرشیو اختصاصی' }).click();
  await expect(archive.getByRole('article')).toHaveCount(10);
  await expect(archive.getByRole('article').first()).toContainText('برنامه بایگانی 11');
  await expect(archive).toContainText('تمرین اختصاصی'); await expect(archive).toContainText('تغذیه اختصاصی');
  await archive.getByRole('button', { name: 'مشاهده برنامه اختصاصی', exact: true }).first().click();
  await expect(archive.getByRole('region', { name: 'مشاهده برنامه اختصاصی ذخیره‌شده' })).toContainText('محتوای نسخه 11');
  const popup = page.waitForEvent('popup'); await archive.getByRole('button', { name: 'PDF برنامه اختصاصی', exact: true }).first().click();
  const print = await popup; await expect(print.locator('body')).toContainText('محتوای نسخه 11'); await expect(print.locator('body')).toContainText('نام هنگام ثبت'); await print.close();
  await archive.getByRole('button', { name: 'اختصاصی‌های قدیمی‌تر' }).click();
  await expect(archive.getByRole('article')).toHaveCount(2);
  await expect(archive.getByRole('article').first()).toContainText('برنامه بایگانی 1');
  await expect(archive.getByRole('button', { name: 'اختصاصی‌های قدیمی‌تر' })).toBeDisabled();
  await expect(archive.getByRole('region', { name: 'مشاهده برنامه اختصاصی ذخیره‌شده' })).toHaveCount(0);
  await archive.getByRole('button', { name: 'اختصاصی‌های جدیدتر' }).click();
  await expect(archive.getByRole('article')).toHaveCount(10);
  await archive.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('case-authored-archive.png'), animations: 'disabled' });
  expect(JSON.stringify(state.snapshots)).toBe(before); expect(state.requests).toHaveLength(0);
  expect(state.archiveRequests.some(u => u.searchParams.get('offset') === '10')).toBe(true);
  expect(state.errors).toEqual([]);
});
test('archive read failures are visible and retryable without changing the case or hiding saved programs as empty', async ({ page }) => {
  const state = await arrange(page);
  const archive = page.getByRole('region', { name: 'آرشیو برنامه‌های اختصاصی', exact: true });
  await expect(archive.getByText('هنوز برنامهٔ اختصاصی ثبت نشده است.')).toBeVisible();
  state.failArchive(true);
  await archive.getByRole('button', { name: 'به‌روزرسانی آرشیو اختصاصی' }).click();
  await expect(archive.getByRole('alert')).toContainText('دریافت آرشیو برنامه‌های اختصاصی انجام نشد');
  await expect(archive.getByText('هنوز برنامهٔ اختصاصی ثبت نشده است.')).toHaveCount(0);
  state.failArchive(false);
  await archive.getByRole('button', { name: 'به‌روزرسانی آرشیو اختصاصی' }).click();
  await expect(archive.getByRole('alert')).toHaveCount(0);
  await expect(archive.getByText('هنوز برنامهٔ اختصاصی ثبت نشده است.')).toBeVisible();
  await expect(page.getByText('آخرین تغییرات ذخیره شده‌اند', { exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(0); expect(state.errors).toEqual([]);
});
test('all studio navigation pages use actual organization state on desktop and mobile', async ({ page }) => {
  await setup(page, { existing: true }); await page.goto('/');
  await page.getByRole('button', { name: 'نمای کلی', exact: true }).click(); await expect(page.locator('.studio-stats')).toContainText('۱');
  for(const label of ['برنامه تمرینی','برنامه غذایی','سوابق برنامه‌ها'])await expect(page.getByRole('button',{name:label,exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'استودیوی تغذیه',exact:false}).click(); await expect(page.getByText('انتخاب مراجع برای برنامه غذایی',{exact:true})).toBeVisible();
  await page.getByRole('button', { name: 'حساب و تنظیمات', exact: true }).click(); await expect(page.locator('.studio-settings')).toContainText('مالک');
  await page.getByRole('button', { name: 'اشتراک و ظرفیت', exact: true }).click(); await expect(page.getByText('جزئیات اعتبار فضای کاری', { exact: true })).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.add('dark')); await page.getByRole('button', { name: 'نمای کلی', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('overview-dark.png'), fullPage: true, animations: 'disabled' });
});
