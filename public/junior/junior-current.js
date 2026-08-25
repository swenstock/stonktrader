(() => {
  'use strict';
  const JR_UNIT = 40000;
  const JR_PER_BROKER = 20;
  const BROKER_COST = 733332;
  const reservePerCycle = (JR_UNIT * JR_PER_BROKER) - BROKER_COST;
  const fmt = n => Number(n || 0).toLocaleString(undefined,{maximumFractionDigits:0});
  function projection(committed){
    committed = Math.max(0, Number(committed)||0);
    const juniors = Math.floor(committed / JR_UNIT);
    return { committed, juniors, brokers:Math.floor(juniors/JR_PER_BROKER), progress:juniors%JR_PER_BROKER, remainder:committed-(juniors*JR_UNIT) };
  }
  async function getCommitted(){
    try{
      const r = await fetch('/api/economics',{cache:'no-store'});
      if(!r.ok) throw new Error();
      const d = await r.json();
      return Number(d?.mainEvent?.committedStonk || 0);
    }catch(e){ return 0; }
  }
  function mount(p){
    if(document.getElementById('sbcJuniorLab')) return;
    const el=document.createElement('aside');
    el.id='sbcJuniorLab';
    el.innerHTML=`
      <div class="jrLabHead"><div><b>JR STONK BROKER PRIZE LAB</b><br><span>Same current SBC build • experimental prize layer only</span></div><button class="jrLabToggle" title="Collapse">−</button></div>
      <div class="jrLabBody">
        <div class="jrLabRule"><strong>20 JR</strong><span>REDEEM FOR</span><strong>1 BROKER</strong></div>
        <div class="jrLabGrid">
          <div class="jrLabMetric"><small>FUNDED JUNIORS</small><b>${p.juniors}</b></div>
          <div class="jrLabMetric"><small>NEXT BROKER</small><b>${p.progress} / 20 JR</b></div>
          <div class="jrLabMetric"><small>FUNDING PER JR</small><b>40,000 STONK</b></div>
          <div class="jrLabMetric"><small>RESERVE / 20 JR</small><b>${fmt(reservePerCycle)} STONK</b></div>
        </div>
        <p class="jrLabText">Win Juniors in eligible contests. Stack 20. Redeem for one Activated Stonk Broker. Redeemed Juniors return to the SBC clearinghouse inventory and can be recycled into future prizes. Tickets remain entry rights; Juniors are prize progress.</p>
        <div class="jrLabActions"><button class="primary" id="jrLabSchedule">PRIZE SCHEDULE</button><a class="secondary" href="/">CURRENT SBC</a></div>
        <div id="jrLabScheduleBody" class="jrLabText" hidden><b>Example funded pools:</b><br>1 JR → 1st: 1 JR<br>5 JR → 3 / 1 / 1<br>10 JR → 4 / 3 / 2 / 1<br>20 JR → 1 Activated Broker<br>25 JR → Broker + 2 / 1 / 1 / 1<br>40 JR → 2 Activated Brokers</div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.jrLabToggle').onclick=()=>{el.classList.toggle('jrCollapsed');el.querySelector('.jrLabToggle').textContent=el.classList.contains('jrCollapsed')?'+':'−';};
    el.querySelector('#jrLabSchedule').onclick=()=>{const b=el.querySelector('#jrLabScheduleBody');b.hidden=!b.hidden;};
  }
  getCommitted().then(v=>mount(projection(v)));
  window.__SBC_JR_PRIZE_LAB={JR_UNIT,JR_PER_BROKER,BROKER_COST,reservePerCycle,projection};
})();
