import assert from 'node:assert/strict';
import { isoToJalali, jalaliToIso, jalaliMonthLength } from '../src/utils/jalaliDate.ts';
import { tryCalculateAge } from '../src/utils/nutritionHelpers.ts';
assert.equal(jalaliToIso(1379,4,14),'2000-07-04');
assert.deepEqual(isoToJalali('2000-07-04'),{year:1379,month:4,day:14});
assert.equal(jalaliToIso(1403,1,1),'2024-03-20');
assert.equal(jalaliToIso(1399,12,30),'2021-03-20');
assert.equal(jalaliToIso(1400,12,30),null);
assert.equal(jalaliMonthLength(1399,12),30);
assert.equal(jalaliMonthLength(1400,12),29);
assert.equal(jalaliToIso(1380,7,31),null);
assert.equal(jalaliToIso(1380,0,10),null);
assert.equal(isoToJalali('2000-02-31'),null);
assert.equal(isoToJalali(''),null);
// Round-trip every date covering all selectable birth years, including leap days.
for(let time=Date.UTC(1950,0,1);time<Date.UTC(2010,0,1);time+=86400000){
 const iso=new Date(time).toISOString().slice(0,10); const j=isoToJalali(iso);
 assert.equal(jalaliToIso(j.year,j.month,j.day),iso);
}
const reference=new Date(2026,8,15);
for(const iso of ['2008-09-15','2008-09-16','1955-09-16','1955-09-15']){
 const j=isoToJalali(iso);
 assert.equal(tryCalculateAge(jalaliToIso(j.year,j.month,j.day),reference),tryCalculateAge(iso,reference));
}
console.log('✅ Persian birthday: known dates, leap Esfand, invalid days, 60-year round-trip, age boundaries');
