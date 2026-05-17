import { chromium } from 'file:///C:/Users/ooxmi/Downloads/knowledge-sales-platform/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';

const viewports = [
  { name: 'iphone14pro', width: 390, height: 844 },
  { name: 'galaxy', width: 360, height: 780 },
  { name: 'pixel', width: 412, height: 915 },
];
const pages = [
  { name: 'login', url: 'http://localhost:3000/login' },
  { name: '403', url: 'http://localhost:3000/403' },
  { name: 'offline', url: 'http://localhost:3000/offline' },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  for (const p of pages) {
    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `C:/tmp/ksp-ux-mobile/${vp.name}-${p.name}.png`, fullPage: true });
      console.log(`OK ${vp.name}-${p.name}`);
    } catch (e) {
      console.log(`FAIL ${vp.name}-${p.name}: ${e.message}`);
    }
  }
  await ctx.close();
}
await browser.close();
