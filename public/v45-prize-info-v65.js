(()=>{
'use strict';
if(window.__sbcPrizeInfoV65)return;window.__sbcPrizeInfoV65=true;
const $=(s,r=document)=>r.querySelector(s);
function build(){
  const how=$('#how');if(!how||$('.sbc-prize-info-v65',how))return;
  const sec=document.createElement('section');sec.className='sbc-prize-info-v65';
  sec.innerHTML=`
    <header><small>IMPORTANT INFO</small><h2>PRIZE FUNDING & PAYOUTS</h2><p>Paid contests use a transparent 15% / 85% split. The top 10% are paid from the bottom up so every qualifying finisher is protected before higher places are upgraded.</p></header>
    <div class="sbc-prize-grid-v65">
      <article><h3>1. ENTRY PRICES</h3><div class="sbc-tier-row-v65"><b>Runner</b><span>30 STONK</span></div><div class="sbc-tier-row-v65"><b>Clerk</b><span>100 STONK</span></div><div class="sbc-tier-row-v65"><b>Trader</b><span>300 STONK</span></div><div class="sbc-tier-row-v65"><b>Jr. StonkBroker</b><span>1,000 STONK</span></div></article>
      <article><h3>2. TOP 10% BASELINE — BOTTOM UP</h3><p>First reserve the baseline award for every top-10% finisher, starting with the lowest qualifying place and working upward.</p><div class="sbc-tier-row-v65"><b>Free Roll</b><span>2 Runner tickets</span></div><div class="sbc-tier-row-v65"><b>Runner</b><span>2 Runner tickets</span></div><div class="sbc-tier-row-v65"><b>Clerk</b><span>2 Runner tickets</span></div><div class="sbc-tier-row-v65"><b>Trader</b><span>2 Clerk tickets</span></div><div class="sbc-tier-row-v65"><b>Jr. StonkBroker</b><span>2 Trader tickets</span></div></article>
      <article><h3>3. MAIN EVENT UPGRADES</h3><p>After every top-10% baseline prize is covered, remaining prize value funds Main Event seats for the highest finishers. A Main Event ticket is issued only when its published funding requirement is fully covered — never partially funded.</p><p>If the pool cannot fully fund another Main Event seat, the remaining top-10% finishers keep their baseline lower-tier tickets.</p></article>
      <article><h3>4. THE MATH</h3><p><b>Paid entries × entry price = gross handle.</b></p><p><b>Gross handle × 85% = prize economics.</b></p><p>The 15% remainder is SBC rake. Prize economics first cover top-10% baseline awards; only the surplus can create Main Event upgrades.</p></article>
      <article class="sbc-main-event-v65"><h3>MAIN EVENT PRIZE STRUCTURE</h3><p><b>1 Activated StonkBroker requires 733,332 STONK:</b> 666,666 STONK for the StonkBroker + 66,666 STONK activation.</p><div class="sbc-tier-row-v65"><b>0 Brokers fully funded</b><span>1st wins the full 85% prize pool</span></div><div class="sbc-tier-row-v65"><b>1 Broker funded</b><span>1st: Activated StonkBroker • 2nd: remainder</span></div><div class="sbc-tier-row-v65"><b>2 Brokers funded</b><span>1st–2nd: Activated StonkBrokers • 3rd: remainder</span></div><div class="sbc-tier-row-v65"><b>N Brokers funded</b><span>Top N win Brokers • next finisher gets remainder</span></div></article>
      <article><h3>FAIR & TRANSPARENT</h3><p>Prize math is determined by the locked entry count and published before trading begins. Tickets are transferable. Main Event entry is earned through competition or acquired from another player — SBC does not sell Main Event entry directly.</p></article>
    </div>`;
  const steps=$('.steps',how);if(steps)steps.after(sec);else how.appendChild(sec);
}
function start(){build();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(build,120)}).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();