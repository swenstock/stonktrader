const {test,expect}=require('@playwright/test');
const {spawn}=require('child_process');

const PORT=34170;
const BASE=`http://127.0.0.1:${PORT}`;
let server;

function barsFor(symbol,interval){
  const base={AAPL:190,TSLA:320,NVDA:180}[symbol]||100;
  const step=interval==='1D'?86400:interval==='1h'?3600:interval==='15m'?900:interval==='5m'?300:60;
  const start=Math.floor(Date.parse('2026-08-28T14:30:00Z')/1000)-step*159;
  const rows=[];let last=base;
  for(let i=0;i<160;i++){
    const drift=Math.sin(i/5)*1.2+(i%7-3)*.13;
    const open=last,close=Math.max(1,open+drift),high=Math.max(open,close)+.8,low=Math.min(open,close)-.7;
    rows.push({time:new Date((start+i*step)*1000).toISOString(),open,high,low,close,volume:100000+i*2300});
    last=close;
  }
  return rows;
}
async function waitForServer(){
  for(let i=0;i<80;i++){
    try{const r=await fetch(`${BASE}/api/health`);if(r.ok)return;}catch(_){}
    await new Promise(r=>setTimeout(r,125));
  }
  throw new Error('SBC test server did not become ready');
}
async function openWorkspace(page){
  let failSymbol='';
  const chartErrors=[];
  page.on('pageerror',e=>{if(/mature-chart|lightweight/i.test(String(e)))chartErrors.push(String(e));});
  page.on('console',m=>{if(m.type()==='error'&&/mature-chart|lightweight/i.test(m.text()))chartErrors.push(m.text());});
  await page.route('**/api/quotes/bars**',async route=>{
    const u=new URL(route.request().url());
    const symbol=(u.searchParams.get('symbol')||'AAPL').toUpperCase();
    const interval=u.searchParams.get('interval')||'5m';
    const bars=symbol===failSymbol?[]:barsFor(symbol,interval);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({bars})});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>window.showView?.('portfolio'));
  await page.evaluate(()=>window.selectChartSymbol?.('AAPL','browser-acceptance'));
  await expect.poll(()=>page.evaluate(()=>!!document.querySelector('.sbc-mature-chart-host-v1.is-ready'))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1?.state?.bars?.length||0)).toBeGreaterThan(100);
  return{chartErrors,setFailSymbol:s=>{failSymbol=s;}};
}
async function geometry(page){
  return page.evaluate(()=>{
    const s=window.SBCMatureChartV1.state;
    const range=s.chart.timeScale().getVisibleLogicalRange();
    const last=s.bars.length-1;
    const r=s.host.getBoundingClientRect();
    const overlap=Math.max(0,Math.min(range.to,last)-Math.max(range.from,0)+1);
    return{range,last,overlap,width:r.width,height:r.height};
  });
}
async function aggressiveDrag(page,box,dx){
  for(let i=0;i<5;i++){
    const y=box.y+box.height*.46;
    const start=dx<0?box.x+box.width*.78:box.x+box.width*.22;
    await page.mouse.move(start,y);
    await page.mouse.down();
    await page.mouse.move(start+dx,y,{steps:12});
    await page.mouse.up();
  }
  await page.waitForTimeout(120);
}

test.beforeAll(async()=>{
  server=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(PORT),TEST_MODE:'true'},stdio:['ignore','pipe','pipe']});
  await waitForServer();
});
test.afterAll(async()=>{if(server&&!server.killed)server.kill('SIGTERM');});

test('@mount real SBC shell mounts one visible mature owner after Portfolio lays out',async({page},testInfo)=>{
  const {chartErrors}=await openWorkspace(page);
  const host=page.locator('.sbc-mature-chart-host-v1');
  await expect(host).toHaveCount(1);
  await expect(host).toBeVisible();
  const g=await geometry(page);
  expect(g.width).toBeGreaterThan(500);
  expect(g.height).toBeGreaterThan(200);
  expect(g.overlap).toBeGreaterThan(10);
  const rendered=await page.evaluate(()=>[...document.querySelectorAll('.sbc-mature-chart-host-v1 canvas')].some(c=>{try{return c.toDataURL().length>1000}catch{return false}}));
  expect(rendered).toBe(true);
  expect(chartErrors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('mount-real-workspace.png'),fullPage:true});
});

test('@pan aggressive native pan cannot throw all market history offscreen',async({page},testInfo)=>{
  const {chartErrors}=await openWorkspace(page);
  const host=page.locator('.sbc-mature-chart-host-v1');
  const box=await host.boundingBox();expect(box).toBeTruthy();
  const initial=await geometry(page);
  await page.mouse.move(box.x+box.width*.48,box.y+box.height*.45);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.68,box.y+box.height*.45,{steps:10});
  await page.mouse.up();
  await page.waitForTimeout(80);
  const released=await geometry(page);
  expect(Math.abs(released.range.from-initial.range.from)).toBeGreaterThan(.5);
  await page.waitForTimeout(160);
  const settled=await geometry(page);
  expect(Math.abs(settled.range.from-released.range.from)).toBeLessThan(.05);
  await aggressiveDrag(page,box,-box.width*.62);
  expect((await geometry(page)).overlap).toBeGreaterThanOrEqual(4);
  await aggressiveDrag(page,box,box.width*.62);
  const extreme=await geometry(page);
  expect(extreme.overlap).toBeGreaterThanOrEqual(4);
  const beforeRefresh=extreme.range;
  await page.evaluate(()=>window.SBCMatureChartV1.loadBars({reset:false}));
  await page.waitForTimeout(120);
  const afterRefresh=await geometry(page);
  expect(afterRefresh.overlap).toBeGreaterThanOrEqual(4);
  expect(Math.abs(afterRefresh.range.from-beforeRefresh.from)).toBeLessThan(.08);
  expect(Math.abs(afterRefresh.range.to-beforeRefresh.to)).toBeLessThan(.08);
  expect(chartErrors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('pan-bounded-real-workspace.png'),fullPage:true});
});

test('@zoom plot wheel changes time density while price axis stays independent',async({page})=>{
  const {chartErrors}=await openWorkspace(page);
  const host=page.locator('.sbc-mature-chart-host-v1');
  const box=await host.boundingBox();expect(box).toBeTruthy();
  const before=await geometry(page),spanBefore=before.range.to-before.range.from;
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.42);
  await page.mouse.wheel(0,180);
  await page.waitForTimeout(100);
  const afterWheel=await geometry(page);
  expect(Math.abs((afterWheel.range.to-afterWheel.range.from)-spanBefore)).toBeGreaterThan(.2);
  expect(afterWheel.overlap).toBeGreaterThanOrEqual(4);
  const timeBeforePrice=afterWheel.range;
  const pfBefore=await page.evaluate(()=>window.SBCMatureChartV1.state.priceFactor);
  await page.mouse.move(box.x+box.width-12,box.y+box.height*.45);
  await page.mouse.wheel(0,160);
  await page.waitForTimeout(80);
  const pfAfter=await page.evaluate(()=>window.SBCMatureChartV1.state.priceFactor);
  const timeAfterPrice=(await geometry(page)).range;
  expect(pfAfter).toBeGreaterThan(pfBefore);
  expect(Math.abs(timeAfterPrice.from-timeBeforePrice.from)).toBeLessThan(.05);
  expect(Math.abs(timeAfterPrice.to-timeBeforePrice.to)).toBeLessThan(.05);
  expect(chartErrors).toEqual([]);
});

test('@state symbol, timeframe, same-host ownership, and PR171 fallback stay truthful',async({page},testInfo)=>{
  const ctx=await openWorkspace(page);
  await page.evaluate(()=>{window.__sameHost=document.querySelector('.sbc-mature-chart-host-v1');window.selectChartSymbol('TSLA','portfolio');});
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1.state.symbol)).toBe('TSLA');
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1.state.bars.length)).toBeGreaterThan(100);
  expect(await page.evaluate(()=>document.getElementById('tradeSymbol').value)).toBe('TSLA');
  expect(await page.evaluate(()=>window.proposedOrder().sym)).toBe('TSLA');
  expect(await page.evaluate(()=>window.__sameHost===document.querySelector('.sbc-mature-chart-host-v1'))).toBe(true);
  const tf=page.locator('[data-cw-time="15m"]').first();
  await expect(tf).toBeVisible();
  await tf.click();
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1.state.timeframe)).toBe('15m');
  await expect.poll(()=>page.evaluate(()=>window.SBCMatureChartV1.state.bars.length)).toBeGreaterThan(100);
  expect((await geometry(page)).overlap).toBeGreaterThan(4);
  ctx.setFailSymbol('NVDA');
  await page.evaluate(()=>window.selectChartSymbol('NVDA','portfolio'));
  await expect.poll(()=>page.evaluate(()=>!!document.querySelector('.sbc-mature-chart-host-v1.is-ready'))).toBe(false);
  const fallback=await page.evaluate(()=>{
    const s=window.SBCMatureChartV1.state,hs=getComputedStyle(s.host);
    const native=[...s.viewport.querySelectorAll('canvas,svg,.symbol-chart,.chart-canvas')].find(el=>!el.closest('.sbc-mature-chart-host-v1'));
    const ns=native?getComputedStyle(native):null;
    return{active:s.viewport.classList.contains('sbc-mature-chart-active-v1'),hostVisibility:hs.visibility,hostPointerEvents:hs.pointerEvents,nativeFound:!!native,nativeOpacity:ns?.opacity||null};
  });
  expect(fallback.active).toBe(false);
  expect(fallback.hostVisibility).toBe('hidden');
  expect(fallback.hostPointerEvents).toBe('none');
  expect(fallback.nativeFound).toBe(true);
  if(fallback.nativeOpacity!==null)expect(Number(fallback.nativeOpacity)).toBeGreaterThan(.9);
  ctx.setFailSymbol('');
  await page.evaluate(()=>window.selectChartSymbol('AAPL','portfolio'));
  await expect.poll(()=>page.evaluate(()=>!!document.querySelector('.sbc-mature-chart-host-v1.is-ready'))).toBe(true);
  expect(ctx.chartErrors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('state-fallback-real-workspace.png'),fullPage:true});
});
