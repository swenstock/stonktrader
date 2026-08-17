(()=>{
  function pct(v){const n=parseFloat(String(v||'').replace('%',''));return Number.isFinite(n)?n:0;}
  function num(v){const n=parseFloat(String(v||'').replace(/[$,]/g,''));return Number.isFinite(n)?n:0;}

  function buildContext(tab,id,isLive){
    try{
      const c=(tab==='live'?MC_LIVE:MC_ARCHIVE).find(x=>x.id===id);
      if(!c)return null;
      const entries=entriesFor(tab,id);
      const idx=MC_SELECTED_ENTRY[`${tab}-${id}`] ?? 0;
      const e=entries[idx]||entries[0]||{tier:'free',num:1};
      return {c,e,idx,ctx:{session:c.name,tier:e.tier||'free',mode:isLive?'live':'reserve',returnView:'my',entry:e.num||1,degen:sessionIsDegen(c.name),race:sessionIsRace(c.name)}};
    }catch(e){return null;}
  }

  function shouldReplaceDemo(p){
    if(!p)return true;
    if(p.__myContestSynced)return false;
    const h=Array.isArray(p.history)?p.history:[];
    return h.length<=1 && (!h[0] || h[0].detail==='Opening allocation');
  }

  function seedFromContest(bundle){
    const {c,e,ctx}=bundle;
    if(typeof portfolioKey!=='function' || typeof PORTFOLIOS==='undefined')return;
    const key=portfolioKey(ctx);
    const existing=PORTFOLIOS[key];
    if(!shouldReplaceDemo(existing))return;

    if(ctx.mode==='reserve'){
      PORTFOLIOS[key]={starting:100000,cash:100000,holdings:{},queued:[],history:[],rank:'QUEUED',prize:c.prize||'Pool forming',__myContestSynced:true};
      return;
    }

    const holdings={};
    let cashPct=0;
    (c.positions||[]).forEach(row=>{
      const sym=row?.[0];
      if(!sym)return;
      if(sym==='Cash'){cashPct=pct(row[1]);return;}
      if(sym==='Queued portfolio')return;
      const alloc=pct(row[1]);
      const avg=num(row[2]);
      const px=(typeof STOCKS!=='undefined' && STOCKS[sym]?.price) || avg || 1;
      const shares=Math.max(0,(100000*(alloc/100))/px);
      holdings[sym]={shares,avg:avg||px};
    });
    const investedPct=Object.keys(holdings).length ? (100-cashPct) : 0;
    const cash=cashPct?100000*(cashPct/100):Math.max(0,100000*(1-investedPct/100));
    PORTFOLIOS[key]={
      starting:100000,
      cash,
      holdings,
      queued:[],
      history:[{side:'SYNC',symbol:Object.keys(holdings)[0]||'CASH',detail:'Loaded selected My Contests entry',time:'Now'}],
      rank:e.rank||c.rank,
      prize:c.prize||'—',
      __myContestSynced:true
    };
  }

  function install(){
    if(typeof window.openSelectedMCPortfolio!=='function' || window.openSelectedMCPortfolio.__entrySyncV7)return;
    const original=window.openSelectedMCPortfolio;
    function synced(tab,id,isLive){
      const bundle=buildContext(tab,id,isLive);
      if(bundle)seedFromContest(bundle);
      return original.apply(this,arguments);
    }
    synced.__entrySyncV7=true;
    window.openSelectedMCPortfolio=synced;
  }

  function start(){install();setTimeout(install,300);setTimeout(install,1200);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
