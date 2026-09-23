import { chromium } from '../.qa/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('qa-renders',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
await page.goto('http://127.0.0.1:4173/?review=1',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForTimeout(20000);
for(const view of ['bridgeWest','bridgeEast','rocksWest','cathedral','overhead']){
  try{
    await page.selectOption('#review-view',view);
    await page.waitForTimeout(2500);
  }catch(e){errors.push(view+': '+String(e));}
  await page.screenshot({path:'qa-renders/'+view+'.png',fullPage:false});
}
const state=await page.evaluate(()=>({
  error:document.querySelector('#error')?.textContent||'',
  errorVisible:document.querySelector('#error')?getComputedStyle(document.querySelector('#error')).display!=='none':false,
  review:document.querySelector('#review-status')?.textContent||'',
  loadingHidden:document.querySelector('#loading')?.hidden,
  welcomeHidden:document.querySelector('#welcome')?.hidden
})).catch(e=>({evaluateError:String(e)}));
await writeFile('qa-renders/state.json',JSON.stringify({errors,state},null,2));
await browser.close();
