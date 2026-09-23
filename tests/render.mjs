// CI graphics smoke test. All navigations stay on this checked-out project.
import { chromium } from '../.qa/node_modules/playwright/index.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('qa-renders',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
await page.goto('http://127.0.0.1:8080/?review=1',{waitUntil:'networkidle'});
await page.locator('#review-status').filter({hasText:'tris'}).waitFor({timeout:120000});
assert.equal(await page.locator('#error').isVisible(),false,await page.locator('#error').textContent());
const stats={};
for(const view of ['square','cathedral','smithy','adria','graveyard','overhead']){
 await page.selectOption('#review-view',view);
 await page.waitForTimeout(1400);
 await page.screenshot({path:'qa-renders/'+view+'.jpg',type:'jpeg',quality:90});
 stats[view]=await page.locator('#review-status').textContent();
}
await page.selectOption('#review-view','square');
await page.click('#review-collision');
assert.equal(await page.locator('#review-collision').textContent(),'Collision checks passed');
const before=await page.locator('#review-status').textContent();
await page.click('#review-walk');await page.waitForTimeout(4200);
const after=await page.locator('#review-status').textContent();
assert.notEqual(before.split('|')[1],after.split('|')[1],'Walking must change the player position');
await page.click('#map-toggle');assert.equal(await page.locator('#map-panel').isVisible(),true);
await page.click('#map-close');assert.equal(await page.locator('#map-panel').isVisible(),false);
await page.click('#settings-toggle');
await page.selectOption('#quality','high');await page.click('#settings-close');await page.waitForTimeout(1000);
await page.screenshot({path:'qa-renders/square-high.jpg',type:'jpeg',quality:90});
await writeFile('qa-renders/metrics.json',JSON.stringify({stats,errors,before,after},null,2));
console.log(JSON.stringify({stats,errors},null,2));
await browser.close();
assert.deepEqual(errors,[]);
