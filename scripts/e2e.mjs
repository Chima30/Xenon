/**
 * Real-browser checks for the XENON demo, driven through an installed Chrome or Edge (playwright-core, no browser
 * download). Start the dev server first, then:
 *
 *   node scripts/e2e.mjs [baseUrl] [screenshotDir]
 *
 * It exercises every dock layout at every bench size, film switching and the film-reactive theme, the Pause Canvas,
 * the Time Lens, the Scene Dial, the wheel drawer, keyboard focus, Escape handling and the status announcer.
 * Exit code 1 when any check fails.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const shot = async (page, name) => {
  if (!SHOTS) return;
  const frame = page.locator('.bench-frame, .studio-frame, .cs-root').first();
  if (await frame.count()) await frame.screenshot({ path: join(SHOTS, `${name}.png`) });
  else await page.screenshot({ path: join(SHOTS, `${name}.png`) });
};

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|net::ERR|404/.test(m.text())) errors.push(m.text());
});

/** Open a film with a given dock layout and a clean slate of preferences. */
async function open(film, layout = 'floating', extraPrefs = {}) {
  await page.goto(`${BASE}/#/`);
  await page.evaluate(
    ([l, extra]) => {
      localStorage.clear();
      localStorage.setItem('cinema-skin:v1:view-prefs', JSON.stringify({ dockLayout: l, ...extra }));
    },
    [layout, extraPrefs],
  );
  await page.goto(`${BASE}/#/watch/${film}`);
  await page.waitForSelector('.cs-root');
  await page.addStyleTag({ content: '.bench-frame{transition:none!important}' });
  await page.waitForTimeout(800);
}
async function setSize(label) {
  await page.locator('.seg-btn', { hasText: label }).click();
  await page.waitForTimeout(500);
}

/** Layout audit: essentials present and inside the stage, nothing overlapping, no horizontal overflow. */
const audit = () =>
  page.evaluate(() => {
    const r = document.querySelector('.cs-root');
    const stage = r.querySelector('.cs-stage').getBoundingClientRect();
    const visible = (b) => {
      const cs = getComputedStyle(b);
      return b.offsetParent && cs.display !== 'none' && cs.visibility !== 'hidden';
    };
    const btns = [...r.querySelectorAll('.cs-bottom button, .cs-transport button, .cs-top button, .cs-reel')].filter(visible);
    const name = (b) => b.getAttribute('aria-label') || b.textContent.trim();
    const outside = btns
      .filter((b) => {
        const x = b.getBoundingClientRect();
        return x.right > stage.right + 1 || x.left < stage.left - 1 || x.bottom > stage.bottom + 1 || x.top < stage.top - 1;
      })
      .map(name);
    const overlaps = [];
    for (let i = 0; i < btns.length; i++)
      for (let j = i + 1; j < btns.length; j++) {
        const a = btns[i].getBoundingClientRect();
        const b = btns[j].getBoundingClientRect();
        if (btns[i].contains(btns[j]) || btns[j].contains(btns[i])) continue;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 3 && h > 3) overlaps.push(`${name(btns[i])} × ${name(btns[j])}`);
      }
    const names = btns.map(name);
    const has = (re) => names.some((n) => re.test(n));
    const playButtons = r.querySelectorAll('.cs-btn-play').length;
    return {
      tier: r.dataset.tier,
      width: Math.round(stage.width),
      essentials: has(/^(Play|Pause|Replay)$/) && has(/^(Mute|Unmute)$/) && has(/fullscreen/i) && !!r.querySelector('.cs-timeslider') && !!r.querySelector('.cs-time'),
      playButtons,
      overflowX: Math.max(r.scrollWidth - r.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      outside,
      overlaps,
    };
  });

/* ---------- 1. Layouts × sizes ---------- */
for (const layout of ['floating', 'compact', 'expanded']) {
  await open('big-buck-bunny', layout);
  for (const size of ['Desktop', 'Tablet', 'Phone', 'Tiny']) {
    await setSize(size);
    // Show the controls (they rest when idle).
    await page.mouse.move(700, 500);
    await page.waitForTimeout(250);
    const a = await audit();
    check(
      `${layout} @ ${size} (${a.width}px, ${a.tier}): essentials, one play button, no overlap, no overflow`,
      a.essentials && a.playButtons === 1 && a.outside.length === 0 && a.overlaps.length === 0 && a.overflowX <= 0,
      [a.outside.length ? `outside: ${a.outside.join(', ')}` : '', a.overlaps.length ? `overlaps: ${a.overlaps.join('; ')}` : '', a.overflowX > 0 ? `overflowX ${a.overflowX}` : '', a.playButtons !== 1 ? `${a.playButtons} play buttons` : '']
        .filter(Boolean)
        .join(' | '),
    );
    await shot(page, `layout-${layout}-${size.toLowerCase()}`);
  }
}

/* ---------- 2. Film switching, explicit Play, film-reactive theme ---------- */
await open('sintel');
const themeOf = () =>
  page.evaluate(() => {
    const r = document.querySelector('.cs-root');
    return {
      base: r.style.getPropertyValue('--cs-base'),
      accent: r.style.getPropertyValue('--cs-citron'),
      ink: r.style.getPropertyValue('--cs-film-ink'),
      page: document.documentElement.style.getPropertyValue('--page-base'),
      hash: location.hash,
    };
  });
const sintel = await themeOf();
check('Sintel wears Ember Fantasy (plum base, ember accent, ivory text)', sintel.base === '#1a1119' && sintel.ink === '#f6eee2' && sintel.page === '#1a1119', JSON.stringify(sintel));
await shot(page, 'theme-sintel');

await page.mouse.move(700, 500);
await page.locator('.cs-reel').click();
await page.waitForTimeout(500);
check('Reel handle opens the wheel drawer and moves focus into it', await page.evaluate(() => document.querySelector('.cs-root').dataset.drawer === 'open' && !!document.activeElement?.closest('.cs-rail')));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const previewTitle = await page.locator('.tp-title').textContent();
const stillSintel = (await themeOf()).hash;
check('Enter on a film opens a preview without switching', previewTitle === 'Tears of Steel' && stillSintel === '#/watch/sintel', `${previewTitle} / ${stillSintel}`);
await shot(page, 'film-preview');
await page.keyboard.press('Enter'); // focus is on "Play Tears of Steel"
await page.waitForTimeout(1500);
const tears = await themeOf();
check('Play switches the film; the theme becomes Cyber Steel', tears.hash === '#/watch/tears-of-steel' && tears.base === '#0a1322' && tears.accent.length > 0 && tears.page === '#0a1322', JSON.stringify(tears));
check(
  'Drawer closes after switching and focus returns to the reel handle',
  await page.evaluate(() => !document.querySelector('.cs-root').dataset.drawer && document.activeElement?.classList.contains('cs-reel')),
);
await shot(page, 'theme-tears');

/* ---------- 3. Playback, Pause Canvas and status announcer ---------- */
await page.locator('.cs-btn-play').first().click();
await page.waitForTimeout(3500);
const playing = await page.evaluate(() => {
  const v = document.querySelector('video');
  return { t: v.currentTime, paused: v.paused };
});
check('Play starts real playback', !playing.paused && playing.t > 0.5, JSON.stringify(playing));
await page.keyboard.press('k');
await page.waitForTimeout(900);
const paused = await page.evaluate(() => {
  const ann = document.querySelector('.cs-announcer');
  const r = ann.getBoundingClientRect();
  const stray = [...document.querySelectorAll('body *')]
    .filter((e) => e.children.length === 0 && /^(Playing|Paused)$/i.test(e.textContent.trim()))
    .filter((e) => e.getBoundingClientRect().width > 2 && !e.closest('.cs-announcer'))
    .map((e) => e.className);
  return {
    pausedNow: document.querySelector('video').paused,
    canvas: !!document.querySelector('.cs-pause:not([data-compact])'),
    announcerText: ann.textContent,
    announcerBox: [r.width, r.height],
    announcerRole: ann.getAttribute('role'),
    announcerDisplay: getComputedStyle(ann).display,
    stray,
  };
});
check('K pauses; the Pause Canvas appears', paused.pausedNow && paused.canvas);
check(
  'Status announcer says "Paused" for screen readers but occupies a 1×1 clipped box',
  paused.announcerRole === 'status' && paused.announcerBox[0] <= 1 && paused.announcerBox[1] <= 1 && paused.announcerDisplay !== 'none',
  JSON.stringify(paused),
);
check('No stray visible "Playing"/"Paused" text anywhere on the page', paused.stray.length === 0, paused.stray.join(', '));
await shot(page, 'pause-canvas');

/* ---------- 4. Time Lens ---------- */
const before = await page.evaluate(() => document.querySelector('video').currentTime);
await page.keyboard.press('t');
await page.waitForTimeout(300);
for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
const lens = await page.evaluate(() => ({
  open: !!document.querySelector('.cs-lens'),
  focus: document.activeElement?.classList.contains('cs-lens-strip'),
  value: Number(document.querySelector('.cs-lens-strip')?.getAttribute('aria-valuenow')),
  t: document.querySelector('video').currentTime,
}));
check('T opens the Time Lens with focus on its slider; arrows aim without seeking', lens.open && lens.focus && lens.value > before + 5 && Math.abs(lens.t - before) < 0.5, JSON.stringify(lens));
await shot(page, 'time-lens');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const jumped = await page.evaluate(() => ({ t: document.querySelector('video').currentTime, anchor: !!document.querySelector('.cs-marker[data-kind="anchor"]') }));
check('Enter in the lens jumps and leaves a Return Anchor', Math.abs(jumped.t - lens.value) < 1.5 && jumped.anchor, JSON.stringify(jumped));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closes the lens and returns focus', await page.evaluate(() => !document.querySelector('.cs-lens') && document.activeElement !== document.body));

/* ---------- 5. Scene Dial ---------- */
await page.mouse.move(700, 500);
await page.locator('button[aria-label="Scene dial"]').click();
await page.waitForTimeout(400);
const dialBefore = await page.evaluate(() => Number(document.querySelector('.cs-dial')?.getAttribute('aria-valuenow')));
await page.locator('.cs-dial').focus();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
const dialAfter = await page.evaluate(() => ({
  now: Number(document.querySelector('.cs-dial').getAttribute('aria-valuenow')),
  text: document.querySelector('.cs-dial').getAttribute('aria-valuetext'),
  t: document.querySelector('video').currentTime,
}));
check('Scene dial: arrows choose scenes without seeking', dialAfter.now === dialBefore + 2 && Math.abs(dialAfter.t - jumped.t) < 1, JSON.stringify({ dialBefore, ...dialAfter }));
await shot(page, 'scene-dial');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const dialJump = await page.evaluate(() => document.querySelector('video').currentTime);
check('Enter on the dial jumps to the chosen scene', dialJump > jumped.t + 30, `t=${dialJump.toFixed(1)}`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(
  'Escape closes the dial and returns focus to its button',
  await page.evaluate(() => !document.querySelector('.cs-dial') && document.activeElement?.getAttribute('aria-label') === 'Scene dial'),
);
await page.locator('.cs-btn[aria-label="Scene dial"]').click();
await page.locator('.cs-dial-switch button', { hasText: 'List' }).click();
check('The dial offers a conventional list alternative', (await page.locator('.cs-dial-list button').count()) >= 5);
await page.keyboard.press('Escape');

/* ---------- 6. Keyboard: every visible control is reachable and shows focus ---------- */
await open('big-buck-bunny');
await page.locator('.cs-btn-play').first().focus();
const seen = new Set();
const noRing = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  const f = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || !el.closest('.cs-root')) return null;
    const cs = getComputedStyle(el);
    return { name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 };
  });
  if (!f) break;
  seen.add(f.name);
  if (!f.ring) noRing.push(f.name);
}
check('Tab reaches the player controls with a visible focus ring on each', seen.size >= 12 && noRing.length === 0, `${seen.size} controls${noRing.length ? `; no ring: ${noRing.join(', ')}` : ''}`);
await page.keyboard.press('Shift+Tab');

await page.locator('button[aria-label="Settings"]').click();
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check(
  'Settings closes with Escape and focus returns to its button',
  await page.evaluate(() => !document.querySelector('.cs-panel') && document.activeElement?.getAttribute('aria-label') === 'Settings'),
);

await page.locator('.cs-btn-play').first().focus();
await page.keyboard.press('w');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('W opens the wheel, Escape closes it and focus lands on the reel', await page.evaluate(() => document.activeElement?.classList.contains('cs-reel')));

/* ---------- 6b. Explore and My Atlas keep the same video ---------- */
await page.mouse.move(700, 500);
const videoHandle = await page.evaluateHandle(() => document.querySelector('video'));
await page.locator('.cs-seg-btn', { hasText: 'Explore' }).click();
await page.waitForTimeout(700);
const explore = await page.evaluate((v) => ({
  same: document.querySelector('video') === v,
  railLive: !document.querySelector('.cs-rail').hasAttribute('inert'),
  wheel: document.querySelectorAll('.cs-rail .wheel-item').length,
  reel: !!document.querySelector('.cs-reel'),
}), videoHandle);
check('Explore shows the wheel column, hides the reel handle, keeps the same video element', explore.same && explore.railLive && explore.wheel >= 3 && !explore.reel, JSON.stringify(explore));
await shot(page, 'mode-explore');
await page.locator('.cs-seg-btn', { hasText: 'My Atlas' }).click();
await page.waitForTimeout(600);
const before2 = await page.locator('.atlas-card').count();
await page.locator('.atlas-primary').click();
await page.waitForTimeout(300);
const after2 = await page.locator('.atlas-card').count();
await page.locator('.atlas-peek').first().click();
await page.waitForTimeout(400);
const atlasPortal = await page.evaluate((v) => ({ portal: document.querySelector('.tp-kicker')?.textContent, same: document.querySelector('video') === v }), videoHandle);
check('My Atlas saves a moment and previews it in the Time Portal', after2 === before2 + 1 && /Saved moment/.test(atlasPortal.portal ?? '') && atlasPortal.same, JSON.stringify({ before2, after2, ...atlasPortal }));
await shot(page, 'mode-atlas');
await page.keyboard.press('Escape');
await page.locator('.cs-seg-btn', { hasText: 'Watch' }).click();

/* ---------- 6c. Time Lens on a phone-sized player ---------- */
await setSize('Phone');
await page.locator('.cs-btn-play').first().focus();
await page.keyboard.press('t');
await page.waitForTimeout(400);
const phoneLens = await page.evaluate(() => {
  const r = document.querySelector('.cs-root');
  const l = document.querySelector('.cs-lens')?.getBoundingClientRect();
  const st = r.querySelector('.cs-stage').getBoundingClientRect();
  return { open: !!l, inside: l ? l.left >= st.left - 1 && l.right <= st.right + 1 : false, overflowX: r.scrollWidth - r.clientWidth };
});
check('Time Lens fits a phone-sized player without overflow', phoneLens.open && phoneLens.inside && phoneLens.overflowX <= 0, JSON.stringify(phoneLens));
await shot(page, 'time-lens-phone');
await page.keyboard.press('Escape');
await setSize('Desktop');

/* ---------- 7. Reduced motion and high contrast ---------- */
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
await page.waitForSelector('.cs-root');
await page.locator('.cs-reel').click();
await page.waitForTimeout(300);
const motion = await page.evaluate(() => getComputedStyle(document.querySelector('.cs-rail')).animationName);
check('Reduced motion: the drawer opens without animation', motion === 'none', motion);
await page.keyboard.press('Escape');
await page.emulateMedia({ reducedMotion: 'no-preference' });

await page.locator('.seg-btn', { hasText: 'High Contrast Test' }).click();
await page.waitForTimeout(300);
await page.mouse.move(700, 500);
const hc = await page.evaluate(() => {
  const row = getComputedStyle(document.querySelector('.cs-row'));
  return { bg: row.backgroundColor, border: row.borderTopColor };
});
check('High contrast: the dock becomes solid black with a white border', hc.bg === 'rgb(0, 0, 0)' && hc.border === 'rgb(255, 255, 255)', JSON.stringify(hc));
await shot(page, 'high-contrast');

/* ---------- 8. Big Buck Bunny theme and the skin-only embed ---------- */
await open('big-buck-bunny');
const bbb = await themeOf();
check('Big Buck Bunny wears Woodland Cinema (forest base, cream text)', bbb.base === '#0e1a12' && bbb.ink === '#f3ebd5', JSON.stringify(bbb));
await page.goto(`${BASE}/#/skin`);
await page.waitForSelector('.cs-root');
const embed = await page.evaluate(() => ({
  reel: !!document.querySelector('.cs-reel'),
  dial: !!document.querySelector('button[aria-label="Scene dial"]'),
  base: document.querySelector('.cs-root').style.getPropertyValue('--cs-base'),
}));
check('Skin-only embed: no wheel, no dial (no scene data), default palette', !embed.reel && !embed.dial && embed.base === '', JSON.stringify(embed));

await page.goto(`${BASE}/#/studio`);
await page.waitForSelector('.cs-root');
await page.locator('.studio-preset', { hasText: 'Hologram' }).click();
await page.waitForTimeout(1200); // the accent cross-fades over 0.7s
const studio = await page.evaluate(() => getComputedStyle(document.querySelector('.cs-root')).getPropertyValue('--cs-citron'));
check('Skin Studio themes the live player through --media-accent-color', ['rgb(111, 214, 255)', '#6fd6ff'].includes(studio.trim().toLowerCase()), studio);
await shot(page, 'studio');

check('No uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
