(() => {
  'use strict';
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
