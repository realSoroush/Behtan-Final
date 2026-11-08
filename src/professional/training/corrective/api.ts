import {supabase} from '@/lib/supabaseClient';
import type{CorrectiveExercise}from'./types';
export async function correctiveRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const r=await supabase.rpc(name,args).abortSignal(AbortSignal.timeout(12000)).retry(false);
 if(r.error)throw Error(r.error.message);return r.data as T;
}
export const correctiveApi={
 list:(org:string)=>correctiveRpc<CorrectiveExercise[]>('pro_corrective_bank',{p_org:org}),
 save:(org:string|null,exercise:CorrectiveExercise,expected:number)=>correctiveRpc<CorrectiveExercise>('pro_save_corrective_exercise',{p_org:org,p_exercise:exercise,p_expected:expected}),
};
