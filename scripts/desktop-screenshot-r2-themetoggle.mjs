import { chromium } from 'file:///C:/Users/ooxmi/Downloads/knowledge-sales-platform/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/tmp/ksp-ux-r2-desktop';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
// Try to capture dashboard header (likely 307 redirect to /login when not authed).
// So instead, render the login page with a deliberate header preview: capture login top-right area.
// Also test that ThemeToggle renders only in protected shell. We can hit /design-system or /admin pages.
// Most reliable: render dashboard URL -> redirect -> screenshot the resulting login top crop.
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 800 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

// Visit settings/privacy or any route under app-shell. They will likely redirect.
// Use a known protected route and inject auth cookie? We don't have it; just confirm theme toggle isn't visible without auth.
// Instead, capture the login page's "doesn't have theme toggle" since it's outside app-shell.
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/header-login-noToggle-1920.png`, fullPage: false, clip: { x: 0, y: 0, width: 1920, height: 80 } });
console.log('OK header-login-noToggle-1920');

// Use a test route if exists. Try to extract dashboard HTML by going through e2e auth helper? Skip.
// Instead, manipulate page DOM to render an AppShell-like fragment using the actual served HTML via storage state if any.
// We'll just take a crop of the login top to be the "control".
await ctx.close();

await browser.close();
console.log('DONE');
