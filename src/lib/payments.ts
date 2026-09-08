import { supabase } from './supabaseClient';
import type { SubscriptionPlan } from '@/types';

export interface PaymentOrder {
  id:string; token:string; planName:string; priceToman:number; mode:'sandbox'|'live';
  status:'creating'|'pending'|'paid'|'failed'; refId:string|null; lastCode:number|null;
  createdAt:string; paymentUrl:string|null;
}
export interface BillingStatus {
  mode:'sandbox'|'live'; checkout_enabled:boolean;
  active:{plan_code:string;starts_at:string;expires_at:string}|null;
  orders:PaymentOrder[];
}
const messages:Record<string,string>={
  UNAUTHORIZED:'برای ادامه دوباره وارد حساب خود شوید.',
  CHECKOUT_DISABLED:'پرداخت هنوز فعال نشده است. لطفاً کمی بعد مراجعه کنید.',
  VERIFIED_PHONE_REQUIRED:'پرداخت واقعی پس از فعال‌شدن ورود پیامکی و تأیید شماره شما در دسترس قرار می‌گیرد.',
  PROFILE_INELIGIBLE:'ابتدا اطلاعات و ارزیابی پزشکی خود را کامل کنید.',
  OFFER_CHANGED:'قیمت یا مدت پلن تغییر کرده است. اطلاعات جدید را بررسی و دوباره انتخاب کنید.',
  PLAN_UNAVAILABLE:'این پلن دیگر فعال نیست. پلن دیگری انتخاب کنید.',
  CHECKOUT_BUSY:'سفارش قبلی در حال ایجاد است. یک دقیقه بعد وضعیت را بررسی کنید.',
  PENDING_ORDER_EXISTS:'یک سفارش باز با قیمت یا پلن دیگری دارید. از سفارش‌های اخیر آن را بررسی کنید، یا ۲۰ دقیقه پس از ایجاد سفارش دوباره تلاش کنید.',
  ALREADY_ACTIVE:'اشتراک شما فعال است. وضعیت را به‌روزرسانی کنید.',
  RATE_LIMITED:'تعداد تلاش‌ها زیاد است. چند دقیقه بعد دوباره تلاش کنید.',
  ORDER_NOT_FOUND:'این سفارش در حساب فعلی پیدا نشد. با حسابی که پرداخت را آغاز کرده‌اید وارد شوید.',
  GATEWAY_UNAVAILABLE:'ارتباط با درگاه برقرار نشد. پیش از پرداخت دوباره، وضعیت سفارش را بررسی کنید.',
  GATEWAY_REJECTED:'درگاه درخواست پرداخت را نپذیرفت.',
};

export async function paymentRequest<T>(body:Record<string,unknown>):Promise<T> {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error(messages.UNAUTHORIZED);
  let response:Response;
  try {
    response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payments`,{
      method:'POST',signal:AbortSignal.timeout(40000),
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,apikey:import.meta.env.VITE_SUPABASE_ANON_KEY},
      body:JSON.stringify(body),
    });
  } catch {throw new Error('ارتباط برقرار نشد. نتیجه پرداخت هنوز مشخص نیست؛ وضعیت را دوباره بررسی کنید.');}
  const result=await response.json();
  if(!response.ok)throw new Error(`${messages[result.error] ?? 'دریافت وضعیت پرداخت ممکن نشد. دوباره تلاش کنید.'}${Number.isInteger(result.code)?` (کد ${result.code})`:''}`);
  return result as T;
}

export async function startCheckout(plan:SubscriptionPlan) {
  const result=await paymentRequest<{order:PaymentOrder}>({action:'create',planCode:plan.code,priceToman:plan.priceToman,durationDays:plan.durationDays});
  if(result.order.paymentUrl) {
    const target=new URL(result.order.paymentUrl);
    if(!['https://payment.zarinpal.com','https://sandbox.zarinpal.com'].includes(target.origin) || !target.pathname.startsWith('/pg/StartPay/')) throw new Error('آدرس درگاه معتبر نیست.');
    window.location.assign(target.href);
  }
  return result.order;
}
