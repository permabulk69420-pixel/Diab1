import { chromium } from '../.qa/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
await mkdir('qa-renders',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
await page.goto('http://127.0.0.1:4173/?review=1',{waitUntil:'networkidle'});
await page.locator('#review-status').filter({hasText:'tris'}).waitFor({timeout:120000});
for(const view of ['bridgeWest','bridgeEast','rocksWest','cathedral','overhead']){
  await page.selectOption('#review-view',view);
  await page.waitForTimeout(900);
  await page.screenshot({path:'qa-renders/'+view+'.png',fullPage:false});
}
await browser.close();
