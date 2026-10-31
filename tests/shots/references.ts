import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const OUT = 'references';
const WAIT = 3000;

const PAGES = {
	offsuit: 'https://offsuit.app',
	andmade: 'https://andmade.jp',
	goodside: 'https://www.goodside.studio/about',
	linkletter: 'https://linkletter.press',
	railroad: 'https://railroadladies.com',
};

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const [name, url] of Object.entries(PAGES)) {
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForTimeout(WAIT);
	await page.screenshot({ path: `${OUT}/${name}.png` });
}

await browser.close();
