import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

const position = async (page: Page) => (await page.getByTestId('camera-position').innerText()).split(',').map(Number);
const rotation = async (page: Page) => (await page.getByTestId('camera-rotation').innerText()).split(',').map(Number);
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((n, i) => n - b[i]));
async function ready(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '调试记录', exact: false }).click();
  await expect(page.getByTestId('asset-status')).toContainText('ready');
  await expect.poll(() => position(page)).toEqual([5.4, 2.65, -6.1]);
}
async function reset(page: Page) {
  await page.getByRole('button', { name: '回到车辆', exact: true }).click();
  await expect.poll(() => position(page)).toEqual([5.4, 2.65, -6.1]);
}

test('actual GLB, health, visible controls and responsive layout', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  const asset = await (await page.request.get('/api/asset')).json();
  expect(asset.modelId).toBe('ca2cda599f5341068c992c9f44551bf9');
  const glb = await page.request.get(asset.runtimeUrl);
  const bytes = await glb.body();
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.length).toBe(asset.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
  expect((await page.request.get('/api/health')).ok()).toBeTruthy();
  for (const label of ['进入座舱', '回到车辆', '前方视角', '后方视角', '左方视角', '右方视角']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeInViewport();
  }
  for(const label of ['左前车窗开度','右前车窗开度','左后车窗开度','右后车窗开度'])await expect(page.getByRole('slider',{name:label,exact:true})).toBeInViewport();
  for (const [label, expected] of [
    ['前方视角', [0, 1.7, -7.8]], ['后方视角', [0, 1.7, 7.8]],
    ['左方视角', [-7.8, 1.7, 0]], ['右方视角', [7.8, 1.7, 0]],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => position(page)).toEqual([...expected]);
  }
  await reset(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: '关闭调试记录', exact: true }).click();
  await page.screenshot({ path: `docs/assets/i2-i3/su7-exterior-${testInfo.project.name}.png` });
  expect(errors).toEqual([]);
});

test('orbit rotation, actual right-button pan, wheel zoom and exact reset', async ({ page }) => {
  await ready(page);
  const before = await rotation(page);
  await page.mouse.move(760, 420);
  await page.mouse.down();
  await page.mouse.move(940, 450, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => distance(await rotation(page), before)).toBeGreaterThan(0.1);
  await expect(page.getByTestId('gesture')).toContainText('相机拖动');
  await reset(page);
  const direction = await rotation(page);
  const origin = await position(page);
  await page.mouse.move(760, 420);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(900, 450, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => distance(await position(page), origin)).toBeGreaterThan(0.1);
  expect(distance(await rotation(page), direction)).toBeLessThan(0.01);
  await reset(page);
  await page.mouse.move(760, 420);
  await page.mouse.wheel(0, -280);
  await expect.poll(async () => distance(await position(page), [0, 0.75, 0])).toBeLessThan(7.5);
  await reset(page);
});

test('cabin, free movement, look, focused input isolation and keyboard return', async ({ page }, testInfo) => {
  await ready(page);
  await page.getByRole('button', { name: '进入座舱', exact: true }).click();
  await expect.poll(() => position(page)).toEqual([-0.4, 1.15, -0.05]);
  await page.getByRole('button', { name: '关闭调试记录', exact: true }).click();
  await page.screenshot({ path: `docs/assets/i2-i3/su7-cabin-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: '调试记录', exact: false }).click();
  await page.locator('canvas').click({ position: { x: 700, y: 350 } });
  await page.keyboard.down('w');
  await page.waitForTimeout(2600);
  await page.keyboard.up('w');
  // Move beyond the car's front bound (~-2.5m), then return through the glass.
  await expect.poll(async () => (await position(page))[2]).toBeLessThan(-2.8);
  await page.keyboard.down('s');
  await page.waitForTimeout(2600);
  await page.keyboard.up('s');
  await expect.poll(async () => (await position(page))[2]).toBeGreaterThan(-0.3);
  const moved = await position(page);
  await page.keyboard.down('e');
  await page.waitForTimeout(300);
  await page.keyboard.up('e');
  await expect.poll(async () => (await position(page))[1]).toBeGreaterThan(moved[1] + 0.2);
  const view = await rotation(page);
  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(840, 430, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => distance(await rotation(page), view)).toBeGreaterThan(0.1);
  const point = await position(page);
  await page.getByRole('slider', { name: '移动速度', exact: false }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.down('w');
  await page.waitForTimeout(350);
  await page.keyboard.up('w');
  expect(distance(await position(page), point)).toBeLessThan(0.01);
  await page.locator('canvas').click({ position: { x: 700, y: 350 } });
  await page.keyboard.press('r');
  await expect.poll(() => position(page)).toEqual([5.4, 2.65, -6.1]);
});

test('corrupt model fails visibly, then retry loads the actual asset', async ({ page }) => {
  await page.route('**/models/su7-runtime.glb?*', (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: 'corrupt-test-body' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '模型加载未完成' })).toBeVisible();
  await expect(page.getByText('模型文件大小与资产记录不一致，请重新导入或重试。', { exact: true })).toBeVisible();
  await page.unroute('**/models/su7-runtime.glb?*');
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await page.getByRole('button', { name: '调试记录', exact: false }).click();
  await expect(page.getByTestId('asset-status')).toContainText('ready');
  await expect(page.getByRole('heading', { name: '模型加载未完成' })).toHaveCount(0);
});

test('two minutes of continuous camera operations remain responsive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'Edge-1920x1080', 'The stability baseline is measured once at 1080p; all functional cases run at both resolutions.');
  test.setTimeout(165000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  const start = Date.now();
  let cycles = 0;
  while (Date.now() - start < 120000) {
    await page.getByRole('button', { name: '前方视角', exact: true }).click();
    await page.mouse.move(680, 400);
    await page.mouse.down();
    await page.mouse.move(870, 440, { steps: 12 });
    await page.mouse.up();
    await page.mouse.move(700, 400);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(780, 415, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, -100);
    await page.getByRole('button', { name: '进入座舱', exact: true }).click();
    await page.locator('canvas').click({ position: { x: 700, y: 320 } });
    await page.keyboard.down('d');
    await page.waitForTimeout(180);
    await page.keyboard.up('d');
    await page.mouse.move(700, 400);
    await page.mouse.down();
    await page.mouse.move(790, 420, { steps: 8 });
    await page.mouse.up();
    await reset(page);
    cycles++;
  }
  await expect(page.getByTestId('asset-status')).toContainText('ready');
  const responsePromise = page.waitForResponse((res) => res.url().endsWith('/api/diagnostics') && res.request().method() === 'POST');
  await page.getByRole('button', { name: '保存场景诊断 JSON', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const report = { durationMs: Date.now() - start, cycles, errors, diagnostic: await response.json() };
  await testInfo.attach('continuous-camera-result', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});
