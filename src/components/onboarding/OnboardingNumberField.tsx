import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { parseOnboardingNumber } from '@/utils/onboardingExperience';

export function OnboardingNumberField({value,onChange,label,suffix,placeholder,min,max,errorMessage}:{value:number|null;onChange:(value:number|null)=>void;label:string;suffix:string;placeholder:string;min:number;max:number;errorMessage:string}){
 const [draft,setDraft]=useState(value===null?'':String(value));
 const emitted=useRef(value);
 useEffect(()=>{if(value!==emitted.current){setDraft(value===null?'':String(value));emitted.current=value;}},[value]);
 const number=parseOnboardingNumber(draft);
 const invalid=Boolean(draft.trim())&&(number===null||number<min||number>max);
 return <Input label={label} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={draft} suffix={suffix} placeholder={placeholder} error={invalid?errorMessage:undefined} onChange={event=>{const text=event.target.value;setDraft(text);const parsed=parseOnboardingNumber(text);emitted.current=parsed;onChange(parsed);}}/>;
}
