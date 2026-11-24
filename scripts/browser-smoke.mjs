import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';
const scratch = await mkdtemp(join(tmpdir(), 'bookletfold-qa-'));
const app = new URL('../docs/index.html', import.meta.url).href;
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }
);
try {
  const context = await browser.newContext({
    offline: true,
    locale: 'en-US',
    viewport: { width: 1200, height: 850 },
  });
  const page = await context.newPage(),
    errors = [],
    requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  context.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  page.setDefaultTimeout(12000);
  async function capture() {
    if (!process.argv.includes('--capture')) return;
    const assets = new URL('../assets/', import.meta.url);
    await mkdir(assets, { recursive: true });
    await page.screenshot({ path: fileURLToPath(new URL('demo.png', assets)), fullPage: true });
  }
  async function download(selector, filename) {
    const [item] = await Promise.all([
      page.waitForEvent('download'),
      page.locator(selector).click(),
    ]);
    const file = join(scratch, filename);
    await item.saveAs(file);
    return readFile(file);
  }
  await page.goto(app + '#demo');
  await page.locator('#file-name').filter({ hasText: 'Studio notes' }).waitFor();
  assert.deepEqual(await page.locator('#front strong').allTextContents(), ['8', '1']);
  await capture();
  await page.locator('#next').click();
  assert.deepEqual(await page.locator('#back strong').allTextContents(), ['4', '5']);
  await page.locator('#binding').selectOption('right');
  assert.deepEqual(await page.locator('#front strong').allTextContents(), ['1', '8']);
  await page.locator('#maxSheets').selectOption('1');
  await page.locator('#next').click();
  assert.match(await page.locator('#position').innerText(), /Signature 2/);
  const doc = await PDFDocument.create();
  for (let n = 1; n <= 5; n++) doc.addPage([240, 320]).drawText('Input page ' + n);
  const fixture = join(scratch, 'five-pages.pdf');
  await writeFile(fixture, await doc.save());
  async function choose(path) {
    const [picker] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#choose').click(),
    ]);
    await picker.setFiles(path);
  }
  await choose(fixture);
  await page.locator('#file-name').filter({ hasText: 'five-pages' }).waitFor();
  await page.locator('#paper').selectOption('Letter');
  assert.match(await page.locator('#stats').innerText(), /3 blank panels/);
  const result = await PDFDocument.load(await download('#export', 'printed.pdf'));
  assert.equal(result.getPageCount(), 4);
  assert.deepEqual(result.getPage(0).getSize(), { width: 792, height: 612 });
  const bad = join(scratch, 'broken.pdf');
  await writeFile(bad, 'Invalid PDF');
  await choose(bad);
  await page.locator('#notice').filter({ hasText: 'Could not read' }).waitFor();
  assert.ok(await page.locator('#export').isDisabled());
  await page.locator('#load-example').click();
  await page.locator('#file-name').filter({ hasText: 'Studio notes' }).waitFor();
  await page.setViewportSize({ width: 360, height: 770 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'mobile horizontal overflow'
  );
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  console.log('Offline browser workflow, export and mobile layout passed.');
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
