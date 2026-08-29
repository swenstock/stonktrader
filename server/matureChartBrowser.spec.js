const {test,expect}=require('@playwright/test');
const path=require('path');

function barsFor(symbol,interval){
  const base={AAPL:190,TSLA:320,NVDA:180}[symbol]||100;
  const step=interval==='1D'?86400:interval==='1h'?3600:interval==='15m'?900:interval==='5m'?300:60;
  const start=Math.floor(Date.parse('2026-08-28T14:30:00Z')/1000)-step*119;
  const rows=[];let last=base;
  for(let i=0;i<120;i++){
    const drift=Math.sin(i/5)*1.2+(i%7-3)*.13;
    const open=last,close=Math.max(1,open+drift),high=Math.max(open,close)+.8,low=Math.min(open,close)-.7;
    rows.push({time:new Date((start+i*step)*1000).toISOString(),open,high,low,close,volume:100000+i*2300});last=close;
  }
  return rows;
}

test('mature chart renders, pans, zooms, preserves viewport, and follows canonical symbol',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/api/quotes/bars**',async route=>{
    const u=new URL(route.request().url()),symbol=(u.searchParams.get('symbol')||'AAPL').toUpperCase(),interval=u.searchParams.get('interval')||'5m';
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({bars:barsFor(symbol,interval)})});
  });
  await page.setViewportSize({width:1280,height:820});
  await page.setContent(`<!doctype html><html><head><base href="http://sbc.test/"><style>body{margin:0;background:#071019}.symbol-chart{position:relative;width:920px;height:520px}.chart-trade-card{width:920px}.native-chart{width:920px;height:520px}</style></head><body>
    <select id="tradeSymbol"><option>AAPL</option><option>TSLA</option><option>NVDA</option></select>
    <div id="view-portfolio"><div class="chart-trade-card">
      <div class="chart-workstation-v1"><button data-cw-time="5m" class="active">5m</button><button data-cw-time="15m">15m</button></div>
      <div class="symbol-chart"><svg class="native-chart" viewBox="0 0 920 520"></svg></div>
    </div></div>
    <script>
      window.refreshTradeTicket=()=>{window.__oeSymbol=document.getElementById('tradeSymbol').value};
      window.renderSymbolChart=()=>{};
      window.selectChartSymbol=function(sym){document.getElementById('tradeSymbol').value=String(sym).toUpperCase();refreshTradeTicket();renderSymbolChart();};
      window.proposedOrder=()=>({sym:document.getElementById('tradeSymbol').value});
    </script>
  </body></html>`);
  await page.addStyleTag({path:path.resolve('public/v45-mature-chart-owner-v1.css')});
  await page.addScriptTag({path:path.resolve('public/vendor/lightweight-charts-4.2.3.js')});
  await page.addScriptTag({path:path.resolve('public/v45-active-symbol-sync-v1.js')});
  await page.addScriptTag({path:path.resolve('public/v45-mature-chart-owner-v1.js')});

  await expect.poll(()=>page.evaluate(()=>!!document.querySelector('.sbc-mature-chart-host-v1.is-ready'))).toBe(true);
  const rendered=await page.evaluate(()=>[...document.querySelectorAll('.sbc-mature-chart-host-v1 canvas')].some(c=>{try{return c.toDataURL().length>1000}catch{return false}}));
  expect(rendered).toBe(true);

  const beforeDrag=await page.evaluate(()=>window.SBCMatureChartV1.state.chart.timeScale().getVisibleLogicalRange());
  const box=await page.locator('.sbc-mature-chart-host-v1').boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x+box.width*.48,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.68,box.y+box.height*.45,{steps:8});await page.mouse.up();await page.waitForTimeout(120);
  const afterDrag=await page.evaluate(()=>window.SBCMatureChartV1.state.chart.timeScale().getVisibleLogicalRange());
  expect(Math.abs(afterDrag.from-beforeDrag.from)).toBeGreaterThan(.5);
  await page.waitForTimeout(150);
  const afterRelease=await page.evaluate(()=>window.SBCMatureChartV1.state.chart.timeScale().getVisibleLogicalRange());
  expect(Math.abs(afterRelease.from-afterDrag.from)).toBeLessThan(.05);

  const spanBefore=afterRelease.to-afterRelease.from;
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.42);await page.mouse.wheel(0,180);await page.waitForTimeout(120);
  const afterWheel=await page.evaluate(()=>window.SBCMatureChartV1.state.chart.timeScale().getVisibleLogicalRange());
  expect(Math.abs((afterWheel.to-afterWheel.from)-spanBefore)).toBeGreaterThan(.2);

  const timeBeforePrice=afterWheel;
  const pfBefore=await page.evaluate(()=>window.SBCMatureChartV1.state.priceFactor);
  await page.mouse.move(box.x+box.width-12,box.y+box.height*.45);await page.mouse.wheel(0,160);await page.waitForTimeout(80);
  const pfAfter=await page.evaluate(()=>window.SBCMatureChartV1.state.priceFactor);
  const timeAfterPrice=await page.evaluate(()=>window.SBCMatureChartV1.state.chart.timeScale().getVisibleLogicalRange());
  expect(pfAfter).toBeGreaterThan(pfBefore);
  expect(Math.abs(timeAfterPrice.from-timeBeforePrice.from)).toBeLessThan(.05);
  expect(Math.abs(timeAfterPrice.to-timeBeforePrice.to)).toBeLessThan(.05);

  await page.evaluate(()=>{window.__sameHost=document.querySelector('.sbc-mature-chart-host-v1');window.selectChartSymbol('TSLA','portfolio');});
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1.state.symbol)).toBe('TSLA');
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1.state.bars.length)).toBeGreaterThan(50);
  expect(await page.evaluate(()=>document.getElementById('tradeSymbol').value)).toBe('TSLA');
  expect(await page.evaluate(()=>window.proposedOrder().sym)).toBe('TSLA');
  expect(await page.evaluate(()=>window.__oeSymbol)).toBe('TSLA');
  expect(await page.evaluate(()=>window.__sameHost===document.querySelector('.sbc-mature-chart-host-v1'))).toBe(true);

  await page.click('[data-cw-time="15m"]');
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1.state.timeframe)).toBe('15m');
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1.state.bars.length)).toBeGreaterThan(50);
  expect(await page.evaluate(()=>!!document.querySelector('.sbc-mature-chart-host-v1.is-ready'))).toBe(true);
  expect(errors).toEqual([]);
});
