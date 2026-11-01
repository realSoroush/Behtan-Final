import { expect, test, type Page } from '@playwright/test';
import { setup, specialist } from './real-fixture';
async function fill(page: Page) {
  await page.getByRole('textbox', {name:'نام و نام خانوادگی', exact:true}).fill('سروش خردمند');
  await page.getByRole('textbox', {name:'شماره تماس', exact:true}).fill('۰۹۱۱۱۲۳۴۵۶۷');
  await page.getByRole('combobox', {name:'رسته کاری شما', exact:true}).click();
  await page.getByRole('option', {name:'مربی بدنسازی', exact:true}).click();
  await page.getByRole('textbox', {name:'استان', exact:true}).fill('مازندران');
  await page.getByRole('textbox', {name:'شهر', exact:true}).fill('ساری');
  await page.getByRole('textbox', {name:'آدرس', exact:true}).fill('خیابان فرهنگ، واحد ۴۰۱');
}
test('existing incomplete specialist completes once; refresh skips form', async ({page}) => {
  const state = await setup(page, {profileComplete:false});
  await page.goto('/');
  await expect(page.getByRole('form', {name:'مشخصات حرفه‌ای متخصص'})).toBeVisible();
  await expect(page.getByRole('button', {name:'پرونده جدید',exact:true})).toHaveCount(0);
  await fill(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath('specialist-profile.png'),animations:'disabled'});
  await page.getByRole('button', {name:'ذخیره و ادامه',exact:true}).click();
  await expect(page.getByRole('button', {name:'پرونده جدید',exact:true})).toBeVisible();
  expect(state.profileRequests).toHaveLength(1);
  expect(state.profileRequests[0].p_contact_phone).toBe('09111234567');
  await page.reload();
  await expect(page.getByRole('button', {name:'پرونده جدید',exact:true})).toBeVisible();
  await expect(page.getByRole('form', {name:'مشخصات حرفه‌ای متخصص'})).toHaveCount(0);
});
test('new user completes profile before offers; no second name form', async ({page}) => {
  await setup(page, {profileComplete:false,allowed:false}); await page.goto('/'); await fill(page);
  await page.getByRole('button', {name:'ذخیره و ادامه',exact:true}).click();
  await expect(page.getByRole('heading', {name:'فضای کاری خودت را بساز',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox', {name:'نام متخصص',exact:true})).toHaveCount(0);
});
test('failure keeps entered fields and retry succeeds', async ({page}) => {
  const state = await setup(page, {profileComplete:false});
  await page.route('**/rest/v1/rpc/pro_save_specialist_profile', async route => {await route.fulfill({status:503,json:{message:'PRO_CONNECTION_ERROR'}});await page.unroute('**/rest/v1/rpc/pro_save_specialist_profile');});
  await page.goto('/');await fill(page);await page.getByRole('button',{name:'ذخیره و ادامه',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('textbox',{name:'نام و نام خانوادگی',exact:true})).toHaveValue('سروش خردمند');
  await page.getByRole('button',{name:'ذخیره و ادامه',exact:true}).click();await expect(page.getByRole('button',{name:'پرونده جدید',exact:true})).toBeVisible();expect(state.profileRequests).toHaveLength(1);
});
test('complete profile skips gate; settings can update professional contact', async ({page}) => {
  await setup(page);await page.goto('/');await page.getByRole('button',{name:'حساب و تنظیمات',exact:true}).first().click();
  await page.getByText('ویرایش مشخصات حرفه‌ای و اطلاعات PDF',{exact:true}).click();
  await expect(page.getByRole('textbox',{name:'نام و نام خانوادگی',exact:true})).toHaveValue(specialist.full_name);
  await page.getByRole('textbox',{name:'شماره تماس',exact:true}).fill('01133334444');await page.getByRole('button',{name:'ذخیره مشخصات',exact:true}).click();
  await expect(page.getByText('مشخصات حرفه‌ای ذخیره شد.',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'شماره تماس',exact:true})).toHaveValue('01133334444');
});
