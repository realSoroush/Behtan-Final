import {test,expect,type Page} from '@playwright/test';
import {setup,org,user} from '../pro/real-fixture';
async function adminSetup(page:Page,{denied=false,lose=false,stale=false}={}){
 await setup(page);
 const workspace:any={id:org,name:'کلینیک تست Pro',status:'active',license_status:null,expires_at:null,pilot_expires_at:'2026-11-19T00:00:00Z',case_limit:null,revision:0,case_count:4,plan_count:8,members:[{user_id:user,phone:'989000000001',roles:['owner']}]};
 const requests:any[]=[];const committed=new Map();let loss=lose;
 await page.route('https://pro-test.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname,b=route.request().postDataJSON();
  if(path.endsWith('/admin_overview')){await route.fulfill(denied?{status:403,json:{message:'ADMIN_REQUIRED'}}:{json:{stats:{},users:[],plans:[]}});return;}
  if(path.endsWith('/admin_pro_renewals')){await route.fulfill({json:[]});return;}
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
