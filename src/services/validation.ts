export function isValidLocalDate(value:string):boolean{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const[y,m,d]=value.split("-").map(Number);const date=new Date(y!,m!-1,d!);return date.getFullYear()===y&&date.getMonth()===m!-1&&date.getDate()===d;}
export function isValidTime(value:string):boolean{if(!/^\d{2}:\d{2}$/.test(value))return false;const[h,m]=value.split(":").map(Number);return h!>=0&&h!<=23&&m!>=0&&m!<=59;}
export function formatLocalDate(date:Date):string{return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
export function localToday():string{return formatLocalDate(new Date());}
export function requireText(value:string,label:string):void{if(!value.trim())throw new Error(`${label} is required`);}
