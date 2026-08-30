(()=>{
'use strict';
if(window.__sbcTicketSettlementV38)return;window.__sbcTicketSettlementV38=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function forceBookScroll(){['#bidBook','#askBook'].forEach(sel=>{const book=$(sel);if(!book)return;book.classList.add('tm39-book-scroll');book.style.setProperty('height','338px','important');book.style.setProperty('max-height','338px','important');book.style.setProperty('overflow-y','scroll','important');book.style.setProperty('overflow-x','hidden','important');book.style.setProperty('overscroll-behavior','contain','important');book.style.setProperty('scrollbar-gutter','stable','important');book.style.setProperty('min-height','0','important');if(book.parentElement)book.parentElement.style.setProperty('min-height','0','important');$$(':scope > *',book).forEach(row=>row.style.setProperty('flex-shrink','0','important'));if(!book.dataset.tm39Wheel){book.dataset.tm39Wheel='1';book.addEventListener('wheel',e=>{if(book.scrollHeight<=book.clientHeight+1)return;const before=book.scrollTop;book.scrollTop+=e.deltaY;if(book.scrollTop!==before){e.preventDefault();e.stopPropagation();}},{passive:false});}})}
function run(){forceBookScroll();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();if(typeof window.addEventListener==='function')window.addEventListener('sbc:exchange-rendered',run);setTimeout(run,350);setTimeout(run,1200);
})();
