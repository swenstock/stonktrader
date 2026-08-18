import { test, expect } from '@playwright/test';
const BASE=process.env.SBC_MOBILE_BASE_URL||'http://127.0.0.1:3458';

async function openView(page,name){
  await page.evaluate((v)=>{
    try{ if(typeof showView==='function'){ showView(v); return; } }catch(_){}
    document.querySelectorAll('.view[id^="view-"]').forEach(x=>{x.style.display=x.id===`view-${v}`?'block':'none';x.classList.toggle('active',x.id===`view-${v}`)});
  },name);
  await page.waitForTimeout(180);
}

async function bodyFits(page){
  const fit=await page.evaluate(()=>({w:document.documentElement.clientWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth,iw:innerWidth}));
  expect(fit.sw,JSON.stringify(fit)).toBeLessThanOrEqual(fit.iw+2);
  expect(fit.bw,JSON.stringify(fit)).toBeLessThanOrEqual(fit.iw+2);
}

test.describe('Stage 34 iPhone SE width',()=>{
  test.use({viewport:{width:375,height:667},isMobile:true,hasTouch:true});

  test.beforeEach(async({page})=>{
    await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__sbcMobileNativeV43===true,null,{timeout:8000});
  });

  test('five-tab nav, safe fit and live feed',async({page})=>{
    const nav=page.locator('.mobile-bottom-nav');await expect(nav).toBeVisible();
    await expect(nav.locator('button')).toHaveCount(5);
    const fixed=await nav.evaluate(el=>getComputedStyle(el).position);expect(fixed).toBe('fixed');
    for(const b of await nav.locator('button').all()){const r=await b.boundingBox();expect(r?.height||0).toBeGreaterThanOrEqual(44);expect(r?.width||0).toBeGreaterThanOrEqual(44)}
    await expect(page.locator('#sbcM43Connection')).toContainText(/LIVE DATA|SERVER LIVE/,{timeout:8000});
    expect(await page.locator('body').evaluate(el=>getComputedStyle(el).fontSize)).toBe('16px');
    await bodyFits(page);
  });

  test('portfolio is a one-handed three-tab workspace',async({page})=>{
    await openView(page,'portfolio');
    const tabs=page.locator('.sbc-m43-trade-tabs');await expect(tabs).toBeVisible();await expect(tabs.locator('button')).toHaveCount(3);
    for(const b of await tabs.locator('button').all()){const r=await b.boundingBox();expect(r?.height||0).toBeGreaterThanOrEqual(44)}
    await expect(page.locator('#view-portfolio')).toHaveAttribute('data-sbc-mobile-tab','trade');
    await expect(page.locator('#view-portfolio .chart-trade-card')).toBeVisible();
    await expect(page.locator('#view-portfolio .holdings-card')).toBeHidden();

    const chips=page.locator('.sbc-m43-symbol-chips');await expect(chips).toBeVisible();expect(await chips.evaluate(el=>getComputedStyle(el).overflowX)).toMatch(/auto|scroll/);
    expect(await chips.locator('button').count()).toBeGreaterThan(0);

    const quick=page.locator('#view-portfolio .quick-percent-row button:visible');
    const qn=await quick.count();if(qn){expect(qn).toBeGreaterThanOrEqual(4);for(const b of await quick.all()){const r=await b.boundingBox();expect(r?.height||0).toBeGreaterThanOrEqual(44)}}

    await tabs.locator('[data-m43-trade="positions"]').click();
    await expect(page.locator('#view-portfolio')).toHaveAttribute('data-sbc-mobile-tab','positions');
    await expect(page.locator('#view-portfolio .holdings-card')).toBeVisible();
    await expect(page.locator('#view-portfolio .holdings-table')).toBeHidden();
    await page.evaluate(()=>{const t=document.querySelector('#portfolioHoldings');if(t)t.innerHTML='<tr><td>NVDA</td><td>12.5</td><td>$120.00</td><td>$131.25</td><td>$1,640.63 / 1.6%</td><td>+$140.63</td></tr>'});
    await expect(page.locator('#sbcM43PositionCards .sbc-m43-position-card')).toHaveCount(1,{timeout:3000});
    await expect(page.locator('#sbcM43PositionCards .sbc-m43-position-pnl')).toHaveClass(/sbc-m43-gain/);

    await tabs.locator('[data-m43-trade="analytics"]').click();
    await expect(page.locator('#analyticsDock')).toBeVisible();
    const analytics=page.locator('#analyticsDock .analytics-grid-v23').first();if(await analytics.count()){expect(await analytics.evaluate(el=>getComputedStyle(el).overflowX)).toMatch(/auto|scroll/)}
    await bodyFits(page);
  });

  test('exchange uses touch-sized Bids/Offers tabs with one visible book',async({page})=>{
    await openView(page,'exchange');
    const tabs=page.locator('.sbc-m43-exchange-tabs');await expect(tabs).toBeVisible();await expect(tabs.locator('button')).toHaveCount(2);
    for(const b of await tabs.locator('button').all()){const r=await b.boundingBox();expect(r?.height||0).toBeGreaterThanOrEqual(44)}
    const bid=page.locator('.ticket-market-grid .bid-book'),ask=page.locator('.ticket-market-grid .ask-book');
    await expect(bid).toBeVisible();await expect(ask).toBeHidden();
    await tabs.locator('[data-side="ask"]').click();await expect(ask).toBeVisible();await expect(bid).toBeHidden();
    await bodyFits(page);
  });

  test('leaderboard rows cardify and Find Me stays prominent',async({page})=>{
    await openView(page,'leaders');
    const table=page.locator('.leader-table').first();if(await table.count())await expect(table).toHaveClass(/sbc-m43-card-table/);
    const find=page.locator('.leader-find-btn').first();if(await find.count()){const r=await find.boundingBox();expect(r?.height||0).toBeGreaterThanOrEqual(44)}
    await bodyFits(page);
  });

  test('desktop exchange modal presents as a bottom sheet on mobile',async({page})=>{
    await openView(page,'exchange');
    const modal=page.locator('#ticketOrderModal');await modal.evaluate(el=>{el.hidden=false;el.style.display='flex';el.classList.add('open');el.setAttribute('aria-hidden','false')});
    const card=modal.locator('.ticket-order-card');await expect(card).toBeVisible();
    const r=await card.boundingBox();expect(r?.width||0).toBeGreaterThan(350);expect(Math.abs((r?.y||0)+(r?.height||0)-667)).toBeLessThan(6);
    expect(await card.evaluate(el=>getComputedStyle(el).borderTopLeftRadius)).not.toBe('0px');
  });

  test('offline is explicit and blocks stock trading until quote feed reconnects',async({page,context})=>{
    await openView(page,'portfolio');
    await expect(page.locator('#sbcM43Connection')).toContainText(/LIVE DATA|SERVER LIVE/,{timeout:8000});
    await context.setOffline(true);
    await expect(page.locator('#sbcM43Connection')).toContainText('OFFLINE',{timeout:3000});
    const actions=page.locator('#view-portfolio .quick-action');if(await actions.count())expect(await actions.first().isDisabled()).toBeTruthy();
    await context.setOffline(false);
    await expect(page.locator('#sbcM43Connection')).toContainText(/LIVE DATA|SERVER LIVE/,{timeout:10000});
  });
});
