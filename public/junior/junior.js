(() => {
  'use strict';

  const JR_UNIT_STONK = 40000;
  const JR_PER_BROKER = 20;
  const ACTIVATED_BROKER_STONK = 733332;
  const CUSHION_PER_JR = JR_UNIT_STONK - (ACTIVATED_BROKER_STONK / JR_PER_BROKER);

  function juniorProjection(committedStonk) {
    const committed = Math.max(0, Number(committedStonk) || 0);
    const fundedJuniors = Math.floor(committed / JR_UNIT_STONK);
    const fullBrokers = Math.floor(fundedJuniors / JR_PER_BROKER);
    const juniorProgress = fundedJuniors % JR_PER_BROKER;
    const unallocatedStonk = committed - (fundedJuniors * JR_UNIT_STONK);
    const reserveCushionStonk = fundedJuniors * CUSHION_PER_JR;
    const nextJuniorNeedsStonk = unallocatedStonk === 0 ? JR_UNIT_STONK : JR_UNIT_STONK - unallocatedStonk;
    return {
      committed,
      fundedJuniors,
      fullBrokers,
      juniorProgress,
      unallocatedStonk,
      reserveCushionStonk,
      nextJuniorNeedsStonk,
      meterPercent: fundedJuniors > 0 && juniorProgress === 0
        ? 100
        : (juniorProgress / JR_PER_BROKER) * 100,
    };
  }

  function parseStonk(text) {
    const n = Number(String(text || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function projectionLabel(p) {
    if (!p.fullBrokers) return `${p.fundedJuniors} / ${JR_PER_BROKER} JR`;
    if (!p.juniorProgress) return `${p.fullBrokers} BROKER${p.fullBrokers === 1 ? '' : 'S'} FUNDED`;
    return `${p.fullBrokers} BROKER${p.fullBrokers === 1 ? '' : 'S'} + ${p.juniorProgress} JR`;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JR_UNIT_STONK, JR_PER_BROKER, ACTIVATED_BROKER_STONK, CUSHION_PER_JR, juniorProjection, projectionLabel, parseStonk };
    return;
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function syncFundingCard() {
    const reserveEl = document.querySelector('#fundReserve');
    if (!reserveEl) return;
    const p = juniorProjection(parseStonk(reserveEl.textContent));
    const pct = document.querySelector('#fundPct');
    const fill = document.querySelector('#fundFill');
    const current = document.querySelector('#fundCurrent');
    const target = document.querySelector('#fundTarget');
    const full = document.querySelector('#jrFullBrokers');
    const next = document.querySelector('#jrNextBroker');
    const note = document.querySelector('#jrReserveNote');
    setText(pct, projectionLabel(p));
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, p.meterPercent))}%`;
    setText(current, p.fullBrokers
      ? `${p.fullBrokers} FULL + ${p.juniorProgress} JR FUNDED`
      : `${p.fundedJuniors} JR FUNDED`);
    setText(target, p.fundedJuniors
      ? `Next Jr: ${fmt(p.nextJuniorNeedsStonk)} STONK`
      : '20 JR = 1 ACTIVATED BROKER');
    setText(full, fmt(p.fullBrokers));
    setText(next, `${p.juniorProgress} / ${JR_PER_BROKER}`);
    setText(note, `Funded Jr cushion: ${fmt(p.reserveCushionStonk)} STONK • Unallocated toward next Jr: ${fmt(p.unallocatedStonk)} STONK`);
  }

  function distinguishJuniorTicket() {
    const btn = document.querySelector('[data-ticket-type="junior"]');
    if (btn && btn.dataset.jrRelabeled !== '1') {
      btn.dataset.jrRelabeled = '1';
      const text = [...btn.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
      if (text) text.nodeValue = 'JR EVENT TICKET';
      else btn.prepend(document.createTextNode('JR EVENT TICKET'));
      btn.title = 'Existing Junior event-entry ticket — separate from Junior Broker prize collectibles in this experiment.';
    }
    const bookType = document.querySelector('#bookType');
    if (bookType?.textContent.trim() === 'JR. STONKBROKER') setText(bookType, 'JR EVENT TICKET');
  }

  function decorateFloor() {
    document.querySelectorAll('#floorGrid .floor-card').forEach(card => {
      if (card.querySelector('.jr-prize-chip')) return;
      const priceText = card.querySelector('.price')?.textContent || '';
      const isFree = /FREE/i.test(priceText);
      const chip = document.createElement('div');
      chip.className = 'jr-prize-chip';
      chip.innerHTML = isFree
        ? '<b>JR PATH</b><span>Freerolls can qualify players upward</span>'
        : '<b>JR PRIZE LADDER</b><span>Eligible paid rooms can fund 40K Junior units</span>';
      card.appendChild(chip);
    });
  }

  function addClearinghouseNote() {
    const view = document.querySelector('#view-exchange .page-head');
    if (!view || document.querySelector('#jrClearingNote')) return;
    const note = document.createElement('div');
    note.id = 'jrClearingNote';
    note.className = 'jr-clearing-note';
    note.textContent = 'Concept separation: tickets remain transferable entry rights. Junior Broker prize collectibles would be cleared/recycled by SBC and are not activated in the production exchange yet.';
    view.insertAdjacentElement('afterend', note);
  }

  function installLinks() {
    const nav = document.querySelector('.topbar nav');
    if (nav && !nav.querySelector('[data-jr-leaders]')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.jrLeaders = '1';
      btn.textContent = 'LEADERBOARDS';
      btn.addEventListener('click', () => { window.location.href = '../v45/leaders.html'; });
      nav.appendChild(btn);
    }
    document.addEventListener('click', event => {
      const card = event.target.closest?.('[data-portfolio]');
      const id = card?.dataset.portfolio;
      if (!id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = `../v45/trade.html?id=${encodeURIComponent(id)}`;
    }, true);
  }

  let syncQueued = false;
  function syncAll() {
    syncQueued = false;
    syncFundingCard();
    distinguishJuniorTicket();
    decorateFloor();
    addClearinghouseNote();
  }
  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(syncAll);
  }

  installLinks();
  syncAll();
  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  window.__sbcJuniorBrokerExperiment = { juniorProjection, projectionLabel, syncAll };
})();
