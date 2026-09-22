import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabaseClient';
import type {MealHistoryItem} from '@/utils/mealExperience';
const slots=['breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack'];
export function useMealHistory(userId: string | undefined, date: string) {
  const key=`${userId}:${date}`;
  const [state,setState]=useState<{key:string;meals:MealHistoryItem[];error:boolean}>({key:'',meals:[],error:false});
  useEffect(()=>{
    if(!userId)return;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>controller.abort(),10000);
    let active=true;
    void (async()=>{
      try {
        const {data,error}=await supabase.rpc('previous_day_meals',{p_before:date}).abortSignal(controller.signal);
        if(!active)return;
        const meals:MealHistoryItem[]=Array.isArray(data)?data.filter(m=>m && slots.includes(m.slot) && Array.isArray(m.foodIds) && m.foodIds.every((id:unknown)=>typeof id==='string')):[];
        setState({key,meals,error:Boolean(error)});
      }catch{if(active)setState({key,meals:[],error:true});}
      finally{clearTimeout(timer);}
    })();
    return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[userId,date,key]);
  return {meals:state.key===key?state.meals:[],loading:Boolean(userId)&&state.key!==key,error:state.key===key&&state.error};
}
