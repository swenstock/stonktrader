(()=>{
'use strict';
if(window.__sbcBasketLoaderV43)return;window.__sbcBasketLoaderV43=true;
const nativeFetch=window.fetch.bind(window);
const FALLBACK=`AAPL|Apple Inc.;MSFT|Microsoft Corp.;NVDA|NVIDIA Corp.;TSLA|Tesla Inc.;AMZN|Amazon.com Inc.;GOOGL|Alphabet Inc.;HOOD|Robinhood Markets;COIN|Coinbase Global;JPM|JPMorgan Chase;WMT|Walmart Inc.;META|Meta Platforms;NFLX|Netflix Inc.;ORCL|Oracle Corp.;ADBE|Adobe Inc.;CRM|Salesforce Inc.;INTC|Intel Corp.;AMD|Advanced Micro Devices;QCOM|Qualcomm Inc.;CSCO|Cisco Systems;IBM|IBM Corp.;UBER|Uber Technologies;PYPL|PayPal Holdings;SNOW|Snowflake Inc.;PLTR|Palantir Technologies;BAC|Bank of America;WFC|Wells Fargo & Co.;GS|Goldman Sachs Group;MS|Morgan Stanley;V|Visa Inc.;MA|Mastercard Inc.;AXP|American Express;JNJ|Johnson & Johnson;PFE|Pfizer Inc.;UNH|UnitedHealth Group;ABBV|AbbVie Inc.;MRK|Merck & Co.;LLY|Eli Lilly and Co.;KO|Coca-Cola Co.;PEP|PepsiCo Inc.;MCD|McDonald's Corp.;SBUX|Starbucks Corp.;NKE|Nike Inc.;DIS|Walt Disney Co.;COST|Costco Wholesale;TGT|Target Corp.;HD|Home Depot Inc.;LOW|Lowe's Companies;XOM|Exxon Mobil Corp.;CVX|Chevron Corp.;BA|Boeing Co.;CAT|Caterpillar Inc.;GE|General Electric;F|Ford Motor Co.;GM|General Motors;T|AT&T Inc.;VZ|Verizon Communications`.split(';').map(x=>{const [symbol,name]=x.split('|');return{symbol,name};});
function localUniverse(){
  try{
    if(typeof STOCKS!=='undefined'&&STOCKS&&typeof STOCKS==='object'){
      const rows=Object.entries(STOCKS).map(([symbol,s])=>({symbol:String(symbol).toUpperCase(),name:s?.name||s?.company||String(symbol).toUpperCase(),exchange:s?.exchange||'',currency:s?.currency||'USD'})).filter(x=>x.symbol);
      if(rows.length)return rows;
    }
  }catch(_){}
  return FALLBACK;
}
function response(rows,source){return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json','X-SBC-Basket-Universe':source}});}
function isUniverseRequest(input,init){
  const url=typeof input==='string'?input:String(input?.url||'');
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  return method==='GET'&&/(^|\/)api\/quotes\/symbols(?:[?#]|$)/.test(url);
}
window.fetch=function(input,init){
  if(!isUniverseRequest(input,init))return nativeFetch(input,init);
  const rows=localUniverse();
  if(rows.length)return Promise.resolve(response(rows,'native-v45'));
  return Promise.race([
    nativeFetch(input,init),
    new Promise(resolve=>setTimeout(()=>resolve(response(FALLBACK,'fallback-timeout')),1500))
  ]).catch(()=>response(FALLBACK,'fallback-error'));
};
})();
