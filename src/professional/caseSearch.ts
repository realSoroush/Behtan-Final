export function normalizeCaseSearch(value:string):string {
 const query=value.trim().replace(/[۰-۹٠-٩]/g,n=>String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(n)%10));
 if(!/^[+\d\s()-]+$/.test(query))return query;
 const digits=query.replace(/\D/g,'');
 return digits.startsWith('0098')?digits.slice(2):digits.startsWith('09')?'98'+digits.slice(1):digits;
}
