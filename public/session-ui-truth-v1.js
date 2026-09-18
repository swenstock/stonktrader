(()=>{
'use strict';
// Pure, dependency-injected functions -- no implicit window.* reads, so this
// is directly requireable in Node tests with a fake `authority` object.

function formatOpensAt(iso){
  try {
    return 'Starts ' + new Date(iso).toLocaleString([], {
      weekday:'short', hour:'numeric', minute:'2-digit',
      timeZone:'America/New_York', timeZoneName:'short'
    });
  } catch(_) { return 'Starts soon'; }
}

function findLevel(categories, sessionName, tierKey, authority){
  const categoryId = authority.categoryForSession(sessionName);
  const priceLevel = authority.priceForTier(tierKey);
  if(!categoryId || !priceLevel || !categories) return null;
  const cat = categories.find(c=>c.id===categoryId);
  return (cat?.levels||[]).find(l=>l.priceLevel===priceLevel) || null;
}

// Confirmed against server/routes/satellites.js: categories[].levels[].status
// is only ever 'open' or 'pending' for this payload. No CLOSED state -- adding
// one would be UI for a backend state this endpoint cannot emit here.
function sessionUIFromBackend(level){
  if(level && level.status === 'open') {
    return {
      mode:'play', start:'LIVE NOW', button:'PLAY NOW',
      previewTitle:'Live now', previewText:'This session is open — trade now.',
      ends: level.locksAt
        ? new Date(level.locksAt).toLocaleTimeString([], {hour:'numeric', minute:'2-digit', timeZone:'America/New_York'})
        : null
    };
  }
  return {
    mode:'reserve',
    start: level?.opensAt ? formatOpensAt(level.opensAt) : 'Starts soon',
    button:'RESERVE NOW', previewTitle:'Reserve now',
    previewText:'Set your allocation now. It will queue and execute at the next session open.',
    ends:null
  };
}

async function fetchSatelliteLevels(authority){
  try {
    const data = await authority.api('/satellites');
    return data.categories || [];
  } catch (e) {
    console.error('Could not load live satellite state', e);
    return null;
  }
}

const api = { formatOpensAt, findLevel, sessionUIFromBackend, fetchSatelliteLevels };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.SBCSessionUiTruthV1 = api;
})();
