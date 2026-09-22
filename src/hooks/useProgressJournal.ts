import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabaseClient';
import type {ProgressEntry} from '@/utils/progressJournal';
export function useProgressJournal(userId:string|undefined,date:string) {
  const key=`${userId}:${date}`;
  const currentKey=useRef(key);currentKey.current=key;
  const savingRef=useRef(false);
  const [retry,setRetry]=useState(0);
  const [state,setState]=useState<{key:string;entries:ProgressEntry[];error:string|null}>({key:'',entries:[],error:null});
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if(!userId)return;
    let active=true;const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),12000);
    void(async()=>{
      try {
        const {data,error}=await supabase.from('user_progress_entries').select('entry_date,weight_kg,adherence,hunger,difficulty').eq('user_id',userId).lte('entry_date',date).order('entry_date',{ascending:false}).limit(90).abortSignal(controller.signal);
        if(active)setState({key,entries:error?[]:(data??[]) as ProgressEntry[],error:error?'دریافت روند انجام نشد. دوباره تلاش کن.':null});
      }catch{if(active)setState({key,entries:[],error:'دریافت روند انجام نشد. دوباره تلاش کن.'});}
      finally{clearTimeout(timeout);}
    })();
    return()=>{active=false;controller.abort();clearTimeout(timeout);};
  },[key,userId,date,retry]);
  const save=useCallback(async(entry:ProgressEntry)=>{
    if(!userId||state.key!==key||state.error)throw Error('ابتدا اطلاعات قبلی را دریافت کن.');
    if(savingRef.current)throw Error('ثبت قبلی در حال انجام است.');
    savingRef.current=true;setSaving(true);
    const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),12000);
    try{
      const {data,error}=await supabase.from('user_progress_entries').upsert({user_id:userId,...entry},{onConflict:'user_id,entry_date'}).select('entry_date,weight_kg,adherence,hunger,difficulty').abortSignal(controller.signal).single();
      if(error||!data)throw Error('ثبت انجام نشد؛ اطلاعاتت در فرم حفظ شده. دوباره تلاش کن.');
      if(currentKey.current===key)setState(s=>({...s,entries:[data as ProgressEntry,...s.entries.filter(e=>e.entry_date!==entry.entry_date)].sort((a,b)=>b.entry_date.localeCompare(a.entry_date)).slice(0,90)}));
    }finally{clearTimeout(timeout);savingRef.current=false;setSaving(false);}
  },[userId,key,state.key,state.error]);
  return {entries:state.key===key?state.entries:[],loading:state.key!==key,error:state.key===key?state.error:null,saving,save,retry:()=>setRetry(n=>n+1)};
}
