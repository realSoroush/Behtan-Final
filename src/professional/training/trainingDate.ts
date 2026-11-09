import {isoToJalali} from '../../utils/jalaliDate.ts';
export const validTrainingDate=(value:unknown):value is string=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Boolean(isoToJalali(value));
export const trainingDayTitle=(index:number)=>'روز '+(['اول','دوم','سوم','چهارم','پنجم','ششم','هفتم'][index]||String(index+1));
export const trainingStartLabel=(value:string)=>validTrainingDate(value)?new Date(value+'T12:00:00Z').toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'}):'تاریخ نامعتبر';
