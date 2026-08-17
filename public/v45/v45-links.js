(() => {
  'use strict';

  const nav = document.querySelector('.topbar nav');
  if (nav && !nav.querySelector('[data-v45-leaders]')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.v45Leaders = '1';
    btn.textContent = 'LEADERBOARDS';
    btn.addEventListener('click', () => { window.location.href = './leaders.html'; });
    nav.appendChild(btn);
  }

  document.addEventListener('click', (event) => {
    const card = event.target.closest?.('[data-portfolio]');
    if (!card) return;
    const id = card.dataset.portfolio;
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = `./trade.html?id=${encodeURIComponent(id)}`;
  }, true);
})();
