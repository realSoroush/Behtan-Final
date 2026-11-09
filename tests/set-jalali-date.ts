import type {Page} from '@playwright/test';
import {isoToJalali} from '../src/utils/jalaliDate';
const months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
export async function setJalaliDate(page:Page,label:string,iso:string){
 const d=isoToJalali(iso)!;
 for(const [part,value] of [['سال',d.year.toLocaleString('fa-IR',{useGrouping:false})],['ماه',months[d.month-1]],['روز',d.day.toLocaleString('fa-IR')]]){
  await page.getByRole('combobox',{name:part+' '+label,exact:true}).click();
  await page.getByRole('option',{name:value,exact:true}).click();
 }
}
