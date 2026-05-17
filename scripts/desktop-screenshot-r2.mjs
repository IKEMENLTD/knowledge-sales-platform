import { chromium } from 'file:///C:/Users/ooxmi/Downloads/knowledge-sales-platform/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/tmp/ksp-ux-r2-desktop';
mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
  { name: '2560', width: 2560, height: 1440 },
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
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  for (const p of pages) {
    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${vp.name}-${p.name}.png`, fullPage: false });
      console.log(`OK ${vp.name}-${p.name}`);
    } catch (e) {
      console.log(`FAIL ${vp.name}-${p.name}: ${e.message}`);
    }
  }
  await ctx.close();
}

// dark mode capture on login at 1920 — set next-themes cookie / localStorage
const darkCtx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const darkPage = await darkCtx.newPage();
await darkPage.addInitScript(() => {
  try {
    window.localStorage.setItem('theme', 'dark');
  } catch (_) {}
});
try {
  await darkPage.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 20000 });
  await darkPage.waitForTimeout(700);
  await darkPage.screenshot({ path: `${OUT}/1920-login-dark.png`, fullPage: false });
  console.log('OK 1920-login-dark');
} catch (e) {
  console.log(`FAIL 1920-login-dark: ${e.message}`);
}
try {
  await darkPage.goto('http://localhost:3000/offline', { waitUntil: 'networkidle', timeout: 20000 });
  await darkPage.waitForTimeout(700);
  await darkPage.screenshot({ path: `${OUT}/1920-offline-dark.png`, fullPage: false });
  console.log('OK 1920-offline-dark');
} catch (e) {
  console.log(`FAIL 1920-offline-dark: ${e.message}`);
}
await darkCtx.close();

// also try a "light force" to verify toggle effect via cookie
const lightCtx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const lightPage = await lightCtx.newPage();
await lightPage.addInitScript(() => {
  try {
    window.localStorage.setItem('theme', 'light');
  } catch (_) {}
});
try {
  await lightPage.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 20000 });
  await lightPage.waitForTimeout(500);
  await lightPage.screenshot({ path: `${OUT}/1920-login-light.png`, fullPage: false });
  console.log('OK 1920-login-light');
} catch (e) {
  console.log(`FAIL 1920-login-light: ${e.message}`);
}
await lightCtx.close();

await browser.close();
console.log('DONE');
