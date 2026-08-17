(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const token=localStorage.getItem('token')||'';
  const TUTORIAL_KEY='sbcDisableViewTutorialV45Web:leaders';
  const state={sources:null,active:null,board:null};
  function authHeaders(){return token?{Authorization:`Bearer ${token}`}:{}}
  async function api(path){const r=await fetch(`/api${path}`,{headers:{...authHeaders()}});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||`Request failed (${r.status})`);return out}
  function fmt(n,d=2){return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function toast(m){const e=$('#toast');e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2500)}

  async function loadSources(){
    state.sources=await api('/leaderboard-v45/sources');renderSources();
    if(!state.active){
      const first=[...(state.sources.satellites||[]),...(state.sources.contests||[])].find(x=>x.status==='open'&&x.fieldSize>0)
        || state.sources.satellites?.find(x=>x.fieldSize>0)
        || state.sources.contests?.find(x=>x.fieldSize>0);
      if(first)await selectSource(first);
    }
  }
  function allSources(){return [...(state.sources?.satellites||[]),...(state.sources?.contests||[])]}
  function renderSources(){
    const list=allSources();
    $('#sourceTabs').innerHTML=list.length?list.map(s=>`<button data-source="${s.type}:${s.id}" class="${state.active?.type===s.type&&state.active?.id===s.id?'active':''} ${s.status==='blocked'?'blocked-source':''}"><b>${esc(s.name||'Main Event')}</b><span>${String(s.status).toUpperCase()} • ${Number(s.fieldSize||0).toLocaleString()} ENTRIES</span><small>${s.type==='satellite'?`${esc(s.tierId||'')} • ${esc(s.priceLevel||'')}`:'MAIN EVENT'}</small></button>`).join(''):'<div class="empty-state">No leaderboard fields exist yet.</div>';
    $$('[data-source]').forEach(b=>b.onclick=()=>{const [type,id]=b.dataset.source.split(':');const s=list.find(x=>x.type===type&&String(x.id)===id);if(s)selectSource(s)});
  }
  async function selectSource(source){
    state.active=source;renderSources();
    try{state.board=await api(`/leaderboard-v45/${source.type}/${source.id}`);renderBoard(true)}catch(e){toast(e.message)}
  }
  async function refreshBoard(){if(!state.active)return;try{state.board=await api(`/leaderboard-v45/${state.active.type}/${state.active.id}`);renderBoard(false)}catch(e){toast(e.message)}}

  function renderBoard(autoJump){
    const b=state.board;if(!b)return;
    $('#leaderType').textContent=b.source.type==='satellite'?`${String(b.source.tierId||'').toUpperCase()} • ${String(b.source.priceLevel||'').toUpperCase()}`:'MAIN EVENT';
    $('#leaderName').textContent=b.source.name||'Leaderboard';
    $('#leaderMeta').textContent=`${Number(b.fieldSize).toLocaleString()} entries • Top ${Number(b.paidPlaces).toLocaleString()} currently in the prize zone${b.source.status==='blocked'?' • SETTLEMENT BLOCKED':''}`;
    $('#sourceStatus').textContent=`${String(b.source.status).toUpperCase()} • ${Number(b.fieldSize).toLocaleString()} ENTRIES`;
    $('#moneyLine').textContent=b.moneyLineRank?`#${b.moneyLineRank} • ${b.moneyLinePL>=0?'+':''}$${fmt(b.moneyLinePL)}`:'—';
    const u=b.userPosition;
    $('#yourRank').textContent=u?`#${u.bestRank} / ${u.fieldSize}`:'—';
    if(!token)$('#rightNow').textContent='SIGN IN TO FIND YOU';
    else if(!u)$('#rightNow').textContent='NO ENTRY IN THIS FIELD';
    else if(u.insidePrizeZone)$('#rightNow').textContent=`${u.spotsInside} SPOTS INSIDE • $${fmt(u.pnlCushion)} CUSHION`;
    else $('#rightNow').textContent=`${u.spotsToMoney} SPOTS OUT • $${fmt(Math.max(0,u.pnlGapToMoney))} TO MONEY LINE`;
    $('#jumpMe').disabled=!u;$('#jumpMoney').disabled=!b.moneyLineRank;

    $('#leaderRows').innerHTML=b.rows.length?b.rows.map(r=>{
      const classes=['leader-row',r.isPrizeZone?'prize-zone':'',r.isMoneyLine?'money-line':'',r.isMine?'you':''].filter(Boolean).join(' ');
      let status=r.isMine?'🎯 YOU':r.isMoneyLine?'💰 MONEY LINE':r.isPrizeZone?'🏆 PRIZE ZONE':'—';
      if(r.prizeType&&r.prizeType!=='none')status=`${status} • ${r.prizeType.replaceAll('_',' ').toUpperCase()}`;
      return `<div id="leader-row-${r.rank}" class="${classes}" data-rank="${r.rank}"><span class="leader-rank">#${r.rank}</span><span class="leader-name"><b>${esc(r.displayName)}</b><small>${r.isMine?'YOUR ENTRY':`ACCOUNT ${r.accountId}`}</small></span><span>${r.entryId?`#${r.entryId}`:'—'}</span><span class="leader-pnl ${Number(r.pl)>=0?'up':'down'}">${Number(r.pl)>=0?'+':''}$${fmt(r.pl)}</span><span class="leader-status ${r.isPrizeZone?'prize':''} ${r.isMine?'you':''}">${status}</span></div>`;
    }).join(''):'<div class="empty-state">No entries yet.</div>';
    $('#scrollFooter').textContent=`Scroll all ${Number(b.fieldSize).toLocaleString()} participants • standings come from the server, not generated prototype rows.`;
    if(autoJump&&u)setTimeout(()=>jumpTo(`leader-row-${u.bestRank}`),120);
  }
  function jumpTo(id){const e=document.getElementById(id);if(!e)return;e.scrollIntoView({behavior:'smooth',block:'center'})}

  // Tutorial: always reappears until explicitly disabled.
  const steps=[
    ['#sourceTabs','PICK A FIELD','Choose any live or recent contest. Each source loads its complete server-calculated standings.'],
    ['#findSummary','KNOW THE MONEY LINE','Your rank, last prize-paying spot and exact distance inside or outside stay pinned above the field.'],
    ['#leaderScroll','SCROLL EVERY PARTICIPANT','This is the entire field, not a seven-row slice. Jump directly to yourself or the money line whenever you want.'],
  ];
  let target=null,oldOutline='';
  function endTut(){if(target)target.style.outline=oldOutline;$('#leadersTutorial')?.remove()}
  function showTut(i=0){endTut();if(i>=steps.length)return;const [sel,title,text]=steps[i],el=$(sel);if(!el)return;target=el;oldOutline=el.style.outline;el.style.outline='3px solid #ffc400';el.scrollIntoView({behavior:'smooth',block:'center'});const p=document.createElement('div');p.id='leadersTutorial';Object.assign(p.style,{position:'fixed',zIndex:500,width:'min(420px,calc(100vw - 36px))',background:'#07121a',border:'1px solid #a07d12',borderRadius:'14px',padding:'18px',boxShadow:'0 20px 80px #000'});p.innerHTML=`<small style="color:#ffc400;font-weight:900">${i+1} OF ${steps.length}</small><h2 style="margin:7px 0">${title}</h2><p style="color:#b5c6ce;font-size:12px">${text}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px"><button id="ltSkip" class="ghost">SKIP FOR NOW</button><button id="ltNext" class="green">${i===steps.length-1?'DONE':'NEXT →'}</button></div><button id="ltDisable" class="danger" style="width:100%;padding:10px;border-radius:8px;margin-top:7px;font-weight:900">DON'T SHOW THIS AGAIN</button>`;document.body.appendChild(p);const r=el.getBoundingClientRect(),safe=innerWidth<620?12:18,w=Math.min(420,innerWidth-safe*2);p.style.width=`${w}px`;let top=r.bottom+12;const h=p.offsetHeight;if(top+h>innerHeight-safe)top=r.top-h-12;if(top<safe)top=safe;p.style.left=`${Math.max(safe,Math.min(innerWidth-w-safe,r.left))}px`;p.style.top=`${top}px`;$('#ltSkip').onclick=endTut;$('#ltNext').onclick=()=>showTut(i+1);$('#ltDisable').onclick=()=>{localStorage.setItem(TUTORIAL_KEY,'1');endTut()}}

  $('#homeBtn').onclick=()=>location.href='./';$('#backBtn').onclick=()=>history.length>1?history.back():location.href='./';$('#refreshSources').onclick=loadSources;$('#refreshBoard').onclick=refreshBoard;$('#jumpMe').onclick=()=>state.board?.userPosition&&jumpTo(`leader-row-${state.board.userPosition.bestRank}`);$('#jumpMoney').onclick=()=>state.board?.moneyLineRank&&jumpTo(`leader-row-${state.board.moneyLineRank}`);$('#helpBtn').onclick=()=>showTut(0);

  (async()=>{try{await loadSources();if(localStorage.getItem(TUTORIAL_KEY)!=='1')setTimeout(()=>showTut(0),500);setInterval(refreshBoard,5000)}catch(e){toast(e.message)}})();
})();
