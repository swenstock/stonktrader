(()=>{
'use strict';
if(window.__sbcTicketRecentV40)return;window.__sbcTicketRecentV40=true;
function retire(){document.getElementById('tm38Recent')?.remove?.();document.getElementById('tm40Recent')?.remove?.();return true;}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',retire,{once:true});else retire();
window.addEventListener?.('sbc:exchange-rendered',retire);
window.addEventListener?.('sbc:exchange-heartbeat',retire);
window.__SBC_TICKET_RECENT_V40={retired:true,retire};
})();