import { chromium } from '../.qa/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('qa-renders',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1200,height:750}});
const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
await page.goto('http://127.0.0.1:4173/?review=1&staticqa=1',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForFunction(()=>window.__qaSetView,{timeout:120000});
for(const view of ['bridgeWest','bridgeEast','rocksWest','cathedral','overhead']){
  await page.evaluate(v=>window.__qaSetView(v),view);
  await page.waitForTimeout(250);
  await page.screenshot({path:'qa-renders/'+view+'.png',fullPage:false,timeout:120000});
}
const state=await page.evaluate(()=>({
  error:document.querySelector('#error')?.textContent||'',
  review:document.querySelector('#review-status')?.textContent||'',
  loadingHidden:document.querySelector('#loading')?.hidden,
  welcomeHidden:document.querySelector('#welcome')?.hidden
}));
await writeFile('qa-renders/state.json',JSON.stringify({errors,state},null,2));
await browser.close();
