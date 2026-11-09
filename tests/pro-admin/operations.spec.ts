import {setJalaliDate} from '../set-jalali-date';
import {test,expect,type Page} from '@playwright/test';
import {setup,org,user} from '../pro/real-fixture';
async function adminSetup(page:Page,{denied=false,lose=false,stale=false}={}){
 await setup(page);
 const workspace:any={id:org,name:'کلینیک تست Pro',status:'active',license_status:null,expires_at:null,pilot_expires_at:'2026-11-19T00:00:00Z',case_limit:null,revision:0,case_count:4,plan_count:8,members:[{user_id:user,phone:'989000000001',roles:['owner']}]};
 const requests:any[]=[];const committed=new Map();let loss=lose;
 await page.route('https://pro-test.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname,b=route.request().postDataJSON();
  if(path.endsWith('/admin_overview')){await route.fulfill(denied?{status:403,json:{message:'ADMIN_REQUIRED'}}:{json:{stats:{},users:[],plans:[]}});return;}
  if(path.endsWith('/admin_pro_offers')){await route.fulfill({json:[]});return;}
  if(path.endsWith('/admin_pro_modules')){await route.fulfill({json:{nutrition:true,training:true,revision:0}});return;}
  if(path.endsWith('/admin_pro_renewals')){await route.fulfill({json:[]});return;}
  if(path.endsWith('/admin_pro_metrics')){await route.fulfill({json:{specialists:2,specialists_by_profession:[{profession:'nutritionist',count:2}],specialists_date_unknown:0,specialists_date_fallback:0,clients:4,nutrition_total:8,nutrition_automatic:5,nutrition_authored:3,training_total:6,training_automatic:4,training_authored:2,body_reports:3}});return;}
  if(path.endsWith('/admin_pro_overview')){await route.fulfill({json:{rows:[workspace],total:1}});return;}
  if(path.endsWith('/admin_pro_events')){await route.fulfill({json:{rows:b.p_kind==='failures'?[{id:'40000000-0000-4000-8000-000000000001',created_at:'2026-10-21T00:00:00Z',operation:'generate',error_code:'PRO_GENERATION_FAILED'}]:[],total:b.p_kind==='failures'?1:0}});return;}
  if(path.endsWith('/admin_pro_set_license')){
   requests.push(b);if(stale){await route.fulfill({status:409,json:{message:'PRO_STALE_REVISION'}});return;}
   if(!committed.has(b.p_key)){Object.assign(workspace,{license_status:b.p_status,expires_at:b.p_expires,case_limit:b.p_limit,revision:workspace.revision+1});committed.set(b.p_key,workspace);}
   if(loss){loss=false;await route.abort('failed');return;}await route.fulfill({json:committed.get(b.p_key)});return;
  }
  if(path.endsWith('/admin_pro_create_workspace')){requests.push(b);await route.fulfill({json:org});return;}
  if(path.endsWith('/admin_pro_cleanup')){await route.fulfill({json:{drafts_deleted:3,failures_deleted:1}});return;}
  await route.fallback();
 });
 await page.goto('/');return {workspace,requests};
}
test('admin grants a manual Pro license and sees error correlation ID',async({page})=>{
 const state=await adminSetup(page);await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();
 await page.getByRole('button',{name:'مدیریت فضای کاری',exact:true}).click();
 await page.getByLabel('ظرفیت پرونده Pro').fill('100');await page.getByLabel('دلیل تغییر Pro').fill('فعال‌سازی تست داخلی');
 await expect(page.getByText('PRO_GENERATION_FAILED',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'ثبت مجوز دستی',exact:true}).click();
 await expect(page.getByText('مجوز دستی',{exact:true})).toBeVisible();expect(state.workspace.case_limit).toBe(100);expect(state.requests[0].p_expected).toBe(0);
});
test('lost license response retries the exact command',async({page})=>{
 const state=await adminSetup(page,{lose:true});await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();await page.getByRole('button',{name:'مدیریت فضای کاری',exact:true}).click();
 await page.getByLabel('دلیل تغییر Pro').fill('تمدید آزمایشی');await page.getByRole('button',{name:'ثبت مجوز دستی',exact:true}).click();
 await expect(page.getByRole('button',{name:'تلاش مجدد ثبت مجوز',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'تلاش مجدد ثبت مجوز',exact:true}).click();await expect(page.getByText('مجوز دستی',{exact:true})).toBeVisible();
 expect(state.requests).toHaveLength(2);expect(state.requests[0]).toEqual(state.requests[1]);expect(state.workspace.revision).toBe(1);
});
test('stale license does not silently overwrite another administrator',async({page})=>{
 await adminSetup(page,{stale:true});await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();await page.getByRole('button',{name:'مدیریت فضای کاری',exact:true}).click();
 await page.getByLabel('دلیل تغییر Pro').fill('تمدید آزمایشی');await page.getByRole('button',{name:'ثبت مجوز دستی',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('مجوز در جای دیگری تغییر کرده');await expect(page.getByLabel('دلیل تغییر Pro')).toBeEnabled();
});
test('non admin cannot see Pro administration',async({page})=>{
 await adminSetup(page,{denied:true});await expect(page.getByRole('alert')).toContainText('این حساب دسترسی مدیریت ندارد');await expect(page.getByRole('button',{name:'مدیریت Pro',exact:true})).toHaveCount(0);
});

test('administrator provisions a verified account without a fake payment',async({page})=>{
 const state=await adminSetup(page);await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();
 await page.getByRole('button',{name:'ساخت حساب Pro',exact:true}).click();
 await page.getByRole('button',{name:'استفاده از UUID',exact:true}).click();
 await page.getByLabel('UUID مالک Pro').fill('10000000-0000-4000-8000-000000000099');
 await page.getByLabel('نام پنل جدید Pro').fill('پنل تست جدید');await page.getByLabel('دلیل پنل جدید Pro').fill('دسترسی تست داخلی');
 await page.getByRole('button',{name:'ساخت و فعال‌سازی پنل',exact:true}).click();
 await expect(page.getByLabel('UUID مالک Pro')).toHaveCount(0);
 expect(state.requests[0].p_user).toBe('10000000-0000-4000-8000-000000000099');
 expect(Object.keys(state.requests[0])).not.toContain('payment');
});

test('cleanup requires confirmation and reports removed temporary rows',async({page})=>{
 await adminSetup(page);await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'پاک‌سازی داده‌های موقت',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('۳ پیش‌نمایش');
});

test('admin creates Pro account by phone without a browser service key',async({page})=>{
 await adminSetup(page);let request:any;await page.route('**/api/pro-account',async route=>{request=route.request().postDataJSON();expect(route.request().headers().authorization).toContain('Bearer ');await route.fulfill({json:{user_id:'10000000-0000-4000-8000-000000000099',organization_id:'20000000-0000-4000-8000-000000000099'}})});
 await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();await page.getByRole('button',{name:'ساخت حساب Pro',exact:true}).click();
 await page.getByLabel('شماره مالک Pro').fill('09121234567');await page.getByLabel('نام پنل جدید Pro').fill('پنل شماره جدید');await page.getByLabel('دلیل پنل جدید Pro').fill('تست دسترسی');
 await page.getByRole('button',{name:'ساخت و فعال‌سازی پنل',exact:true}).click();await expect(page.getByLabel('شماره مالک Pro')).toHaveCount(0);
 expect(request.phone).toBe('09121234567');expect(Object.keys(request).sort()).toEqual(['expires','key','limit','name','phone','reason']);
});

test('admin resolves a renewal separately from granting a license',async({page})=>{
 await adminSetup(page);let pending=true,resolved=false;await page.route('**/rest/v1/rpc/admin_pro_renewals',r=>r.fulfill({json:pending?[{id:'40000000-0000-4000-8000-000000000099',organization_id:org,name:'تمدید تست',created_at:'2026-10-21T12:00:00Z'}]:[]}));await page.route('**/rest/v1/rpc/admin_pro_resolve_renewal',r=>{pending=false;resolved=true;return r.fulfill({json:null})});
 await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();await expect(page.getByText('تمدید تست',{exact:true})).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'پایان بررسی درخواست',exact:true}).click();await expect(page.getByText('تمدید تست',{exact:true})).toHaveCount(0);expect(resolved).toBe(true);
});

test('admin layout is readable on mobile in both themes',async({page},info)=>{
 await adminSetup(page);await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();
 for(const dark of [false,true]){await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`admin-${dark?'dark':'light'}.png`),fullPage:true});}
});

test('admin edits a public Pro tariff with exact period prices',async({page})=>{
 await adminSetup(page);let offer:any={code:'training',title:'برنامه‌سازی تمرینی',subtitle:'فقط تمرین',features:['PDF فارسی'],prices:{'1':2490000,'3':5990000,'6':9490000,'12':14990000},revision:1,active:true};let saved:any;
 await page.route('**/rest/v1/rpc/admin_pro_offers',r=>r.fulfill({json:[offer]}));
 await page.route('**/rest/v1/rpc/admin_pro_save_offer',r=>{saved=r.request().postDataJSON();offer={...offer,title:saved.p_title,prices:saved.p_prices,revision:2};return r.fulfill({json:offer});});
 await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();await page.getByRole('button',{name:'ویرایش تعرفه برنامه‌سازی تمرینی',exact:true}).click();
 await page.getByLabel('نام کارت اشتراک').fill('پنل تمرین حرفه‌ای');await page.getByLabel('قیمت یک ماهه').fill('2500000');await page.getByRole('button',{name:'ذخیره تعرفه',exact:true}).click();
 await expect(page.locator('.admin-pro-offer-grid')).toContainText('پنل تمرین حرفه‌ای');expect(saved.p_prices['1']).toBe(2500000);expect(saved.p_prices['12']).toBe(14990000);expect(saved.p_expected).toBe(1);
});
test('admin changes a workspace to training-only without altering its license',async({page})=>{
 const state=await adminSetup(page);let saved:any;await page.route('**/rest/v1/rpc/admin_pro_set_modules',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{nutrition:saved.p_nutrition,training:saved.p_training,revision:1}});});
 await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();await page.getByRole('button',{name:'مدیریت فضای کاری',exact:true}).click();
 await page.getByRole('combobox',{name:'ماژول‌های پنل Pro'}).click();await page.getByRole('option',{name:'فقط تمرین',exact:true}).click();await page.getByRole('button',{name:'ثبت ماژول‌های پنل',exact:true}).click();await expect(page.getByRole('status')).toContainText('ماژول‌های پنل ذخیره شدند');expect(saved.p_nutrition).toBe(false);expect(saved.p_training).toBe(true);expect(state.requests).toHaveLength(0);
});

test('Pro metrics use the selected date range and reject a reversed range without a request',async({page})=>{
 await adminSetup(page);const requests:any[]=[];
 await page.route('**/rpc/admin_pro_metrics',async route=>{const body=route.request().postDataJSON();requests.push(body);return route.fulfill({json:{specialists:body.p_from?1:2,specialists_by_profession:[{profession:'nutritionist',count:body.p_from?1:2}],specialists_date_unknown:0,specialists_date_fallback:0,clients:4,nutrition_total:8,nutrition_automatic:5,nutrition_authored:3,training_total:6,training_automatic:4,training_authored:2,body_reports:3}});});
 await page.getByRole('button',{name:'مدیریت Pro',exact:true}).click();const stats=page.getByRole('region',{name:'آمار فعالیت پنل پرو'});await expect(stats).toContainText('متخصصین ثبت‌شده');
 await setJalaliDate(page,'آمار پرو از تاریخ','2026-11-01');await setJalaliDate(page,'آمار پرو تا تاریخ','2026-11-08');await stats.getByRole('button',{name:'اعمال بازه'}).click();await expect.poll(()=>requests.at(-1)?.p_from).toBe('2026-11-01');expect(requests.at(-1)?.p_to).toBe('2026-11-08');
 const before=requests.length;await setJalaliDate(page,'آمار پرو از تاریخ','2026-11-10');await stats.getByRole('button',{name:'اعمال بازه'}).click();await expect(stats.getByRole('alert')).toContainText('به ترتیب');expect(requests.length).toBe(before);
});

test('Persian subscription date editing preserves the independently entered time',async({page})=>{
 await adminSetup(page);
 await page.route('**/rpc/admin_overview',r=>r.fulfill({json:{stats:{},users:[{id:user,phone:'989000000001',email:null,created_at:'2026-01-01T00:00:00Z',last_sign_in_at:null,onboarding_completed:true,active_until:null,paid_toman:0}],plans:[{code:'monthly',name:'ماهانه',is_active:true,price_toman:1000}]}}));
 await page.route('**/rpc/admin_user_detail',r=>r.fulfill({json:{profile:null,subscriptions:[],orders:[],dates:[],saved_plan:null,checkins:[],audit:[]}}));
 await page.reload();await page.getByRole('button',{name:'مشاهده و مدیریت',exact:true}).click();
 await page.getByRole('button',{name:'اشتراک دستی جدید',exact:true}).click();
 await page.getByLabel('ساعت پایان اشتراک',{exact:true}).fill('14:35');
 await setJalaliDate(page,'پایان اشتراک','2026-09-22'); // 31 Shahrivar; changing to Mehr clears the invalid day.
 await page.getByRole('combobox',{name:'ماه پایان اشتراک',exact:true}).click();
 await page.getByRole('option',{name:'مهر',exact:true}).click();
 await expect(page.getByLabel('ساعت پایان اشتراک',{exact:true})).toHaveValue('14:35');
 await expect(page.getByRole('combobox',{name:'روز پایان اشتراک',exact:true})).toContainText('روز');
 await page.getByRole('combobox',{name:'روز پایان اشتراک',exact:true}).click();await page.getByRole('option',{name:'۳۰',exact:true}).click();
 await expect(page.getByLabel('ساعت پایان اشتراک',{exact:true})).toHaveValue('14:35');
 expect(await page.locator('input[type=date],input[type=datetime-local]').count()).toBe(0);
});
