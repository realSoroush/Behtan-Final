import { test, expect } from '@playwright/test';
const catalog = [
 {code:'silver',name:'تغذیه',price_toman:320000,duration_days:30,features:['برنامهٔ غذایی شخصی','جایگزینی غذا']},
 {code:'trial',name:'شروع',price_toman:0,duration_days:3,features:['آشنایی با برنامه']},
];
const offers=[{code:'training',title:'تمرین',subtitle:'برنامه‌سازی با کنترل متخصص',features:['ویرایش برنامه'],prices:{1:100000,3:280000,6:500000,12:900000}}];
test.beforeEach(async({page})=>{
 await page.route('**/rest/v1/rpc/public_subscription_catalog',r=>r.fulfill({json:catalog}));
 await page.route('**/rest/v1/rpc/pro_offer_catalog',r=>r.fulfill({json:offers}));
 await page.route('**/rest/v1/marketing_settings*',r=>r.fulfill({json:{video_url:''}}));
 await page.route('**/rest/v1/marketing_testimonials*',r=>r.fulfill({json:[]}));
 await page.route('**/trustseal.enamad.ir/**',r=>r.abort());
});
test('public prices and local meal demo never write account data',async({page})=>{
 const errors:string[]=[],writes:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/rest/v1/')&&!['GET','HEAD','OPTIONS'].includes(r.method())&&!['public_subscription_catalog','pro_offer_catalog'].some(name=>r.url().endsWith('/rpc/'+name)))writes.push(r.url());});
 await page.goto('/site.html');
 await expect(page.locator('#member-price-grid .plan')).toHaveCount(2);
 await expect(page.locator('#member-price-grid .plan').first()).toContainText('۳۲۰٬۰۰۰');
 await expect(page.locator('#member-price-grid .plan').last()).toContainText('رایگان');
 await page.locator('#eat-demo').click();await expect(page.locator('#meal-confirm')).toBeVisible();
 await page.locator('#cancel-eat').click();await expect(page.locator('#eat-demo')).toHaveAttribute('aria-pressed','false');
 await page.locator('#eat-demo').click();await page.locator('#confirm-eat').click();
 await expect(page.locator('#eat-demo')).toHaveAttribute('aria-pressed','true');
 await page.locator('#eat-demo').click();await expect(page.locator('#eat-demo')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('#start a.btn')).toHaveAttribute('href','/app.html#auth');
 await expect(page.locator('.enamad-link')).toHaveAttribute('href',/trustseal\.enamad\.ir\/\?id=7609793/);
 expect(errors).toEqual([]);expect(writes).toEqual([]);
});
test('catalog failure retries without displaying stale or invented prices',async({page})=>{
 let failed=true;
 await page.route('**/rest/v1/rpc/public_subscription_catalog',r=>r.fulfill(failed?{status:503,json:{message:'offline'}}:{json:catalog}));
 await page.goto('/site.html');await expect(page.locator('#member-price-grid')).toContainText('دریافت اطلاعات ممکن نشد');
 await expect(page.locator('#member-price-grid .plan')).toHaveCount(0);
 failed=false;await page.locator('#member-price-grid button').click();await expect(page.locator('#member-price-grid .plan')).toHaveCount(2);
});
test('Pro uses actual catalog periods and links to the existing panel',async({page})=>{
 await page.goto('/site.html#pro');await expect(page.locator('#pro-page')).toBeVisible();
 await expect(page.locator('#pro-price-grid .pro-price')).toHaveCount(1);
 await expect(page.locator('#pro-price-grid')).toContainText('۱۰۰٬۰۰۰');
 await page.getByRole('button',{name:'۳ ماهه',exact:true}).click();await expect(page.locator('#pro-price-grid')).toContainText('۲۸۰٬۰۰۰');
 await expect(page.locator('#pro-price-grid a')).toHaveAttribute('href','https://pro.behtan.fit');
 await expect(page.locator('.white-label a.btn')).toContainText('درخواست دموی رایگان');
 await expect(page.locator('.white-label a.btn')).toHaveAttribute('href',/^https:\/\/t\.me\/soroushkheradmand/);
});
test('mobile menu reaches Pro and closes after navigation',async({page,isMobile})=>{
 test.skip(!isMobile,'Compact menu is shown on mobile.');
 await page.goto('/site.html');await page.locator('#menu-toggle').click();await expect(page.locator('#site-nav')).toBeVisible();
 await page.locator('#site-nav').getByRole('link',{name:'متخصصین',exact:true}).click();
 await expect(page.locator('#pro-page')).toBeVisible();await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('.nav-inner>.btn')).toHaveText('درخواست دموی رایگان');
});
test('reduced motion keeps the new content visible and usable',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/site.html');
 await expect(page.locator('#member-page h1')).toBeVisible();await expect(page.locator('#member-price-grid .plan')).toHaveCount(2);
 await expect(page.locator('.ribbon')).toHaveCSS('animation-name','none');
});
test('the app handoff opens existing authentication without the marketing shell',async({page})=>{
 await page.goto('/site.html');await page.locator('#start a.btn').click();
 await expect(page.getByRole('heading',{name:'ورود به برنامه',exact:true})).toBeVisible();
 await expect(page.locator('#marketing-shell')).toHaveCount(0);
});
