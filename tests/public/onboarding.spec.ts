import {test,expect,type Page} from '@playwright/test';
import {createEmptyOnboardingData} from '../../src/types';
import {mergeActivityAnswers} from '../../src/utils/onboardingActivity';
import {MEDICAL_SAFETY_SCREENING_VERSION} from '../../src/utils/medicalEligibility';
const draft={...mergeActivityAnswers(createEmptyOnboardingData(),{dailyMovement:'mostly_seated',dailySteps:'under_4000',workoutLocation:'none'}),displayName:'کاربر نمونه',gender:'male',province:'تهران',city:'تهران',birthDate:'1992-04-23',height:178,weight:125.5,goal:'weight_loss',pregnancyStatus:'not_applicable',eatingDisorderStatus:'none',safetyAnswersConfirmed:true,safetyScreeningVersion:MEDICAL_SAFETY_SCREENING_VERSION};
test.beforeEach(async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/src/hooks/useAuth.ts*',r=>r.fulfill({contentType:'text/javascript',body:`export function useAuth(){return {user:{id:'onboarding-test-user'},loading:false}}`}));
 await page.route('**/src/hooks/useUserProfile.ts*',r=>r.fulfill({contentType:'text/javascript',body:`export { useUserProfile } from '/tests/public/onboarding-profile.mock.ts';`}));
 await page.route('**/src/hooks/useSubscriptionPlans.ts*',r=>r.fulfill({contentType:'text/javascript',body:`export function useSubscriptionPlans(){const plans=[{code:'test',name:'آزمایشی',theme:'green',priceToman:0,priceNote:'تست',durationDays:30,features:['اشتراک آزمایشی'],badge:null,emoji:''}];return {plans,loading:false,error:null,refetch:async()=>plans}}`}));
});
async function visit(page:Page,step:number,patch:Record<string,unknown>={},loadError=false){
 const pageErrors:string[]=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.addInitScript(({step,draft,loadError})=>{if(!sessionStorage.getItem('onboarding-test-seeded')){localStorage.setItem('onboarding-test-profile',JSON.stringify({onboarding_step:step,onboarding_draft_json:draft}));if(loadError)localStorage.setItem('onboarding-test-load-error','1');sessionStorage.setItem('onboarding-test-seeded','1');}},{step,draft:{...draft,...patch},loadError});
 await page.goto('/tests/public/onboarding-harness.html');
 // Surface module/bootstrap errors instead of waiting 30 seconds for every field.
 await expect.poll(async()=>pageErrors[0]??(await page.locator('.onboarding-app').count()?'ready':'loading'),{message:'Onboarding test page must load without JavaScript module errors'}).toBe('ready');
}
test('actual city survives gender selection and saves before moving forward',async({page})=>{
 await visit(page,1);await page.getByRole('textbox',{name:'چه اسمی صدات کنیم؟'}).fill('سروش');
 await page.getByLabel('استان',{exact:true}).selectOption('کردستان');
 await page.getByRole('textbox',{name:'نام شهر',exact:true}).fill('سنندج');
 await page.getByRole('button',{name:'مرد',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'نام شهر',exact:true})).toHaveValue('سنندج');
 await page.getByRole('button',{name:'ادامه',exact:true}).click();
 await expect(page.getByRole('heading',{name:'مشخصات جسمی',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('onboarding-test-profile')!).onboarding_draft_json.city)).toBe('سنندج');
 await page.reload();await expect(page.getByRole('heading',{name:'مشخصات جسمی',exact:true})).toBeVisible();
});
test('Persian fractional weight validates, persists and resumes correctly',async({page})=>{
 await visit(page,2);await page.getByRole('textbox',{name:'قد',exact:true}).fill('۱۷۸');
 const weight=page.getByRole('textbox',{name:'وزن فعلی',exact:true});await weight.fill('1e3');
 await expect(weight).toHaveAttribute('aria-invalid','true');await expect(page.getByRole('button',{name:'ادامه',exact:true})).toBeDisabled();
 await weight.fill('۱۲۵٫۵');await page.getByRole('button',{name:'ادامه',exact:true}).click();
 await expect(page.getByRole('heading',{name:'هدف شما چیست؟'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('onboarding-test-profile')!).onboarding_draft_json.weight)).toBe(125.5);
});
test('failed save leaves the current answers and allows retry',async({page})=>{
 await visit(page,3);await page.getByRole('button',{name:/کاهش وزن/}).click();
 await page.evaluate(()=>localStorage.setItem('onboarding-test-save-error','1'));
 await page.getByRole('button',{name:'ادامه',exact:true}).click();await expect(page.getByRole('alert')).toContainText('ذخیره اطلاعات انجام نشد');
 await expect(page.getByRole('heading',{name:'هدف شما چیست؟'})).toBeVisible();
 await page.evaluate(()=>localStorage.removeItem('onboarding-test-save-error'));await page.getByRole('button',{name:'ادامه',exact:true}).click();
 await expect(page.getByRole('heading',{name:'تحرک روزانه',exact:true})).toBeVisible();
});
test('profile loading failure never silently starts a new onboarding',async({page})=>{
 await visit(page,4,{},true);await expect(page.getByRole('alert')).toContainText('اطلاعات قبلی‌ات دریافت نشد');
 await expect(page.getByRole('textbox',{name:'چه اسمی صدات کنیم؟'})).toHaveCount(0);
 await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await expect(page.getByRole('heading',{name:'تحرک روزانه',exact:true})).toBeVisible();
});
test('medical hard-stop stays in place in the new shell',async({page})=>{
 await visit(page,6,{medicalConditions:['kidney_disease']});await expect(page.getByText('برنامه خودکار برای شما صادر نمی‌شود',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'ادامه',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'ذخیره پاسخ‌ها',exact:true})).toBeEnabled();
});
test('no-photo path reaches review without requesting AI analysis',async({page})=>{
 let requests=0;page.on('request',r=>{if(r.url().includes('/functions/v1/body-scan'))requests++;});
 await visit(page,9);await page.getByRole('button',{name:'ادامه بدون عکس',exact:true}).click();
 await page.getByRole('button',{name:/مزومورف/}).click();await page.getByRole('button',{name:'ادامه',exact:true}).click();
 await expect(page.getByText('بدون عکس ادامه می‌دهیم',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'ادامه به مرحله پایانی',exact:true}).click();
 await expect(page.getByRole('region',{name:'خلاصهٔ پاسخ‌ها'})).toContainText('۱۲۵٫۵');
 expect(requests).toBe(0);
});
test('progress skips the retired speed step in both directions',async({page})=>{
 await visit(page,9);await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','8');
 await page.getByRole('button',{name:'بازگشت',exact:true}).click();await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','7');
 await expect(page.getByRole('heading',{name:'رژیم غذایی، آلرژی و بودجه'})).toBeVisible();
});
test('dark onboarding and keyboard focus stay inside a narrow screen',async({page})=>{
 await visit(page,2);await page.getByRole('button',{name:'تغییر به تم تیره'}).click();
 await expect(page.locator('html')).toHaveClass(/dark/);await page.keyboard.press('Tab');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
