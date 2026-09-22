export interface ProgressEntry {
  entry_date:string;
  weight_kg:number|null;
  adherence:'mostly'|'partly'|'little'|null;
  hunger:'comfortable'|'sometimes'|'often'|null;
  difficulty:'none'|'time'|'cost'|'taste'|'portions'|'other'|null;
}
export function parseWeight(value:string):number|null {
  const normalized=value.trim().replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g,'.');
  if(!normalized)return null;
  if(!/^\d{1,3}(\.\d)?$/.test(normalized))throw Error('وزن را با حداکثر یک رقم اعشار وارد کن.');
  const n=Number(normalized);if(n<25||n>350)throw Error('وزن باید بین ۲۵ تا ۳۵۰ کیلوگرم باشد.');return n;
}
export function weightTrend(entries:ProgressEntry[]) {
  const points=entries.filter(e=>typeof e.weight_kg==='number'&&Number.isFinite(e.weight_kg)).sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
  return {points,change:points.length>1?Math.round((points[points.length-1].weight_kg!-points[0].weight_kg!)*10)/10:null};
}
export function reviewDue(entries:ProgressEntry[],today:string):boolean {
  const last=entries.filter(e=>e.adherence!==null||e.hunger!==null||e.difficulty!==null).sort((a,b)=>b.entry_date.localeCompare(a.entry_date))[0];
  return !last || (Date.parse(today+'T12:00:00Z')-Date.parse(last.entry_date+'T12:00:00Z'))/86400000>=7;
}
