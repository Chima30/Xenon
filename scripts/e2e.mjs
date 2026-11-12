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
      sessionStorage.clear();
      localStorage.setItem('cinema-skin:v1:view-prefs', JSON.stringify({ dockLayout: l, ...extra }));
    },
    [layout, extraPrefs],
  );
  await page.goto(`${BASE}/#/watch/${film}`);
  await page.waitForSelector('.cs-root');
  await page.addStyleTag({ content: '.bench-frame{transition:none!important}' });
  await page.waitForTimeout(800);
}
/** The Test Lab is folded away below the player; open it before using its controls. */
async function openLab() {
  const t = page.locator('.lab-toggle');
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
}
/** Wake the resting controls: a real pointer movement, even if the pointer is already there. */
async function wake(x = 700, y = 400) {
  await page.mouse.move(x - 7, y - 5);
  await page.mouse.move(x, y);
  await page.waitForTimeout(150);
}
async function setSize(label) {
  await openLab();
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

/* ---------- 2. Page layout: the Test Lab lives below the player, folded ---------- */
await open('sintel');
const lab = await page.evaluate(() => {
  const frame = document.querySelector('.bench-frame').getBoundingClientRect();
  const labEl = document.querySelector('.lab');
  return {
    below: labEl.getBoundingClientRect().top >= frame.bottom - 1,
    folded: document.querySelector('.lab-toggle').getAttribute('aria-expanded') === 'false' && document.getElementById('lab-body').hidden,
    inSkin: !!document.querySelector('.cs-root .lab, .cs-root .bench'),
  };
});
check('XENON Test Lab sits below the player, folded, outside the skin', lab.below && lab.folded && !lab.inSkin, JSON.stringify(lab));

/* ---------- 3. Film-reactive light; switching films through the Optic ---------- */
const themeOf = () =>
  page.evaluate(() => {
    const r = document.querySelector('.cs-root');
    return {
      base: r.style.getPropertyValue('--cs-base'),
      accent: r.style.getPropertyValue('--cs-citron'),
      ink: r.style.getPropertyValue('--cs-film-ink'),
      page: document.documentElement.style.getPropertyValue('--page-base'),
      light: !!document.querySelector('.cs-atm-light'),
      hash: location.hash,
    };
  });
const sintel = await themeOf();
check('Sintel: plum, ember and ivory light the whole player and page', sintel.base === '#1a1119' && sintel.ink === '#f6eee2' && sintel.page === '#1a1119' && sintel.light, JSON.stringify(sintel));
await shot(page, 'theme-sintel');

await wake();
await page.locator('.cs-reel').click();
await page.waitForTimeout(600);
const drawer = await page.evaluate(() => {
  const rail = document.querySelector('.cs-rail');
  const cs = getComputedStyle(rail);
  return {
    open: document.querySelector('.cs-root').dataset.drawer === 'open',
    focus: document.activeElement?.getAttribute('aria-label') ?? '',
    glass: (cs.backdropFilter || cs.webkitBackdropFilter || '').includes('blur'),
  };
});
check('Reel handle opens the Optic as a glass drawer with focus on the films ring', drawer.open && /Films ring/.test(drawer.focus) && drawer.glass, JSON.stringify(drawer));
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
const preview = await page.evaluate(() => ({
  title: document.querySelector('.optic-title')?.textContent,
  primary: document.querySelector('.optic-primary')?.textContent,
  hash: location.hash,
}));
check('Turning the films ring previews Tears of Steel without switching', preview.title === 'Tears of Steel' && preview.primary === 'Play Tears of Steel' && preview.hash === '#/watch/sintel', JSON.stringify(preview));
await shot(page, 'optic-film-preview');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
const iris = await page.evaluate(() => !!document.querySelector('.cs-iris'));
await shot(page, 'iris');
await page.waitForTimeout(1600);
const tears = await themeOf();
check('Enter plays it: the Optical Iris runs and the light becomes Cyber Steel', iris && tears.hash === '#/watch/tears-of-steel' && tears.base === '#0a1322' && tears.ink === '#e7eef6', JSON.stringify({ iris, ...tears }));
check(
  'The iris is gone afterwards and focus is back on the reel handle',
  await page.evaluate(() => !document.querySelector('.cs-iris') && !document.querySelector('.cs-root').dataset.drawer && document.activeElement?.classList.contains('cs-reel')),
);
await shot(page, 'theme-tears');

/* ---------- 4. Playback, Pause Canvas strip, status announcer ---------- */
await page.locator('.cs-btn-play').first().click();
await page.waitForTimeout(3500);
const playing = await page.evaluate(() => ({ t: document.querySelector('video').currentTime, paused: document.querySelector('video').paused }));
check('Play starts real playback', !playing.paused && playing.t > 0.5, JSON.stringify(playing));
await page.keyboard.press('k');
await page.waitForTimeout(900);
const paused = await page.evaluate(() => {
  const stage = document.querySelector('.cs-stage').getBoundingClientRect();
  const strip = document.querySelector('.cs-pause-strip')?.getBoundingClientRect();
  const ann = document.querySelector('.cs-announcer');
  const a = ann.getBoundingClientRect();
  const stray = [...document.querySelectorAll('body *')]
    .filter((e) => e.children.length === 0 && /^(Playing|Paused)$/i.test(e.textContent.trim()))
    .filter((e) => e.getBoundingClientRect().width > 2 && !e.closest('.cs-announcer, .cs-pause'))
    .map((e) => e.className);
  return {
    strip: !!strip,
    coverage: strip ? Math.round(((strip.width * strip.height) / (stage.width * stage.height)) * 1000) / 10 : null,
    cards: !!document.querySelector('.cs-pause-card'),
    announcer: [a.width, a.height],
    stray,
  };
});
check('Pause Canvas is one small strip (under 6% of the frame), cards hidden until asked', paused.strip && paused.coverage < 6 && !paused.cards, JSON.stringify(paused));
check('Status announcer stays a 1×1 box; no stray "Playing"/"Paused" text', paused.announcer[0] <= 1 && paused.announcer[1] <= 1 && paused.stray.length === 0, JSON.stringify(paused));
await shot(page, 'pause-strip');
await page.locator('.cs-pause-btn[aria-expanded]').click();
await page.waitForTimeout(400);
check('Asking for scenes shows the neighbouring scene cards', (await page.locator('.cs-pause-card').count()) >= 1);
await shot(page, 'pause-more');
await page.locator('.cs-pause-close').click();
await page.waitForTimeout(200);
check('The strip can be dismissed at once', (await page.locator('.cs-pause').count()) === 0);

/* ---------- 5. Optic scene ring, Time Tether, Journey ---------- */
const t0 = await page.evaluate(() => document.querySelector('video').currentTime);
await wake();
await page.locator('button[aria-label="Scenes in the Optic"]').click();
await page.waitForTimeout(600);
const sceneFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
const aimed = await page.evaluate(() => ({
  text: document.activeElement?.getAttribute('aria-valuetext'),
  t: document.querySelector('video').currentTime,
}));
check('Scenes button opens the Optic on the scene ring; arrows aim without seeking', /Sections ring/.test(sceneFocus) && /^Section 3/.test(aimed.text ?? '') && Math.abs(aimed.t - t0) < 0.5, JSON.stringify({ sceneFocus, ...aimed }));
await shot(page, 'optic-scenes');
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
const tether = await page.evaluate(() => ({
  t: document.querySelector('video').currentTime,
  chip: document.querySelector('.cs-tether-chip')?.getAttribute('aria-label'),
  band: !!document.querySelector('.cs-tether-band'),
  diamond: !!document.querySelector('.cs-marker[data-kind="anchor"]'),
}));
check('Enter jumps; the Time Tether appears as a band, a diamond and a one-action chip', tether.t > 140 && tether.band && tether.diamond && /Return to where you were/.test(tether.chip ?? ''), JSON.stringify(tether));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// A second exploration through the lens, so the journey has three stops.
await page.locator('.cs-btn-play').first().focus();
await page.keyboard.press('t');
await page.waitForTimeout(300);
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await wake();
const journeyBtn = page.locator('.cs-journey-btn');
check('Journey Replay appears after more than one jump', (await journeyBtn.count()) === 1);
await journeyBtn.click();
await page.waitForTimeout(400);
const stops = await page.locator('.cs-journey-stop').count();
await shot(page, 'journey');
await page.locator('.cs-journey-stop').first().click();
await page.waitForTimeout(800);
const back = await page.evaluate(() => document.querySelector('video').currentTime);
check('Journey lists the stops; choosing the first goes back to where you started', stops >= 3 && Math.abs(back - t0) < 2, `stops ${stops}, t ${back.toFixed(1)} vs ${t0.toFixed(1)}`);
await page.keyboard.press('b');
await page.waitForTimeout(600);
const afterB = await page.evaluate(() => ({ t: document.querySelector('video').currentTime, chip: !!document.querySelector('.cs-tether-chip') }));
check('B returns along the Time Tether and releases it', Math.abs(afterB.t - t0) < 2 && !afterB.chip, JSON.stringify(afterB));

/* ---------- 6. Filmprint ---------- */
await page.waitForTimeout(6000);
const print = await page.evaluate(() => ({
  print: !!document.querySelector('.cs-filmprint'),
  slider: !!document.querySelector('.cs-timeslider [role="slider"], .cs-timeslider[role="slider"]'),
}));
check('Filmprint colours the strip from real stills (or the timeline stays a plain working slider)', print.slider, print.print ? 'filmprint drawn' : 'no filmprint: stills not readable, plain timeline');
await page.mouse.move(700, 600);
await page.locator('.cs-tl').hover();
await page.waitForTimeout(300);
await shot(page, 'filmprint');

/* ---------- 7. Keyboard: every visible control is reachable and shows focus ---------- */
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
check('Tab reaches the player controls with a visible focus ring on each', seen.size >= 10 && noRing.length === 0, `${seen.size} controls${noRing.length ? `; no ring: ${noRing.join(', ')}` : ''}`);
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
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('W opens the Optic, Escape closes it, focus returns', await page.evaluate(() => !document.querySelector('.cs-root').dataset.drawer && document.activeElement?.closest('.cs-root') !== null));

/* ---------- 8. Explore: the glass Optic column; small screens: a bottom sheet ---------- */
await wake();
await page.locator('.cs-seg-btn', { hasText: 'Explore' }).click();
await page.waitForTimeout(800);
const explore = await page.evaluate(() => {
  const rail = document.querySelector('.cs-rail');
  const cs = getComputedStyle(rail);
  const stage = document.querySelector('.cs-stage').getBoundingClientRect();
  const r = rail.getBoundingClientRect();
  return {
    glass: (cs.backdropFilter || '').includes('blur'),
    opaque: /rgb\(\d+, \d+, \d+\)$/.test(cs.backgroundColor) && cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
    beside: r.right <= stage.left + 1,
    optic: !!rail.querySelector('.optic'),
  };
});
check('Explore: the Optic sits beside the picture on glass, not a solid sidebar', explore.glass && !explore.opaque && explore.beside && explore.optic, JSON.stringify(explore));
await shot(page, 'explore-desktop');
await setSize('Phone');
await page.waitForTimeout(600);
const sheet = await page.evaluate(() => {
  const stage = document.querySelector('.cs-stage').getBoundingClientRect();
  const r = document.querySelector('.cs-rail').getBoundingClientRect();
  const root = document.querySelector('.cs-root');
  return { below: r.top >= stage.bottom - 1, overflowX: root.scrollWidth - root.clientWidth };
});
check('Phone: the Optic becomes a bottom sheet under the picture, never over it', sheet.below && sheet.overflowX <= 0, JSON.stringify(sheet));
await shot(page, 'explore-phone');
await setSize('Desktop');

/* ---------- 9. Memory capsules ---------- */
await page.locator('.cs-seg-btn', { hasText: 'My Atlas' }).click();
await page.waitForTimeout(600);
await page.locator('.atlas-primary').click();
await page.waitForTimeout(300);
const capsule = await page.evaluate(() => ({
  count: document.querySelectorAll('.capsule').length,
  film: document.querySelector('.capsule-film')?.textContent,
  time: document.querySelector('.capsule-time')?.textContent,
}));
check('Saving creates a memory capsule with film, scene and time', capsule.count >= 1 && /Big Buck Bunny/.test(capsule.film ?? '') && /Section/.test(capsule.film ?? ''), JSON.stringify(capsule));
await page.locator('.atlas-scope .cs-chip', { hasText: 'All films' }).click();
await page.waitForTimeout(200);
await shot(page, 'capsules');
await page.locator('.atlas-scope .cs-chip', { hasText: 'This film' }).click();
await page.locator('.atlas-peek').first().click();
await page.waitForTimeout(600);
check('Inspecting a capsule opens it in the Optic lens', await page.evaluate(() => document.querySelector('.optic-kicker')?.textContent === 'Saved moment'));
await page.keyboard.press('Escape');
await page.locator('.cs-seg-btn', { hasText: 'Watch' }).click();

/* ---------- 10. Layout audit with the Optic open on a phone ---------- */
await setSize('Phone');
await page.mouse.move(200, 400);
await page.locator('.cs-reel').click();
await page.waitForTimeout(500);
const phoneDrawer = await page.evaluate(() => {
  const stage = document.querySelector('.cs-stage').getBoundingClientRect();
  const r = document.querySelector('.cs-rail').getBoundingClientRect();
  return { below: r.top >= stage.bottom - 1 };
});
check('Phone: opening the Optic from the reel never covers the video or controls', phoneDrawer.below, JSON.stringify(phoneDrawer));
await page.keyboard.press('Escape');
await setSize('Desktop');

/* ---------- 11. Footage, contrast, motion, forced colours ---------- */
for (const label of ['Wash to White', 'Dark Footage']) {
  await openLab();
  await page.locator('.seg-btn', { hasText: label }).click();
  await wake();
  await page.waitForTimeout(300);
  const dock = await page.evaluate(() => {
    const row = getComputedStyle(document.querySelector('.cs-row'));
    const time = getComputedStyle(document.querySelector('.cs-time'));
    return { rowBg: row.backgroundColor, timeColor: time.color };
  });
  check(`${label}: controls keep their own backing over the footage`, dock.rowBg !== 'rgba(0, 0, 0, 0)', JSON.stringify(dock));
  await shot(page, `footage-${label.toLowerCase().replace(/\s+/g, '-')}`);
}
await page.locator('.seg-btn', { hasText: 'High Contrast Test' }).click();
await wake();
await page.waitForTimeout(300);
const hc = await page.evaluate(() => {
  const row = getComputedStyle(document.querySelector('.cs-row'));
  return { bg: row.backgroundColor, border: row.borderTopColor };
});
check('High contrast: the dock becomes solid black with a white border', hc.bg === 'rgb(0, 0, 0)' && hc.border === 'rgb(255, 255, 255)', JSON.stringify(hc));
await page.locator('.seg-btn', { hasText: 'Default' }).click();

await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
await page.waitForSelector('.cs-root');
await wake();
await page.locator('.cs-reel').click();
await page.waitForTimeout(300);
const motion = await page.evaluate(() => ({
  drawer: getComputedStyle(document.querySelector('.cs-rail')).animationName,
  light: getComputedStyle(document.querySelector('.cs-atm-light')).animationName,
}));
check('Reduced motion: no drawer animation and a still Lightfield', motion.drawer === 'none' && motion.light === 'none', JSON.stringify(motion));
await page.keyboard.press('Escape');
await page.emulateMedia({ reducedMotion: 'no-preference' });

await page.emulateMedia({ forcedColors: 'active' });
await page.reload();
await page.waitForSelector('.cs-root');
await wake();
await page.waitForTimeout(400);
const forced = await page.evaluate(() => {
  const btn = getComputedStyle(document.querySelector('.cs-row .cs-btn'));
  return { border: btn.borderTopStyle, print: getComputedStyle(document.querySelector('.cs-atm-light')).display };
});
check('Forced colours: controls keep visible borders; decorative light steps aside', forced.border !== 'none' && forced.print === 'none', JSON.stringify(forced));
await shot(page, 'forced-colors');
await page.emulateMedia({ forcedColors: 'none' });

/* ---------- 12. Big Buck Bunny, the skin-only embed and the studio ---------- */
await open('big-buck-bunny');
const bbb = await themeOf();
check('Big Buck Bunny: woodland green, soft gold and warm cream', bbb.base === '#0f1a11' && bbb.ink === '#f4ecd6', JSON.stringify(bbb));
await shot(page, 'theme-bunny');
await page.goto(`${BASE}/#/skin`);
await page.waitForSelector('.cs-root');
const embed = await page.evaluate(() => ({
  reel: !!document.querySelector('.cs-reel'),
  optic: !!document.querySelector('.optic'),
  base: document.querySelector('.cs-root').style.getPropertyValue('--cs-base'),
}));
check('Skin-only embed: no Optic without films or scenes, default palette', !embed.reel && !embed.optic && embed.base === '', JSON.stringify(embed));
await page.goto(`${BASE}/#/studio`);
await page.waitForSelector('.cs-root');
await page.locator('.studio-preset', { hasText: 'Hologram' }).click();
await page.waitForTimeout(1200);
const studio = await page.evaluate(() => getComputedStyle(document.querySelector('.cs-root')).getPropertyValue('--cs-citron'));
check('Skin Studio themes the live player through --media-accent-color', ['rgb(111, 214, 255)', '#6fd6ff'].includes(studio.trim().toLowerCase()), studio);

check('No uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
