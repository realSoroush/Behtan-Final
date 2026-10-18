export type CompanionMood = 'welcome' | 'guide' | 'thinking' | 'celebrate' | 'calm' | 'listening';
export type CompanionMessage = {
  mood: CompanionMood;
  title: string;
  body: string;
  action?: string;
};

/** UI guidance only. Never estimates health outcomes or changes nutrition targets. */
export function getDailyCompanion(input: {
  total: number;
  consumed: number;
  saving?: boolean;
  error?: boolean;
  planError?: boolean;
  event?: 'recorded' | 'swapped' | null;
}): CompanionMessage {
  if (input.planError) return {
    mood: 'calm', title: 'فعلاً برنامه‌ای آماده نیست.',
    body: 'توضیح مشکل را پایین ببین؛ بعد می‌توانی دوباره برای ساخت برنامه تلاش کنی.',
  };
  if (input.error) return {
    mood: 'calm', title: 'اول اتصال را درست کنیم.',
    body: 'وضعیت برنامه هنوز تأیید نشده؛ پیام خطا و گزینهٔ تلاش دوباره را پایین ببین.',
  };
  if (input.saving) return {
    mood: 'thinking', title: 'در حال ذخیرهٔ تغییرت…',
    body: 'بعد از تأیید ذخیره، ادامه می‌دهیم.',
  };
  if (input.total <= 0) return {
    mood: 'thinking', title: 'برنامه‌ات در حال آماده‌شدن است.',
    body: 'وقتی آماده شد، وعده‌ها را همین‌جا می‌بینی.',
  };
  if (input.consumed >= input.total) return {
    mood: input.event === 'recorded' ? 'celebrate' : 'calm',
    title: 'وعده‌های امروز ثبت شدند.',
    body: 'برای امروز کافی است. اگر ثبتی نیاز به اصلاح دارد، می‌توانی برگردی و تغییرش بدهی.',
    action: 'مرور ثبت‌های امروز',
  };
  if (input.event === 'swapped') return {
    mood: 'guide', title: 'این انتخاب هم بخشی از برنامه‌ات شد.',
    body: 'مقدار جدید را در کارت وعده ببین؛ انتخاب‌ها می‌توانند با روزت جور شوند.',
    action: 'دیدن وعده‌ها',
  };
  if (input.event === 'recorded') return {
    mood: 'celebrate', title: 'ثبت شد؛ یک قدم جلو رفتی.',
    body: 'لازم نیست همهٔ روز را یک‌جا پیش ببری. هر وقت آماده بودی، ادامه بده.',
    action: 'دیدن وعده‌ها',
  };
  return input.consumed > 0 ? {
    mood: 'guide', title: 'از همین‌جا ادامه می‌دهیم.',
    body: 'وعده‌های ثبت‌شده مشخص‌اند. برای ادامه، انتخاب‌های باقی‌مانده را ببین.',
    action: 'دیدن وعده‌های باقی‌مانده',
  } : {
    mood: 'welcome', title: 'امروز را با یک قدم ساده شروع کن.',
    body: 'وعده‌ات را ببین؛ اگر غذایی در دسترس نیست، جایگزین‌های همان ماده را باز کن.',
    action: 'دیدن وعده‌ها',
  };
}

const ONBOARDING_MESSAGES: Record<number, CompanionMessage> = {
  1: { mood: 'welcome', title: 'خوش آمدی؛ از خودت شروع کنیم.', body: 'چند پاسخ کوتاه کمک می‌کند برنامه به زندگی تو نزدیک‌تر شود.' },
  2: { mood: 'calm', title: 'این عددها فقط نقطهٔ شروع‌اند.', body: 'قد و وزن فعلی‌ات را وارد کن تا مبنای محاسبهٔ برنامه باشند.' },
  3: { mood: 'guide', title: 'این مسیر، مسیر توست.', body: 'هدفی را انتخاب کن که الان برای خودت می‌خواهی.' },
  4: { mood: 'guide', title: 'یک روز معمولی‌ات را تصور کن.', body: 'پاسخ بر اساس روزهای عادی، برنامه را به واقعیت نزدیک‌تر می‌کند.' },
  5: { mood: 'calm', title: 'از جایی که هستی شروع می‌کنیم.', body: 'اگر فعلاً ورزش نمی‌کنی، همان را انتخاب کن.' },
  6: { mood: 'calm', title: 'این بخش را با دقت پاسخ بده.', body: 'پاسخ‌ها مشخص می‌کنند برنامهٔ عمومی به‌تن برای شرایطت قابل ارائه هست یا نه.' },
  7: { mood: 'guide', title: 'غذا باید با زندگی‌ات جور باشد.', body: 'ترجیحات، حساسیت‌ها و بودجه‌ات را در انتخاب غذاها لحاظ می‌کنیم.' },
  9: { mood: 'calm', title: 'انتخاب عکس کاملاً با توست.', body: 'می‌توانی مسیر بدون عکس را انتخاب کنی و ادامه بدهی.' },
  10: { mood: 'guide', title: 'اطلاعاتت را یک بار مرور کن.', body: 'اگر چیزی نیاز به اصلاح دارد، به مرحلهٔ قبل برگرد.' },
  11: { mood: 'calm', title: 'شرایط هر اشتراک را ببین.', body: 'امکانات و هزینه را بررسی کن و اگر مناسب تو بود، ادامه بده.' },
};

export function getOnboardingCompanion(step: number): CompanionMessage | null {
  return ONBOARDING_MESSAGES[step] ?? null;
}
