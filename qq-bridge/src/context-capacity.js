// Local working-context budget. This is not a claim about a provider's hard limit.
export function contextMemoryConfig(value={}) {
 value=value&&typeof value==='object'?value:{};
 const number=(key,fallback,min,max)=>value[key]!==null&&Number.isFinite(Number(value[key]))?Math.max(min,Math.min(max,Number(value[key]))):fallback;
 return {enabled:value.enabled!==false,prepareTimeoutMs:Math.round(number('prepareTimeoutMs',4000,50,10000)),
  maxContextTokens:Math.round(number('maxContextTokens',400000,0,10000000)),handoverRatio:number('handoverRatio',.85,.5,.95)};
}

// Provider input/cache buckets describe ONE request, never the lifetime ledger.
export function requestContextTokens(usage) {
 if(!usage||typeof usage!=='object')return null;
 const fields=['inputTokens','cacheReadTokens','cacheWriteTokens','outputTokens'];
 if(!fields.slice(0,3).some(k=>typeof usage[k]==='number'))return null;
 if(fields.some(k=>usage[k]!==undefined&&(!Number.isFinite(usage[k])||usage[k]<0)))return null;
 const total=fields.reduce((n,k)=>n+(usage[k]||0),0);
 return Number.isSafeInteger(total)&&total>0?total:null;
}

export function contextCapacity(sample,config,{pendingChars=0,now=Date.now()}={}) {
 // A completed request remains the last known sample for this same session;
 // an idle conversation does not become small merely because time passed.
 if(!sample||sample.source!=='provider-request-usage'&&now-sample.updatedAt>90000||now<sample.updatedAt)return null;
 const policy=contextMemoryConfig(config),reported=Number(sample.reportedWindowTokens||sample.windowTokens)||0;
 const window=policy.maxContextTokens>0?Math.min(reported||Infinity,policy.maxContextTokens):reported;
 if(!Number.isFinite(window)||window<=0)return null;
 const output=Number(sample.outputTokens)||8192,trigger=Math.floor(window*policy.handoverRatio);
 const projected=sample.usedTokens+output+1024+Math.max(0,Number(pendingChars)||0);
 return {...sample,windowTokens:window,reportedWindowTokens:reported||null,triggerTokens:trigger,
  projectedTokens:projected,ratio:sample.usedTokens/window,shouldHandover:policy.enabled&&sample.usedTokens>0&&projected>=trigger};
}
