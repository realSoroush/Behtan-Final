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
