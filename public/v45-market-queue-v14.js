(()=>{
  'use strict';
  if(window.__sbcMarketQueueFetchV14)return;
  window.__sbcMarketQueueFetchV14=true;
  const originalFetch=window.fetch;
  window.fetch=async function(input,init){
    const response=await originalFetch.call(this,input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      const method=String(init?.method||input?.method||'GET').toUpperCase();
      if(method==='POST'&&/\/api\/portfolios\/\d+\/trades(?:\?|$)/.test(url)){
        let requestBody={};
        try{requestBody=typeof init?.body==='string'?JSON.parse(init.body):{};}catch(_){requestBody={};}
        if(!requestBody.basketOrder){
          response.clone().json().then(data=>{
            if(data?.queued){
              setTimeout(()=>window.alert(data.message||'The market is currently closed. Your order is in the queue.'),0);
            }
          }).catch(()=>{});
        }
      }
    }catch(_){}
    return response;
  };
})();
