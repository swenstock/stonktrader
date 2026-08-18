(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let symbolMap=null,loading=null;

  async function loadSymbols(){
    if(symbolMap)return symbolMap;
    if(loading)return loading;
    loading=fetch('/api/quick-tickets/symbols').then(r=>r.json()).then(rows=>{
      symbolMap=new Map((Array.isArray(rows)?rows:[]).map(x=>[String(x.symbol||'').toUpperCase(),x.name||'']));
      return symbolMap;
    }).catch(()=>new Map());
    return loading;
  }

  function relabel(){
    const launch=$('.quick-ticket-launch');
    if(launch)launch.innerHTML='<span>⚡</span> CREATE A BASKET';
    const title=$('#qtTitle');
    if(title)title.textContent='⚡ CREATE A BASKET — EQUAL WEIGHT PORTFOLIO';
    const build=$('#qtBuild'); if(build)build.textContent='CREATE BASKET';
    const review=$('#qtReview'); if(review)review.textContent='REVIEW BASKET →';
    const submit=$('#qtSubmit'); if(submit&&!/BUYING|CHECKING/i.test(submit.textContent))submit.textContent='SUBMIT BASKET';
    const newList=$('#qtNewList'); if(newList)newList.textContent='+ NEW BASKET';
    const head=$('.qt-head p'); if(head)head.textContent='Build an equal-weight basket fast. Every selected stock receives the same target weight.';
    $$('.qt-count-step p,.qt-editor-top p,.qt-saved p').forEach(el=>{
      el.innerHTML=el.innerHTML.replace(/Quick Ticket/gi,'Create A Basket').replace(/quick ticket/gi,'basket');
    });
  }

  async function validateInput(inp){
    const sym=String(inp.value||'').trim().toUpperCase();
    inp.value=sym;
    const row=inp.closest('.qt-row'),status=row?.querySelector('.qt-company');
    if(!status)return;
    status.classList.remove('qt-valid','qt-invalid');
    if(!sym){status.textContent='Waiting for symbol';return;}
    const map=await loadSymbols();
    if(map.has(sym)){
      status.textContent=map.get(sym)||'Available in SBC';
      status.classList.add('qt-valid');
    }else{
      status.textContent=`${sym} — NOT AVAILABLE IN SBC`;
      status.classList.add('qt-invalid');
    }
  }

  function bindInputs(){
    $$('.qt-symbol').forEach(inp=>{
      if(inp.dataset.basketStage1Bound)return;
      inp.dataset.basketStage1Bound='1';
      let timer;
      inp.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>validateInput(inp),180);});
      inp.addEventListener('blur',()=>validateInput(inp));
      if(inp.value)validateInput(inp);
    });
  }

  function style(){
    if($('#basketStage1Style'))return;
    const s=document.createElement('style');s.id='basketStage1Style';
    s.textContent='.qt-company.qt-invalid{color:#ff786e!important;font-weight:1000!important}.qt-company.qt-valid{color:#70d889!important}.qt-row:has(.qt-company.qt-invalid) .qt-symbol{border-color:#823d37!important}.qt-row:has(.qt-company.qt-valid) .qt-symbol{border-color:#386f4b!important}';
    document.head.appendChild(s);
  }

  function run(){style();relabel();bindInputs();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,40);}).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(run,300);setTimeout(run,1000);
})();
