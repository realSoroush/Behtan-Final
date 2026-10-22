/** Persisted step IDs stay unchanged, including the retired speed step. */
export const ONBOARDING_PHASES=['دربارهٔ تو','سبک زندگی','مرور و شروع'] as const;
export function onboardingPhase(step:number){return step<=3?0:step<=7?1:2;}
export function onboardingDirection(previous:number,current:number){return current>=previous?1:-1;}
export function normalizeOnboardingDigits(value:string){return value.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));}
/** Keyboard input only; reject exponent notation, non-finite and ambiguous grouping. */
export function parseOnboardingNumber(value:string):number|null{
 const normalized=normalizeOnboardingDigits(value.trim()).replace(/٫/g,'.');
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized))return null;
 const number=Number(normalized);return Number.isFinite(number)?number:null;
}
