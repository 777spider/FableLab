/** Only a bounded, numeric delay crosses from provider headers into the job store. */
export function retryAfterDelay(value:string|null,now=Date.now()):number|undefined {
 if(!value||value.length>100)return;
 const text=value.trim();
 const delay=/^\d+$/.test(text)?Number(text)*1000:
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)?Date.parse(text)-now:NaN;
 if(!Number.isFinite(delay)||delay<0)return;
 return Math.min(delay,15*60*1000);
}
