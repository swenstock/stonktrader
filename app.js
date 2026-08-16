// Presentation-only interaction shell.
// Claude should replace these handlers with the existing router / app state.

document.querySelectorAll('[data-route]').forEach(btn => {
  btn.addEventListener('click', () => {
    const route = btn.dataset.route;
    if (route === 'trading-floor') document.querySelector('#trading-floor')?.scrollIntoView({behavior:'smooth'});
    if (route === 'exchange') alert('Hook this button into the existing Ticket Exchange route.');
  });
});

document.querySelectorAll('[data-tier]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tier = btn.dataset.tier;
    alert(`UI handoff: route to the ${tier} lobby and show only that tier's fields across scheduled sessions.`);
  });
});

// Example integration API Claude can call from real backend state.
window.SBC_UI = {
  setWalletBalance(stonk){ document.querySelector('#walletBalance').textContent = Number(stonk).toLocaleString(); },
  setMainEventProgress(percent){
    const p = Math.max(0,Math.min(100,Number(percent)||0));
    document.querySelector('#progressPct').textContent = `${p.toFixed(p % 1 ? 1 : 0)}%`;
    document.querySelector('.progress-bar').style.width = `${p}%`;
  },
  setTicketQuote({ask,bid,last}){
    const el = document.querySelector('#liveQuote');
    if(!el) return;
    el.innerHTML = `<span>MAIN EVENT TICKET</span><b>ASK ${Number(ask).toLocaleString()}</b><b>BID ${Number(bid).toLocaleString()}</b><b>LAST ${Number(last).toLocaleString()}</b>`;
  }
};
