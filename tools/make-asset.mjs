// Builds an asset from assets-src/, saves a preview render and the GLB for the game.
// Usage: node tools/make-asset.mjs barrel   (needs Playwright's Chromium; set PLAYWRIGHT to its path if it isn't a local dependency)
import {createServer} from 'vite';
import {writeFile, mkdir} from 'node:fs/promises';
const name = process.argv[2] || 'barrel';
const {chromium} = await import(process.env.PLAYWRIGHT || 'playwright');
const server = await createServer({server: {port: 5199, strictPort: true}, logLevel: 'error'}); await server.listen();
const browser = await chromium.launch({headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport: {width: 1920, height: 640}});
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:5199/assets-src/studio.html?asset=${name}`);
  await page.waitForFunction(() => window.__ready || false, null, {timeout: 180000}).catch(() => {});
  if (errors.length) throw new Error(errors.join('\n'));
  await mkdir('assets-src/previews', {recursive: true});
  await page.locator('canvas').screenshot({path: `assets-src/previews/${name}.jpg`, type: 'jpeg', quality: 88});
  const glb = Buffer.from(await page.evaluate(() => window.__exportGLB()), 'base64');
  await writeFile(`public/models/${name}.glb`, glb);
  console.log(JSON.stringify({...(await page.evaluate(() => window.__stats)), glbKB: Math.round(glb.length / 1024)}));
} finally { await browser.close(); await server.close(); }
