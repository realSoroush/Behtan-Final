// Synthetic sample generator, used for PDF/visual QA. Not a production route.
import {writeFile,mkdir} from 'node:fs/promises';
import {emptyRealIntake} from '../../src/professional/menuPlan.ts';
import {buildTrainingPlan} from '../../src/training/engine.ts';
import {trainingHtml} from '../../src/training/print.ts';
const a={...emptyRealIntake(),display_name:'مراجع نمونه — داده مصنوعی',birth_date:'1992-04-23',height_cm:165,weight_kg:75,workout_days:3,safety_confirmed:true};
const input={version:1,location:'home',experience:'beginner',goal:'general',days:[0,2,4],minutes:45,equipment:['dumbbells','stable_platform'],start_date:'2026-10-24',screening:{confirmed:true,symptoms:false,pain:false,restriction:false,recent_surgery:false}};
const plan=buildTrainingPlan(a,input,1,new Date('2026-10-22T12:00:00Z'));
await mkdir(new URL('../../output/training/',import.meta.url),{recursive:true});
await writeFile(new URL('../../output/training/sample.json',import.meta.url),JSON.stringify(plan,null,2));
await writeFile(new URL('../../output/training/sample.html',import.meta.url),trainingHtml(plan,'http://127.0.0.1:5175').replace('این خروجی پس از بازبینی پنل صادر شده است.','نمونه مصنوعی برای بررسی قالب؛ پرونده واقعی نیست.'));
console.log('Synthetic training sample written to output/training/');
