type Recipe = {
  // Quantities are per catalog unit, measured before mixing and final cooking.
  ingredients: readonly (readonly [name: string, quantity: number, unit: string])[];
  method: string;
  note?: string;
  source: string;
};

const gram = 'گرم';
const ml = 'میلی‌لیتر';
const tsp = 'قاشق چای‌خوری';
const tbsp = 'قاشق غذاخوری';
const ounce = 28.349523125;
const cup = 236.5882365;

export const memberRecipes: ReadonlyMap<string, Recipe> = new Map<string, Recipe>([
  ['whole_wheat_beef_pasta_cooked', {
    ingredients: [
      ['گوشت گاو خام چرخ‌کرده، حداکثر ۱۵٪ چربی', 68 * ounce / 25, gram],
      ['ماکارونی سبوس‌دار خشک', 25 * ounce / 25, gram],
      ['پورهٔ گوجه بدون نمک افزوده', 40 * ounce / 25, gram],
      ['هویج رنده‌شده', 10 * ounce / 25, gram],
      ['پیاز خردشده', 2.5 * ounce / 25, gram],
      ['فلفل دلمه‌ای سبز', 2.5 * ounce / 25, gram],
      ['آب گوشت کم‌نمک', 2 * cup / 25, ml],
      ['آب سس', 4 * cup / 25, ml],
      ['آب پخت ماکارونی، سپس آبکش می‌شود', 48 * cup / 25, ml],
      ['پودر سیر', 2.25 / 25, tsp],
      ['فلفل سیاه', .75 / 25, tsp],
      ['نمک', 2 / 25, tsp],
      ['جعفری خشک', 2 / 25, tbsp],
      ['ریحان خشک', 1 / 25, tbsp],
      ['اورگانو خشک', 1 / 25, tbsp],
      ['مرزنجوش خشک', 1.5 / 25, tsp],
      ['آویشن خشک', .75 / 25, tsp],
    ],
    method: 'گوشت را طبق دستور مرجع بپز و چربی خارج‌شده را بگیر. پیاز و فلفل را اضافه کن، سپس مواد سس را بپز. ماکارونی را جداگانه بپز و آبکش کن و با سس مخلوط کن. سهم را بعد از پخت وزن کن.',
    note: 'حاوی گندم و گوشت گاو. مقدار اسپری جداکنندهٔ ظرف در منبع مشخص نشده است.',
    source: 'https://theicn.org/cnrb/pdfs/cacfp/Spaghetti_and_Meat_Sauce_25-50_%282%29_F.pdf',
  }],
  ['chicken_curry_brown_rice_cooked', {
    ingredients: [
      ['برنج قهوه‌ای خشک', 24 * ounce / 25, gram],
      ['آب برای پخت برنج', 7 * cup / 25, ml],
      ['مرغ فاهیتای پخته، خردشده', 50 * ounce / 25, gram],
      ['ماست سادهٔ کم‌چرب', 16 * ounce / 25, gram],
      ['هویج رنده‌شده', 17.5 * ounce / 25, gram],
      ['کرفس خردشده', 11.5 * ounce / 25, gram],
      ['پیاز خردشده', 11 * ounce / 25, gram],
      ['روغن کانولا', .25 * cup / 25, ml],
      ['آب مرغ کم‌نمک', cup / 25, ml],
      ['پودر کاری', 3 / 25, tbsp],
      ['پودر سیر', 1.5 / 25, tbsp],
      ['فلفل سیاه', .75 / 25, tbsp],
      ['نمک', 1.5 / 25, tsp],
    ],
    method: 'برنج را جداگانه بپز. هویج، کرفس و پیاز را با روغن و آب مرغ بپز. ماست و ادویه‌ها را مخلوط کن، سپس با مرغ پخته، سبزیجات و برنج ترکیب کن و طبق دستور مرجع در فر بپز. سهم را بعد از پخت وزن کن.',
    note: 'حاوی لبنیات و کرفس. برای مرغ آماده، آب مرغ و مخلوط ادویه، برچسب مواد را بررسی کن.',
    source: 'https://theicn.org/cnrb/pdfs/cacfp/Chicken_Curry_Casserole_-_CACFP_Center_Recipe.pdf',
  }],
]);
