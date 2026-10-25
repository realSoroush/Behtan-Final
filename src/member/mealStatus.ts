/** Status belongs to a local calendar date, never to a recurring slot alone. */
export function isMealSkipped(slot:string,skipped:readonly string[],statusDate:string,viewDate:string){
 return statusDate===viewDate && skipped.includes(slot);
}
