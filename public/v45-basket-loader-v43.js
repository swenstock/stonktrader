(()=>{
'use strict';
if(window.__sbcBasketLoaderV43)return;window.__sbcBasketLoaderV43=true;
const nativeFetch=window.fetch.bind(window);
const FALLBACK=`AAPL|Apple Inc.;MSFT|Microsoft Corp.;NVDA|NVIDIA Corp.;TSLA|Tesla Inc.;AMZN|Amazon.com Inc.;GOOGL|Alphabet Inc.;HOOD|Robinhood Markets;COIN|Coinbase Global;JPM|JPMorgan Chase;WMT|Walmart Inc.;META|Meta Platforms;NFLX|Netflix Inc.;ORCL|Oracle Corp.;ADBE|Adobe Inc.;AVGO|Broadcom Inc.;CRM|Salesforce Inc.;INTC|Intel Corp.;AMD|Advanced Micro Devices;QCOM|Qualcomm Inc.;CSCO|Cisco Systems;IBM|IBM Corp.;UBER|Uber Technologies;PYPL|PayPal Holdings;SNOW|Snowflake Inc.;PLTR|Palantir Technologies;MSTR|Strategy Inc.;BAC|Bank of America;WFC|Wells Fargo & Co.;GS|Goldman Sachs Group;MS|Morgan Stanley;V|Visa Inc.;MA|Mastercard Inc.;AXP|American Express;JNJ|Johnson & Johnson;PFE|Pfizer Inc.;UNH|UnitedHealth Group;ABBV|AbbVie Inc.;MRK|Merck & Co.;LLY|Eli Lilly and Co.;KO|Coca-Cola Co.;PEP|PepsiCo Inc.;MCD|McDonald's Corp.;SBUX|Starbucks Corp.;NKE|Nike Inc.;DIS|Walt Disney Co.;COST|Costco Wholesale;TGT|Target Corp.;HD|Home Depot Inc.;LOW|Lowe's Companies;XOM|Exxon Mobil Corp.;CVX|Chevron Corp.;BA|Boeing Co.;CAT|Caterpillar Inc.;GE|General Electric;F|Ford Motor Co.;GM|General Motors;TSM|Taiwan Semiconductor Manufacturing;T|AT&T Inc.;VZ|Verizon Communications`.split(';').map(x=>{const [symbol,name]=x.split('|');return{symbol,name};});
const FALLBACK_SYMBOLS=new Set(FALLBACK.map(x=>x.symbol));
function localUniverse(){
  try{
    if(typeof STOCKS!=='undefined'&&STOCKS&&typeof STOCKS==='object'){
      return Object.entries(STOCKS).map(([symbol,s])=>({symbol:String(symbol).toUpperCase(),name:s?.name||s?.company||String(symbol).toUpperCase(),exchange:s?.exchange||'',currency:s?.currency||'USD'})).filter(x=>x.symbol);
    }
  }catch(_){}
  return [];
}
function response(rows,source){return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json','X-SBC-Basket-Universe':source}});}
function isUniverseRequest(input,init){
  const url=typeof input==='string'?input:String(input?.url||'');
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  return method==='GET'&&/(^|\/)api\/quotes\/symbols(?:[?#]|$)/.test(url);
}
async function serverFirst(input,init){
  let timeout;
  try{
    const server=await Promise.race([
      nativeFetch(input,init).then(async r=>{
        if(!r.ok)throw new Error(`universe-http-${r.status}`);
        const rows=await r.clone().json().catch(()=>null);
        if(!Array.isArray(rows)||rows.length<20)throw new Error('universe-too-small');
        return r;
      }),
      new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('fallback-timeout')),1800);})
    ]);
    clearTimeout(timeout);return server;
  }catch(err){
    clearTimeout(timeout);
    const source=String(err?.message||'').includes('fallback-timeout')?'fallback-timeout':'fallback-error';
    return response(FALLBACK,source);
  }
}
function sanitizeSavedBasket(){
  try{
    const key='sbcLastBasketV45',saved=JSON.parse(localStorage.getItem(key)||'null');
    if(!Array.isArray(saved?.rows))return;
    const next=saved.rows.filter(x=>FALLBACK_SYMBOLS.has(String(x?.symbol||'').toUpperCase()));
    if(next.length!==saved.rows.length)localStorage.setItem(key,JSON.stringify({...saved,rows:next,sanitizedAt:Date.now()}));
  }catch(_){}
}
window.fetch=function(input,init){
  if(!isUniverseRequest(input,init))return nativeFetch(input,init);
  return serverFirst(input,init);
};
window.SBCBasketUniverseV47={fallback:FALLBACK,localUniverse,sanitizeSavedBasket};
document.addEventListener('click',e=>{if(e.target.closest?.('[data-load-basket-v45]'))sanitizeSavedBasket();},true);
})();
