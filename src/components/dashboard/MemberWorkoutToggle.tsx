import { Dumbbell } from 'lucide-react';
export function MemberWorkoutToggle({value,disabled,onChange}:{value:boolean;disabled?:boolean;onChange:(v:boolean)=>void}) {
 return <button type="button" className="member-workout-pill" role="switch" aria-label="امروز روز ورزشی است" aria-checked={value} disabled={disabled} onClick={()=>onChange(!value)} title={disabled?'وعدهٔ پس از تمرین ثبت شده یا تغییر در حال ذخیره است':undefined}><Dumbbell size={15}/><span>روز ورزشی</span><i><b/></i></button>;
}
