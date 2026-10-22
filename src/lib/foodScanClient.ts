import { supabase } from './supabaseClient';
import { parseFoodScanResult } from '@/utils/foodScan';
export const FOOD_SCAN_DEMO=false;
export async function analyzeFoodPhoto(imageBase64:string,signal:AbortSignal) {
  const {data,error}=await supabase.functions.invoke('food-scan',{body:{imageBase64},signal,timeout:45000});
  if(error){
    if(signal.aborted)throw Error('بررسی عکس لغو شد.');
    const response=(error as {context?:Response}).context;
    if(response instanceof Response){
      const body=await response.clone().json().catch(()=>null);
      const messages:Record<string,string>={LIMIT_REACHED:'کمی صبر کن و دوباره تلاش کن؛ هر روز حداکثر ۱۰ بررسی ممکن است.',ACCESS_DENIED:'برای بررسی غذا، ورود و دسترسی فعال لازم است.',NOT_CONFIGURED:'سرویس بررسی غذا هنوز فعال نشده است.',AUTH_REQUIRED:'دوباره وارد حسابت شو.'};
      if(body?.error&&messages[body.error])throw Error(messages[body.error]);
    }
    throw Error('بررسی عکس انجام نشد. اتصال یا ظرفیت سرویس را بررسی و دوباره تلاش کن.');
  }
  return parseFoodScanResult(data);
}
