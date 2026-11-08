export type CorrectiveStatus='draft'|'reviewed'|'published'|'archived';
export interface CorrectiveExercise {
 id:string;revision:number;nameFa:string;nameEn:string;aliases:string[];
 categories:string[];subgroups:string[];bodyRegions:string[];equipment:string[];muscles:string[];goals:string[];movementTypes:string[];
 difficulty:string;position:string;pattern:string;laterality:string;stages:string[];
 start:string;steps:string[];breathing:string;mistakes:string[];precautions:string[];
 sourceUrls:string[];reviewer:string;reviewerQualification:string;reviewedAt:string;imageUrl:string;videoUrl:string;
 status:CorrectiveStatus;catalogSource:string;ownerOrg?:string;
}
export const CORRECTIVE_CATEGORIES=[['ankle','مچ پا و کف پا'],['knee','زانو'],['hip','لگن و مفصل ران'],['lumbar','کمر و عضلات مرکزی'],['thoracic','ستون سینه‌ای و قفسه سینه'],['shoulder','شانه و کتف'],['cervical','گردن و وضعیت سر'],['balance','تعادل و هماهنگی'],['movement','الگوهای حرکتی'],['breathing','تنفس و دیافراگم']] as const;
export const EQUIPMENT=[['bodyweight','بدون تجهیزات'],['band','کش مقاومتی'],['mini_band','مینی‌بند'],['foam_roller','فوم رولر'],['massage_ball','توپ ماساژ'],['stability_ball','توپ سوئیسی'],['dowel','چوب تمرینی'],['balance_pad','پد تعادل'],['bosu','بوسوبال'],['step','استپ'],['light_dumbbell','دمبل سبک'],['kettlebell','کتل‌بل'],['cable','دستگاه کابل'],['strap','تسمه کششی'],['wall','دیوار / چارچوب در'],['chair','صندلی / باکس'],['foam','سطح فومی'],['ball','توپ سبک'],['towel','حوله']] as const;
export const STATUS_LABELS:Record<CorrectiveStatus,string>={draft:'پیش‌نویس؛ نیازمند بازبینی',reviewed:'بازبینی‌شده',published:'منتشرشده',archived:'آرشیو'};
export const safeMedia=(value:string)=>/^https:\/\/[^\s]+$/i.test(value)||/^\/training\/media\/[a-zA-Z0-9_.-]+$/.test(value);
export function publicationError(row:CorrectiveExercise):string {
 if(!row.nameFa.trim()||!row.nameEn.trim()||!row.categories.length||!row.subgroups.length||!row.bodyRegions.length||!row.muscles.length||!row.goals.length||!row.movementTypes.length||!row.equipment.length||!row.difficulty||!row.position||!row.start.trim()||!row.steps.length||!row.precautions.length)return 'اطلاعات اجرا، عضلات هدف، دسته‌بندی و موارد احتیاط کامل نشده‌اند.';
 if(!row.sourceUrls.length||row.sourceUrls.some(url=>!/^https:\/\/[^\s]+$/i.test(url))||!row.reviewer.trim()||!row.reviewerQualification.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(row.reviewedAt)||!Number.isFinite(Date.parse(row.reviewedAt))||new Date(row.reviewedAt).toISOString().slice(0,10)!==row.reviewedAt||row.reviewedAt>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))return 'منبع معتبر، نام و صلاحیت بازبین و تاریخ بازبینی لازم است.';
 if((row.imageUrl&&!safeMedia(row.imageUrl))||(row.videoUrl&&!safeMedia(row.videoUrl)))return 'آدرس رسانه معتبر نیست.';
 return '';
}
