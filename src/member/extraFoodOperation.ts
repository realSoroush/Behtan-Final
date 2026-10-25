const storageKey='behtan.extra.pending.v1';
/** Keep only an opaque digest and operation ID; no food, weight, photo or token is persisted. */
export async function extraFoodOperation(payload:unknown){
 const bytes=new TextEncoder().encode(JSON.stringify(payload));
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 let old:{key:string;id:string}|null=null;
 try{old=JSON.parse(sessionStorage.getItem(storageKey)??'null');}catch{}
 if(old?.key===digest&&/^[0-9a-f-]{36}$/i.test(old.id))return old;
 const next={key:digest,id:crypto.randomUUID()};
 try{sessionStorage.setItem(storageKey,JSON.stringify(next));}catch{throw Error('برای ثبت مطمئن غذا، ذخیره‌سازی این مرورگر باید فعال باشد.');}
 return next;
}
export function finishExtraFoodOperation(id:string){
 try{const old=JSON.parse(sessionStorage.getItem(storageKey)??'null');if(old?.id===id)sessionStorage.removeItem(storageKey);}catch{}
}
