const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = 34171;
const BASE = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(os.tmpdir(), `sbc-turtle-portrait-diag-${process.pid}.db`);
const KEYS = ['freeroll','runner','clerk','trader','junior'];
let server;

async function waitForServer(){
  for(let i=0;i<100;i++){
    try{ const r=await fetch(`${BASE}/api/health`); if(r.ok) return; }catch(_){}
    await new Promise(r=>setTimeout(r,125));
  }
  throw new Error('SBC diagnostic server did not become ready');
}

test.beforeAll(async()=>{
  try{ fs.unlinkSync(DB_PATH); }catch(_){}
  server = spawn(process.execPath,['server/index.js'],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(PORT),TEST_MODE:'true',DB_PATH},
    stdio:['ignore','inherit','inherit']
  });
  await waitForServer();
});

test.afterAll(async()=>{
  if(server && !server.killed) server.kill('SIGTERM');
  try{ fs.unlinkSync(DB_PATH); }catch(_){}
  try{ fs.unlinkSync(`${DB_PATH}-wal`); }catch(_){}
  try{ fs.unlinkSync(`${DB_PATH}-shm`); }catch(_){}
});

test('Trading Floor portrait diagnostic', async({page}, testInfo)=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>window.showView?.('floor'));
  await expect(page.locator('#view-floor')).toBeVisible();
  await page.waitForTimeout(250);

  const report = await page.evaluate((keys)=>{
    return keys.map((key)=>{
      const card = document.getElementById(`cleanCard-${key}`);
      if(!card) return {key,cardFound:false};
      const cardRect = card.getBoundingClientRect();
      const images = [...card.querySelectorAll('img')];
      return {
        key,
        cardFound:true,
        imageCount:images.length,
        cardRect:{x:cardRect.x,y:cardRect.y,width:cardRect.width,height:cardRect.height},
        images:images.map((img,index)=>{
          const cs=getComputedStyle(img);
          const r=img.getBoundingClientRect();
          const src=img.getAttribute('src')||'';
          return {
            index,
            naturalWidth:img.naturalWidth,
            naturalHeight:img.naturalHeight,
            decodeFailed:img.naturalWidth===0 || img.naturalHeight===0,
            complete:img.complete,
            clientWidth:img.clientWidth,
            clientHeight:img.clientHeight,
            rect:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom},
            computed:{
              display:cs.display,
              width:cs.width,
              height:cs.height,
              minHeight:cs.minHeight,
              maxHeight:cs.maxHeight,
              objectFit:cs.objectFit,
              objectPosition:cs.objectPosition,
              aspectRatio:cs.aspectRatio,
              overflow:cs.overflow,
              position:cs.position,
              zIndex:cs.zIndex,
              opacity:cs.opacity,
              clip:cs.clip,
              clipPath:cs.clipPath,
              transform:cs.transform,
              backgroundColor:cs.backgroundColor
            },
            srcLength:src.length,
            srcPrefix:src.slice(0,48),
            currentSrcLength:(img.currentSrc||'').length,
            currentSrcPrefix:(img.currentSrc||'').slice(0,48)
          };
        }),
        children:[...card.children].map((el)=>{
          const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
          return {tag:el.tagName,className:el.className,id:el.id||'',rect:{x:r.x,y:r.y,width:r.width,height:r.height},position:cs.position,zIndex:cs.zIndex,backgroundColor:cs.backgroundColor,overflow:cs.overflow};
        })
      };
    });
  }, KEYS);

  console.log('TURTLE_PORTRAIT_DIAGNOSTIC_BEGIN');
  console.log(JSON.stringify(report,null,2));
  console.log('TURTLE_PORTRAIT_DIAGNOSTIC_END');

  for(const row of report){
    expect(row.cardFound,`${row.key} card missing`).toBe(true);
    expect(row.imageCount,`${row.key} image count`).toBeGreaterThanOrEqual(1);
  }

  await page.screenshot({path:testInfo.outputPath('trading-floor-portrait-diagnostic.png'),fullPage:true});
});
