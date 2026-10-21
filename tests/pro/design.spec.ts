import {expect,test} from '@playwright/test';
import {setup} from './real-fixture';

test('form navigation preserves answers and supports RTL keyboard tabs',async({page})=>{
 await setup(page,{existing:true});await page.goto('/');
 await page.getByRole('button',{name:'بازکردن پرونده',exact:true}).click();
 const weight=page.getByRole('spinbutton',{name:'وزن (کیلوگرم)',exact:true});await weight.fill('76');
 const first=page.getByRole('tab',{name:'مشخصات اولیه',exact:true});await first.focus();await page.keyboard.press('ArrowLeft');
 await expect(page.getByRole('tab',{name:'فعالیت و هدف',exact:true})).toBeFocused();
 await expect(page.getByRole('tab',{name:'فعالیت و هدف',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'بخش قبل',exact:true}).click();await expect(weight).toHaveValue('76');
 await page.getByRole('button',{name:'بخش بعد',exact:true}).click();await expect(page.getByRole('tab',{name:'فعالیت و هدف',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('tab',{name:'فعالیت و هدف',exact:true}).focus();await page.keyboard.press('End');
 await expect(page.getByRole('tab',{name:'ایمنی پزشکی',exact:true})).toBeFocused();
 await expect(page.getByRole('button',{name:'ذخیره اطلاعات پرونده',exact:true})).toBeDisabled();
});

test('empty search offers a working route back to the directory',async({page})=>{
 await setup(page,{existing:true});await page.goto('/');
 await page.getByLabel('جست‌وجوی پرونده').fill('نام ناموجود');await page.getByRole('button',{name:'جستجو',exact:true}).click();
 await expect(page.getByRole('heading',{name:'پرونده‌ای پیدا نشد',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'نمایش همه مراجعان',exact:true}).click();
 await expect(page.getByRole('button',{name:'بازکردن پرونده',exact:true})).toHaveCount(1);
 await expect(page.getByLabel('جست‌وجوی پرونده')).toHaveValue('');
});

for(const theme of ['light','dark'])test(`${theme} workspace and intake fit the viewport`,async({page},info)=>{
 await setup(page,{existing:true});
 await page.addInitScript(t=>localStorage.setItem('behtan-theme',t),theme);
 await page.goto('/');await expect(page.getByRole('button',{name:'بازکردن پرونده',exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 const noOverflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
 expect(await noOverflow()).toBe(true);
 await page.screenshot({path:info.outputPath(`directory-${theme}.png`),fullPage:true});
 await page.getByRole('button',{name:'بازکردن پرونده',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'نام مراجع',exact:true})).toBeVisible();expect(await noOverflow()).toBe(true);
 await page.screenshot({path:info.outputPath(`intake-${theme}.png`),fullPage:true});
 for(const width of [320,768]){await page.setViewportSize({width,height:900});expect(await noOverflow()).toBe(true);}
 await expect(page.getByRole('navigation',{name:'مسیر آماده‌سازی برنامه'})).toBeVisible();
});

test('custom dropdown supports keyboard selection and does not overlap search text',async({page})=>{
 await setup(page,{existing:true});await page.goto('/');
 const search=page.getByLabel('جست‌وجوی پرونده');
 const padding=await search.evaluate(e=>Number.parseFloat(getComputedStyle(e).paddingRight));expect(padding).toBeGreaterThanOrEqual(42);
 await page.getByRole('button',{name:'بازکردن پرونده',exact:true}).click();
 const gender=page.getByRole('combobox',{name:'جنسیت',exact:true});await gender.click();await expect(page.getByRole('listbox',{name:'جنسیت',exact:true})).toBeVisible();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(gender).toContainText('مرد');await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('archive and restore preserve an existing case',async({page})=>{
 const state=await setup(page,{existing:true});await page.goto('/');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'بایگانی پرونده',exact:true}).click();
 await expect(page.getByRole('button',{name:'بازکردن پرونده',exact:true})).toHaveCount(0);expect(state.cases).toHaveLength(1);
 await page.getByRole('button',{name:'بایگانی',exact:true}).click();await expect(page.getByRole('button',{name:'بازکردن پرونده',exact:true})).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'بازگرداندن پرونده',exact:true}).click();
 await page.getByRole('button',{name:'پرونده‌های فعال',exact:true}).click();await expect(page.getByRole('button',{name:'بازکردن پرونده',exact:true})).toBeVisible();
});

test('subscription section preserves an unsaved intake',async({page})=>{
 await setup(page,{existing:true});await page.goto('/');await page.getByRole('button',{name:'بازکردن پرونده',exact:true}).click();
 const name=page.getByRole('textbox',{name:'نام مراجع',exact:true});await name.fill('ویرایش محفوظ');
 await page.getByRole('button',{name:'اشتراک و ظرفیت',exact:true}).click();await expect(page.getByRole('heading',{name:'اشتراک و ظرفیت',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'مراجعان و برنامه‌ها',exact:true}).click();await expect(name).toHaveValue('ویرایش محفوظ');
});

test('renewal request shows confirmation and prevents repeat requests',async({page})=>{
 await setup(page);await page.goto('/');await page.getByRole('button',{name:'اشتراک و ظرفیت',exact:true}).click();await page.getByRole('button',{name:'درخواست تمدید',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'در انتظار بررسی است'})).toBeVisible();await expect(page.getByRole('button',{name:'درخواست تمدید',exact:true})).toHaveCount(0);
});

test('duplicate phone requires an explicit decision before saving a new case',async({page})=>{
 const state=await setup(page);await page.route('**/rest/v1/rpc/pro_duplicate_cases',r=>r.fulfill({json:[{id:'30000000-0000-4000-8000-000000000099',display_name:'مراجع موجود',archived_at:null}]}));await page.goto('/');
 await page.getByRole('button',{name:'پرونده جدید',exact:true}).click();await page.getByLabel('نام مراجع',{exact:true}).fill('مراجع جدید');await page.getByLabel('شماره تماس',{exact:true}).fill('09121234567');await page.getByLabel('قد (سانتی‌متر)',{exact:true}).fill('165');await page.getByLabel('وزن (کیلوگرم)',{exact:true}).fill('75');for(const [name,label]of [['سال تولد','۱۳۷۱'],['ماه تولد','اردیبهشت'],['روز تولد','۳']]){await page.getByRole('combobox',{name,exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();}await page.getByRole('tab',{name:'ایمنی پزشکی'}).click();await page.getByText('پاسخ‌های ثبت‌شده را با مراجع بررسی کردم.',{exact:true}).check();
 await page.getByRole('button',{name:'ذخیره اطلاعات پرونده',exact:true}).click();await expect(page.getByRole('alert')).toContainText('با این شماره پرونده ثبت شده است.');expect(state.requests).toHaveLength(0);await page.getByRole('button',{name:'این مراجع جدید است؛ ادامه ثبت',exact:true}).click();await expect(page.getByText('اطلاعات پرونده ذخیره شد.',{exact:true})).toBeVisible();expect(state.requests).toHaveLength(1);
});
