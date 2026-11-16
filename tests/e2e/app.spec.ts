import { expect, test, type Page } from '@playwright/test';

type Ctl = {
  ctrl: { map: { project(c: [number, number]): { x: number; y: number }; getSource(id: string): { getData(): Promise<{ features: { properties: Record<string, unknown> }[] }> }; queryRenderedFeatures(o?: unknown): { layer: { id: string }; properties: Record<string, unknown> }[]; jumpTo(o: unknown): void; loaded(): boolean; isStyleLoaded(): boolean } ; isReady: boolean };
  playback: { seek(y: number): void; pause(): void; state: { year: number; playing: boolean } };
  data: { castleById: Map<string, { coord: [number, number]; name: string }> };
};

async function ready(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => {
    const w = window as unknown as { __castleMap?: { ctrl: { isReady: boolean } } };
    return !!w.__castleMap?.ctrl?.isReady;
  }, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
}

/** On phones the tool buttons sit behind the Menu button. */
async function nav(page: Page, name: string | RegExp) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name }).click();
}

const year = async (page: Page) => Number(await page.getByTestId('current-year').textContent());

async function eventIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const w = window as unknown as { __castleMap: Ctl };
    const d = await w.__castleMap.ctrl.map.getSource('events').getData();
    return d.features.map((f) => String(f.properties.id));
  });
}

async function castleIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const w = window as unknown as { __castleMap: Ctl };
    const d = await w.__castleMap.ctrl.map.getSource('castles').getData();
    return d.features.map((f) => String(f.properties.id));
  });
}

async function seek(page: Page, y: number) {
  await page.evaluate((yy) => (window as unknown as { __castleMap: Ctl }).__castleMap.playback.seek(yy), y);
  await page.waitForTimeout(400);
}

test.describe('Castle Map', () => {
  test('loads the map of Britain with territories for England, Scotland and Wales', async ({ page }) => {
    await ready(page, '/?y=1200');
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    const authorities = await page.evaluate(() => {
      const w = window as unknown as { __castleMap: Ctl };
      return [...new Set(w.__castleMap.ctrl.map.queryRenderedFeatures({ layers: ['terr-fill'] }).map((f) => String(f.properties.authorityId)))].sort();
    });
    expect(authorities).toEqual(expect.arrayContaining(['auth-england', 'auth-scotland', 'auth-welsh']));
    await expect(page.getByTestId('current-year')).toHaveText('1200');
  });

  test('plays forward, pauses, and restarts', async ({ page }) => {
    await ready(page);
    expect(await year(page)).toBe(1000);
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(3000);
    await page.getByTestId('play-toggle').click();
    const paused = await year(page);
    expect(paused).toBeGreaterThan(1000);
    await page.waitForTimeout(1500);
    expect(await year(page)).toBe(paused);
    await page.getByRole('button', { name: 'Restart from AD 1000' }).click();
    expect(await year(page)).toBe(1000);
    expect(await castleIds(page)).not.toContain('castle-caernarfon');
  });

  test('battles appear at their recorded dates and scrubbing backward removes them', async ({ page }) => {
    await ready(page);
    await seek(page, 1066.7); // before 14 Oct 1066
    expect(await eventIds(page)).not.toContain('evt-hastings-1066');
    await seek(page, 1066.9);
    expect(await eventIds(page)).toContain('evt-hastings-1066');
    await seek(page, 1461.5);
    expect(await eventIds(page)).toContain('evt-towton-1461');
    await seek(page, 1300);
    const ids = await eventIds(page);
    expect(ids).not.toContain('evt-towton-1461');
    expect(ids).toContain('evt-hastings-1066');
  });

  test('castles appear from their construction date and stay after capture', async ({ page }) => {
    await ready(page);
    await seek(page, 1282);
    expect(await castleIds(page)).not.toContain('castle-caernarfon');
    await seek(page, 1284);
    expect(await castleIds(page)).toContain('castle-caernarfon');
    await seek(page, 1990);
    expect(await castleIds(page)).toContain('castle-caernarfon');
    expect(await castleIds(page)).toContain('castle-roxburgh'); // destroyed 1460, still shown
  });

  test('hovering a castle shows its name; clicking opens its record', async ({ page }) => {
    await ready(page, '/?y=1400&c=-4.2768,53.1393&z=10');
    const pt = await page.evaluate(() => {
      const w = window as unknown as { __castleMap: Ctl };
      const c = w.__castleMap.data.castleById.get('castle-caernarfon')!;
      return w.__castleMap.ctrl.map.project(c.coord);
    });
    await page.mouse.move(pt.x, pt.y - 2);
    await expect(page.getByTestId('map-tooltip')).toContainText('Caernarfon Castle');
    await page.mouse.click(pt.x, pt.y - 2);
    await expect(page.getByTestId('info-panel')).toContainText('Caernarfon Castle');
    await expect(page.getByTestId('info-panel')).toContainText('Sources');
  });

  test('layer toggles hide castles and events', async ({ page }) => {
    await ready(page, '/?y=1500');
    expect((await castleIds(page)).length).toBeGreaterThan(10);
    await nav(page, 'Layers');
    await page.getByTestId('layer-castles').uncheck();
    await page.waitForTimeout(400);
    expect(await castleIds(page)).toHaveLength(0);
    await page.getByTestId('layer-battles').uncheck();
    await page.waitForTimeout(400);
    expect(await eventIds(page)).not.toContain('evt-towton-1461');
  });

  test('search finds a battle and opens it', async ({ page }) => {
    await ready(page);
    await page.locator('#search-input').fill('Bannockburn');
    await page.getByRole('option', { name: /Battle of Bannockburn/ }).first().click();
    await expect(page.getByTestId('info-panel')).toContainText('Battle of Bannockburn');
    expect(await year(page)).toBe(1314);
  });

  test('deep links restore year, selection and heatmap mode', async ({ page }) => {
    await ready(page, '/?y=1746.3&sel=e:evt-culloden-1746&hm=frequency');
    await expect(page.getByTestId('current-year')).toHaveText('1746');
    await expect(page.getByTestId('info-panel')).toContainText('Battle of Culloden');
    await nav(page, 'Heatmap');
    await expect(page.getByTestId('heat-frequency')).toBeChecked();
  });

  test('keyboard controls work', async ({ page }) => {
    await ready(page, '/?y=1500');
    await page.locator('body').press('ArrowRight');
    expect(await year(page)).toBe(1501);
    await page.locator('body').press('Shift+ArrowLeft');
    expect(await year(page)).toBe(1491);
    await page.locator('body').press('Space');
    await page.waitForTimeout(1200);
    await page.locator('body').press('Space');
    expect(await year(page)).toBeGreaterThan(1491);
    await page.locator('body').press('Home');
    expect(await year(page)).toBe(1000);
  });

  test('timeline slider supports keyboard and drag scrubbing', async ({ page }) => {
    await ready(page);
    const slider = page.getByRole('slider', { name: 'Historical year' });
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    const y = await year(page);
    expect(y).toBeGreaterThan(1700);
    expect(y).toBeLessThan(1800);
    await slider.focus();
    await slider.press('ArrowLeft');
    expect(await year(page)).toBe(y - 1);
  });

  test('playback duration and pacing options are selectable', async ({ page }) => {
    await ready(page);
    for (const d of ['2 min', '5 min', '10 min', '3 min']) {
      await page.getByRole('button', { name: d, exact: true }).click();
      await expect(page.getByRole('button', { name: d, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await page.getByRole('button', { name: 'Chronological' }).click();
    await expect(page.getByRole('button', { name: 'Chronological' })).toHaveAttribute('aria-pressed', 'true');
    const d = await page.evaluate(() => (window as unknown as { __castleMap: { playback: { duration: number } } }).__castleMap.playback.duration);
    expect(d).toBe(180_000);
  });

  test('heatmap modes, frontiers view and about page', async ({ page }) => {
    await ready(page, '/?y=1700');
    await nav(page, 'Heatmap');
    for (const m of ['frequency', 'fading', 'recent', 'cumulative']) {
      await page.getByTestId(`heat-${m}`).check();
      await page.waitForTimeout(200);
    }
    await nav(page, /Frontiers/);
    await expect(page.getByTestId('frontiers-note')).toContainText('does not show that fighting caused a boundary');
    await nav(page, 'About');
    await page.getByRole('tab', { name: 'Sources & licences' }).click();
    await expect(page.getByTestId('about-modal')).toContainText('Historic England');
    await expect(page.getByTestId('about-modal')).toContainText('OpenStreetMap contributors');
  });

  test('unknown casualties are labelled unknown, not zero', async ({ page }) => {
    await ready(page, '/?y=1070&sel=e:evt-hastings-1066');
    await expect(page.getByTestId('info-panel')).toContainText('unknown');
    await expect(page.getByTestId('info-panel')).not.toContainText('Killed0');
  });
});

test.describe('touch', () => {
  test('tapping a castle opens its record on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
    await ready(page, '/?y=1400&c=-3.8256,53.2801&z=11');
    const pt = await page.evaluate(() => {
      const w = window as unknown as { __castleMap: Ctl };
      return w.__castleMap.ctrl.map.project(w.__castleMap.data.castleById.get('castle-conwy')!.coord);
    });
    await page.touchscreen.tap(pt.x, pt.y - 2);
    await expect(page.getByTestId('info-panel')).toContainText('Conwy Castle');
  });
});
