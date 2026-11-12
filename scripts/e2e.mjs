/**
 * Real-browser checks for the XENON demo, driven through an installed Chrome or Edge (playwright-core, no browser
 * download). Start the dev server first, then:
 *
 *   node scripts/e2e.mjs [baseUrl] [screenshotDir]
 *
 * It exercises every dock layout at every bench size, film switching and the film-reactive theme, the Pause Canvas,
 * the Time Lens, the navigation wheel (drawer, Explore column, sheet), the Precision Playback Pod, the edge lens,
 * the Film Slate and tail slate, the Photon Frame, keyboard focus, Escape handling, the status announcer and an
 * axe-core WCAG audit.
 * Exit code 1 when any check fails.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

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
    const btns = [...r.querySelectorAll('.cs-bottom button, .cs-pod button, .cs-top button, .cs-reel')].filter(visible);
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
    const playButtons = r.querySelectorAll('.cs-pod-play').length;
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

/* ---------- 3. Film-reactive light; switching films through the navigation wheel ---------- */
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
    wheel: !!rail.querySelector('.wheel[data-layout="arc"] .wheel-gate'),
    heading: rail.querySelector('.cs-rail-title')?.textContent.trim(),
    face: rail.querySelector('.rail-tab[aria-pressed="true"]')?.textContent.trim(),
  };
});
check(
  'Reel handle opens the curved Movies wheel as a glass drawer, focus on the film in the gate',
  drawer.open && /^Sintel.*Now showing/.test(drawer.focus) && drawer.glass && drawer.wheel && drawer.heading === 'Navigate' && /^Movies/.test(drawer.face ?? ''),
  JSON.stringify(drawer),
);
await page.keyboard.press('ArrowDown');
await page.waitForFunction(() => getComputedStyle(document.querySelector('.wheel')).getPropertyValue('--wheel-h').trim() === '1.0000', null, { timeout: 3000 }).catch(() => {});
const preview = await page.evaluate(() => ({
  title: document.querySelector('.rail-detail h2')?.textContent,
  primary: document.querySelector('.rail-primary')?.textContent,
  pos: getComputedStyle(document.querySelector('.wheel')).getPropertyValue('--wheel-h').trim(),
  hash: location.hash,
}));
check(
  'Turning the wheel brings Tears of Steel into the gate and describes it, without switching',
  preview.title === 'Tears of Steel' && preview.primary === 'Play Tears of Steel' && preview.hash === '#/watch/sintel' && Number(preview.pos) === 1,
  JSON.stringify(preview),
);
await shot(page, 'wheel-film-preview');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check('Enter on the frame hands focus to the card action', await page.evaluate(() => document.activeElement?.textContent === 'Play Tears of Steel'));
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
const iris = await page.evaluate(() => !!document.querySelector('.cs-iris'));
await shot(page, 'iris');
await page.waitForTimeout(1600);
const tears = await themeOf();
check('Enter again plays it: the Optical Iris runs and the light becomes Cyber Steel', iris && tears.hash === '#/watch/tears-of-steel' && tears.base === '#0a1322' && tears.ink === '#e7eef6', JSON.stringify({ iris, ...tears }));
check(
  'The iris is gone afterwards and focus is back on the reel handle',
  await page.evaluate(() => !document.querySelector('.cs-iris') && !document.querySelector('.cs-root').dataset.drawer && document.activeElement?.classList.contains('cs-reel')),
);
await shot(page, 'theme-tears');

/* ---------- 4. Playback, Film Slate, status announcer ---------- */
// The wheel's Play means play: the new film starts on its own once it can.
await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime > 0.5, null, { timeout: 30000 }).catch(() => {});
const playing = await page.evaluate(() => ({ t: document.querySelector('video').currentTime, paused: document.querySelector('video').paused }));
check('Play on the wheel starts the new film for real (no second press)', !playing.paused && playing.t > 0.5, JSON.stringify(playing));
// The Pause Canvas waits for a second of real playback; streams can be slow to start.
await page.waitForFunction(() => document.querySelector('video').currentTime > 1.5, null, { timeout: 20000 }).catch(() => {});
await page.keyboard.press('k');
await page.waitForTimeout(900);
const paused = await page.evaluate(() => {
  const stage = document.querySelector('.cs-stage').getBoundingClientRect();
  const strip = document.querySelector('.cs-slate')?.getBoundingClientRect();
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
check('The Film Slate is small (under 6% of the frame), scene cards hidden until asked', paused.strip && paused.coverage < 6 && !paused.cards, JSON.stringify(paused));
check('Status announcer stays a 1×1 box; no stray "Playing"/"Paused" text', paused.announcer[0] <= 1 && paused.announcer[1] <= 1 && paused.stray.length === 0, JSON.stringify(paused));
await shot(page, 'pause-strip');
await page.locator('.cs-pause-btn[aria-expanded]').click();
await page.waitForTimeout(400);
check('Asking for scenes shows the neighbouring scene cards', (await page.locator('.cs-pause-card').count()) >= 1);
await shot(page, 'pause-more');
await page.locator('.cs-pause-close').click();
await page.waitForTimeout(200);
check('The strip can be dismissed at once', (await page.locator('.cs-pause').count()) === 0);

/* ---------- 5. Scenes face of the wheel, Time Tether, Journey ---------- */
const t0 = await page.evaluate(() => document.querySelector('video').currentTime);
await wake();
await page.locator('button[aria-label="Scenes on the navigation wheel"]').click();
await page.waitForTimeout(800);
const sceneFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(600);
const aimed = await page.evaluate(() => ({
  text: document.querySelector('.rail-detail h2')?.textContent,
  action: document.querySelector('.rail-primary')?.textContent,
  face: document.querySelector('.wheel')?.dataset.variant,
  t: document.querySelector('video').currentTime,
}));
check(
  'Scenes button opens the wheel on its Scenes face; arrows aim without seeking',
  /^Section 1 .*Now$/.test(sceneFocus) && aimed.face === 'scenes' && aimed.text === 'Section 3' && /^Jump to /.test(aimed.action ?? '') && Math.abs(aimed.t - t0) < 0.5,
  JSON.stringify({ sceneFocus, ...aimed }),
);
await shot(page, 'wheel-scenes');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
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
await page.locator('.cs-pod-play').first().focus();
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
await page.locator('.cs-pod-play').first().focus();
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
await page.locator('.cs-pod-play').first().focus();
await page.keyboard.press('w');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('W opens the navigation wheel, Escape closes it, focus returns', await page.evaluate(() => !document.querySelector('.cs-root').dataset.drawer && document.activeElement?.closest('.cs-root') !== null));

/* ---------- 8. Explore: the glass wheel column; small screens: a bottom sheet ---------- */
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
    wheel: !!rail.querySelector('.wheel'),
  };
});
check('Explore: the wheel sits beside the picture on glass, not a solid sidebar', explore.glass && !explore.opaque && explore.beside && explore.wheel, JSON.stringify(explore));
await shot(page, 'explore-desktop');
await setSize('Phone');
await page.waitForTimeout(600);
const sheet = await page.evaluate(() => {
  const stage = document.querySelector('.cs-stage').getBoundingClientRect();
  const r = document.querySelector('.cs-rail').getBoundingClientRect();
  const root = document.querySelector('.cs-root');
  return { below: r.top >= stage.bottom - 1, overflowX: root.scrollWidth - root.clientWidth };
});
check('Phone: the wheel becomes a sheet under the picture, never over it', sheet.below && sheet.overflowX <= 0, JSON.stringify(sheet));
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
check('Inspecting a capsule opens it on the wheel, described in the card', await page.evaluate(() => document.querySelector('.rail-detail .rail-kicker')?.textContent === 'Saved moment'));
await page.keyboard.press('Escape');
await page.locator('.cs-seg-btn', { hasText: 'Watch' }).click();

/* ---------- 10. Layout audit with the wheel open on a phone ---------- */
await setSize('Phone');
await page.mouse.move(200, 400);
await page.locator('.cs-reel').click();
await page.waitForTimeout(500);
const phoneDrawer = await page.evaluate(() => {
  const stage = document.querySelector('.cs-stage').getBoundingClientRect();
  const r = document.querySelector('.cs-rail').getBoundingClientRect();
  return { below: r.top >= stage.bottom - 1 };
});
check('Phone: opening the wheel from the reel never covers the video or controls', phoneDrawer.below, JSON.stringify(phoneDrawer));
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
  wheel: !!document.querySelector('.wheel'),
  base: document.querySelector('.cs-root').style.getPropertyValue('--cs-base'),
}));
check('Skin-only embed: no wheel without films or scenes, default palette', !embed.reel && !embed.wheel && embed.base === '', JSON.stringify(embed));
await page.goto(`${BASE}/#/studio`);
await page.waitForSelector('.cs-root');
await page.locator('.studio-preset', { hasText: 'Hologram' }).click();
await page.waitForTimeout(1200);
const studio = await page.evaluate(() => getComputedStyle(document.querySelector('.cs-root')).getPropertyValue('--cs-citron'));
check('Skin Studio themes the live player through --media-accent-color', ['rgb(111, 214, 255)', '#6fd6ff'].includes(studio.trim().toLowerCase()), studio);

/* ---------- 13. Navigation drawer: always the full instrument, never under the picture ---------- */
/** Open a film with chosen saved preferences (the reload-with-preferences path). */
async function openWith(film, storage) {
  await page.goto(`${BASE}/#/`);
  await page.evaluate((st) => {
    localStorage.clear();
    sessionStorage.clear();
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
  }, storage);
  await page.goto(`${BASE}/#/watch/${film}`);
  await page.waitForSelector('.cs-root');
  await page.addStyleTag({ content: '.bench-frame{transition:none!important}' });
  await page.waitForTimeout(800);
}
/** Where the rail and stage are, and whether the rail's title, card, gate frame and button are really on top. */
const railState = () =>
  page.evaluate(() => {
    const root = document.querySelector('.cs-root');
    const rail = document.querySelector('.cs-rail');
    if (root.dataset.drawer === 'open' || root.dataset.mode === 'explore') rail.scrollIntoView({ block: 'nearest' });
    const r = rail.getBoundingClientRect();
    const s = document.querySelector('.cs-stagewrap').getBoundingClientRect();
    /** Painted on top where it sits: reachable in the rail's own scroll, and not under the picture or anything else. */
    const on = (sel) => {
      const el = rail.querySelector(sel);
      if (!el) return null;
      if (getComputedStyle(el).visibility === 'hidden') return false;
      el.scrollIntoView({ block: 'nearest' });
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return false;
      const hit = document.elementFromPoint(b.left + Math.min(16, b.width / 2), b.top + Math.min(b.height / 2, 12));
      return !!hit && (el === hit || el.contains(hit));
    };
    const cs = getComputedStyle(rail);
    return {
      mode: root.dataset.mode,
      drawer: root.dataset.drawer ?? null,
      collapsed: root.dataset.rail === 'collapsed',
      railW: Math.round(r.width),
      railL: Math.round(r.left),
      railR: Math.round(r.right),
      railTop: Math.round(r.top),
      stageL: Math.round(s.left),
      stageW: Math.round(s.width),
      stageH: Math.round(s.height),
      stageBottom: Math.round(s.bottom),
      col: `${cs.gridColumnStart}/${cs.gridColumnEnd}`,
      pos: cs.position,
      title: on('.cs-rail-title'),
      card: on('.rail-detail h2'),
      gate: on('.wheel-item[data-highlight]'),
      button: on('.cs-rail-toggle'),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
const focusPod = () => page.locator('.cs-pod-play').first().focus();

await openWith('sintel', { 'cinema-skin:v1:wheel-collapsed': 'true' });
for (const size of ['Desktop', 'Tablet', 'Phone', 'Tiny']) {
  await setSize(size);
  await page.evaluate(() => window.scrollTo(0, 0));
  await wake();
  const before = await railState();
  await focusPod();
  await page.keyboard.press('w');
  await page.waitForTimeout(700);
  const d = await railState();
  const wide = d.stageW >= 761 || d.railTop < d.stageBottom - 1;
  const ok = wide
    ? d.drawer === 'open' && d.railW >= 370 && d.pos === 'absolute' && d.col === '2/auto' && d.railL === d.stageL && d.title && d.card && d.gate && d.button && d.stageW === before.stageW && d.stageH === before.stageH
    : d.drawer === 'open' && d.railTop >= d.stageBottom - 1 && d.railW >= d.stageW - 2 && d.title && d.card && d.button;
  check(
    `Drawer @ ${size} with the rail saved collapsed: ${wide ? 'full 380px overlay over the stage, title, card and frames on top, stage unmoved' : 'a sheet under the picture, title and card readable'}`,
    ok && d.overflowX <= 0,
    JSON.stringify(d),
  );
  await shot(page, `drawer-${size.toLowerCase()}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => ({
    drawer: document.querySelector('.cs-root').dataset.drawer ?? null,
    focus: document.activeElement?.className ?? '',
    inert: document.querySelector('.cs-rail').inert,
  }));
  check(`Drawer @ ${size}: Escape closes it, the rail goes inert and focus returns to its opener`, !after.drawer && after.inert && /cs-pod-play/.test(after.focus), JSON.stringify(after));
}
await setSize('Desktop');
await wake();
await page.locator('.cs-reel').click();
await page.waitForTimeout(600);
await page.locator('.cs-rail-toggle[aria-label="Close navigation"]').click();
await page.waitForTimeout(450);
check(
  'The drawer close button works and focus returns to the reel handle',
  await page.evaluate(() => !document.querySelector('.cs-root').dataset.drawer && document.activeElement?.classList.contains('cs-reel')),
);

/* ---------- 14. Explore: collapsed, expanded, reopened; mode switching; reload with saved preferences ---------- */
await wake();
const watchH = (await railState()).stageH;
await page.locator('.cs-seg-btn', { hasText: 'Explore' }).click();
await page.waitForTimeout(800);
const ex1 = await railState();
check(
  'Explore, saved collapsed: a 64px spine in its own column; the picture starts where it ends',
  ex1.railW === 64 && ex1.stageL === ex1.railR && ex1.title && ex1.card === false && ex1.pos === 'relative',
  JSON.stringify(ex1),
);
await page.locator('.cs-rail-toggle[aria-label="Expand navigation"]').click();
await page.waitForTimeout(800);
const ex2 = await railState();
check('Explore, expanded: 380px column beside the picture, title, wheel and card all visible', ex2.railW === 380 && ex2.stageL === ex2.railR && ex2.title && ex2.card && ex2.gate, JSON.stringify(ex2));
await shot(page, 'explore-expanded');
await page.locator('.cs-rail-toggle[aria-label="Collapse navigation"]').click();
await page.waitForTimeout(800);
const ex3 = await railState();
await page.locator('.cs-rail-toggle[aria-label="Expand navigation"]').click();
await page.waitForTimeout(800);
const ex4 = await railState();
check('Explore: collapse and reopen move between exactly 64px and 380px, never overlapping the picture', ex3.railW === 64 && ex4.railW === 380 && ex3.stageL === ex3.railR && ex4.stageL === ex4.railR, `${ex3.railW} → ${ex4.railW}`);
check('Wide players keep the same stage height in Watch and Explore (no jump)', ex1.stageH === watchH && ex2.stageH === watchH, `${watchH} / ${ex1.stageH} / ${ex2.stageH}`);
const stored = await page.evaluate(() => localStorage.getItem('cinema-skin:v1:wheel-collapsed'));
check('The expanded choice is saved', stored === 'false', String(stored));

let switching = true;
const trail = [];
for (let i = 0; i < 3; i++) {
  await page.locator('.cs-seg-btn', { hasText: 'Watch' }).click();
  await page.waitForTimeout(650);
  const w = await railState();
  await focusPod();
  await page.keyboard.press('w');
  await page.waitForTimeout(500);
  const dw = await railState();
  await page.locator('.cs-seg-btn', { hasText: 'Explore' }).click();
  await page.waitForTimeout(650);
  const e = await railState();
  trail.push(`${w.railW}/${dw.railW}/${e.railW}`);
  switching &&= w.railW === 0 && w.stageH === watchH && dw.drawer === 'open' && dw.railW >= 370 && e.drawer === null && e.railW === 380 && e.stageL === e.railR && e.stageH === watchH && e.overflowX <= 0;
}
check('Repeated Watch → drawer → Explore switching always lands in a valid layout', switching, trail.join(' | '));

await page.locator('.cs-rail-toggle[aria-label="Collapse navigation"]').click();
await page.waitForTimeout(500);
await page.reload();
await page.waitForSelector('.cs-root');
await page.waitForTimeout(900);
await wake();
await page.locator('.cs-seg-btn', { hasText: 'Explore' }).click();
await page.waitForTimeout(800);
const re1 = await railState();
await page.locator('.cs-seg-btn', { hasText: 'Watch' }).click();
await page.waitForTimeout(650);
await focusPod();
await page.keyboard.press('w');
await page.waitForTimeout(600);
const re2 = await railState();
check('After a reload the saved collapsed rail is restored, and the drawer still opens at full width', re1.collapsed && re1.railW === 64 && re2.railW >= 370 && re2.card && re2.title, `${re1.railW} / ${re2.railW}`);
await page.keyboard.press('Escape');

await open('tears-of-steel');
await wake();
await page.locator('.cs-reel').click();
await page.waitForTimeout(600);
check(
  'After switching films the wheel opens on the new film in the gate',
  await page.evaluate(() => /^Tears of Steel.*Now showing/.test(document.activeElement?.getAttribute('aria-label') ?? '') && document.querySelector('.rail-detail h2')?.textContent === 'Tears of Steel'),
);
await page.keyboard.press('Escape');

/* ---------- 15. Wheel motion in a real browser: scroll, drag, inertia, snapping, reduced motion ---------- */
await open('sintel');
await wake();
await page.locator('.cs-reel').click();
await page.waitForTimeout(600);
const wheelBox = await page.locator('.wheel').boundingBox();
const wheelH = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('.wheel')).getPropertyValue('--wheel-h')));
await page.mouse.move(wheelBox.x + wheelBox.width * 0.6, wheelBox.y + wheelBox.height / 2);
await page.mouse.wheel(0, 100);
await page.waitForTimeout(900);
const scrolled = { h: await wheelH(), title: await page.locator('.rail-detail h2').textContent() };
check('Scroll wheel turns one frame per notch and snaps exactly onto it', scrolled.h === 1 && scrolled.title === 'Tears of Steel', JSON.stringify(scrolled));
const gx = wheelBox.x + wheelBox.width * 0.7;
const gy = wheelBox.y + wheelBox.height / 2;
await page.mouse.move(gx, gy);
await page.mouse.down();
for (let i = 1; i <= 4; i++) await page.mouse.move(gx, gy + i * 11);
const mid = await wheelH();
await page.waitForTimeout(40);
for (let i = 5; i <= 12; i++) await page.mouse.move(gx, gy + i * 11, { steps: 1 });
await page.mouse.up();
const coasting = await wheelH();
await page.waitForTimeout(1100);
const settled = { h: await wheelH(), title: await page.locator('.rail-detail h2').textContent() };
check(
  'Drag follows the pointer continuously, then the wheel decelerates and snaps to the nearest frame',
  mid > 0.2 && mid < 0.9 && !Number.isInteger(coasting) && Number.isInteger(settled.h) && settled.h === 0 && settled.title === 'Sintel',
  JSON.stringify({ mid: mid.toFixed(3), coasting: coasting.toFixed(3), ...settled }),
);
await page.locator('.rail-tab', { hasText: 'Scenes' }).click();
await page.waitForTimeout(80);
const folding = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.wheel')).getPropertyValue('--wheel-fan')));
await page.waitForTimeout(700);
const face = await page.evaluate(() => ({
  variant: document.querySelector('.wheel').dataset.variant,
  fan: Number(getComputedStyle(document.querySelector('.wheel')).getPropertyValue('--wheel-fan')),
  index: getComputedStyle(document.querySelector('.rail-tabs'), '::before').animationName,
}));
check('Movies → Scenes folds the frames into the hub and fans the scenes out, with feedback on the switch', folding < 1 && face.variant === 'scenes' && face.fan === 1 && /rail-face/.test(face.index), JSON.stringify({ folding, ...face }));
await shot(page, 'wheel-scenes-face');
await page.keyboard.press('Escape');

await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
await page.waitForSelector('.cs-root');
await page.waitForTimeout(800);
await wake();
await page.locator('.cs-reel').click();
await page.waitForTimeout(400);
await page.keyboard.press('End');
await page.waitForTimeout(40);
const still = { h: await wheelH(), drawerAnim: await page.evaluate(() => getComputedStyle(document.querySelector('.cs-rail')).animationName) };
check('Reduced motion: selection is immediate (no spin) and the drawer does not slide', still.h === 2 && still.drawerAnim === 'none', JSON.stringify(still));
await page.keyboard.press('Escape');
await page.emulateMedia({ reducedMotion: 'no-preference' });

/* ---------- 16. Precision Playback Pod ---------- */
const media = () =>
  page.evaluate(() => {
    const v = document.querySelector('video');
    return { t: Math.round(v.currentTime * 1000) / 1000, d: v.duration, paused: v.paused };
  });
async function seekTo(t) {
  await page.evaluate(
    (t) =>
      new Promise((res) => {
        const v = document.querySelector('video');
        v.pause();
        v.addEventListener('seeked', () => res(), { once: true });
        v.currentTime = t;
      }),
    t,
  );
  await page.waitForTimeout(150);
}
await open('sintel');
await page.waitForFunction(() => document.querySelector('video').readyState >= 1 && document.querySelector('video').duration > 0, null, { timeout: 30000 });
await wake();
const podInfo = await page.evaluate(() => {
  const g = document.querySelector('.cs-pod');
  const btns = [...g.querySelectorAll('button')];
  const play = g.querySelector('.cs-pod-play').getBoundingClientRect();
  const [a, , c] = btns.map((b) => b.getBoundingClientRect());
  return {
    pods: document.querySelectorAll('.cs-pod').length,
    names: btns.map((b) => b.getAttribute('aria-label')),
    disc: Math.round(play.width),
    symmetric: Math.abs(a.width - c.width) < 1 && Math.abs(play.left - a.right - (c.left - play.right)) < 1,
    targets: btns.every((b) => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44),
    dial: !!document.querySelector('.cs-bezel, .cs-graduation-dial'),
    accent: getComputedStyle(g.querySelector('.cs-pod-play')).backgroundImage.includes('rgb(255, 159, 90)'),
  };
});
check(
  'Pod: one capsule (Rewind 10 seconds | Play | Forward 10 seconds), a 60–68px disc, symmetrical, 44px+ targets, no dial',
  podInfo.pods === 1 && podInfo.names[0] === 'Rewind 10 seconds' && podInfo.names[1] === 'Play' && podInfo.names[2] === 'Forward 10 seconds' && podInfo.disc >= 60 && podInfo.disc <= 68 && podInfo.symmetric && podInfo.targets && !podInfo.dial,
  JSON.stringify(podInfo),
);
check('Pod wears Sintel’s ember accent', podInfo.accent);
await shot(page, 'pod-sintel-paused');

await seekTo(100);
await page.locator('button[aria-label="Rewind 10 seconds"]').click();
await page.waitForTimeout(400);
const rw = { ...(await media()), chip: await page.locator('.cs-pod-confirm').textContent().catch(() => null) };
check('Rewind seeks exactly −10 s on the real video and confirms "−10 s"', Math.abs(rw.t - 90) < 0.05 && rw.chip === '−10 s', JSON.stringify(rw));
await shot(page, 'pod-rewind-feedback');
await page.locator('button[aria-label="Forward 10 seconds"]').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const fEnter = await media();
await page.keyboard.press('Space');
await page.waitForTimeout(400);
const fSpace = await media();
check('Keyboard: Enter and Space on Forward each seek exactly +10 s, once', Math.abs(fEnter.t - 100) < 0.05 && Math.abs(fSpace.t - 110) < 0.05 && fSpace.paused, `${fEnter.t} → ${fSpace.t}`);
const ring = await page.evaluate(() => {
  const cs = getComputedStyle(document.activeElement);
  return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
});
check('Pod buttons show a visible focus ring', ring);
await seekTo(4);
await page.locator('button[aria-label="Rewind 10 seconds"]').click();
await page.waitForTimeout(400);
const clampStart = { ...(await media()), chip: await page.locator('.cs-pod-confirm').textContent().catch(() => null) };
check('Rewind near the start is clamped to 0:00 and says "Start"', clampStart.t === 0 && clampStart.chip === 'Start', JSON.stringify(clampStart));
const dur = (await media()).d;
await seekTo(dur - 3);
await page.locator('button[aria-label="Forward 10 seconds"]').click();
await page.waitForTimeout(600);
const clampEnd = { ...(await media()), chip: await page.locator('.cs-pod-confirm').textContent().catch(() => null) };
check('Forward near the end is clamped to the end and says "End"', Math.abs(clampEnd.t - dur) < 0.3 && clampEnd.chip === 'End', JSON.stringify(clampEnd));

await seekTo(30);
await wake();
await page.locator('.cs-pod-play').click();
await page.waitForTimeout(60);
const lit = await page.evaluate(() => ({
  state: document.querySelector('.cs-pod').dataset.state,
  sweep: getComputedStyle(document.querySelector('.cs-pod-sweep')).animationName,
  label: document.querySelector('.cs-pod-play').getAttribute('aria-label'),
}));
await page.waitForTimeout(1500);
const playingNow = await media();
check('Play: playback starts at once, the ring lights once, the label becomes Pause', lit.state === 'playing' && lit.sweep === 'pod-sweep' && lit.label === 'Pause' && !playingNow.paused && playingNow.t > 30.5, JSON.stringify({ ...lit, ...playingNow }));
await page.mouse.move(5, 5);
await page.waitForTimeout(4500);
const idle = await page.evaluate(() => {
  const b = document.querySelector('.cs-pod-play').getBoundingClientRect();
  const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return { onPod: !!hit?.closest('.cs-pod'), opacity: getComputedStyle(document.querySelector('.cs-center')).opacity };
});
check('While playing and idle the pod fades out and never blocks a click on the picture', !idle.onPod && Number(idle.opacity) < 0.05, JSON.stringify(idle));
await wake();
await page.locator('.cs-pod-play').click();
await page.waitForTimeout(300);
check('Pause: the label returns to Play', await page.evaluate(() => document.querySelector('.cs-pod-play').getAttribute('aria-label') === 'Play' && document.querySelector('video').paused));

for (const [film, rgb] of [
  ['tears-of-steel', 'rgb(92, 211, 255)'],
  ['big-buck-bunny', 'rgb(232, 197, 111)'],
]) {
  await open(film);
  await wake();
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.cs-pod-play')).backgroundImage);
  check(`Pod follows ${film}’s palette`, bg.includes(rgb), bg.slice(0, 80));
  await shot(page, `pod-${film}`);
}

for (const size of ['Desktop', 'Tablet', 'Phone', 'Tiny']) {
  await setSize(size);
  await wake();
  const p = await page.evaluate(() => {
    const g = document.querySelector('.cs-pod');
    const stage = document.querySelector('.cs-stage').getBoundingClientRect();
    const r = g.getBoundingClientRect();
    return {
      inside: r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom,
      disc: Math.round(g.querySelector('.cs-pod-play').getBoundingClientRect().width),
      targets: [...g.querySelectorAll('button')].every((b) => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44),
    };
  });
  check(`Pod @ ${size}: inside the picture, 44px+ targets`, p.inside && p.targets, JSON.stringify(p));
  await shot(page, `pod-${size.toLowerCase()}`);
}
await setSize('Desktop');

// Touch: a phone-sized context with a touch screen.
const touchCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const tp = await touchCtx.newPage();
tp.on('pageerror', (e) => errors.push(String(e)));
await tp.goto(`${BASE}/#/`);
await tp.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await tp.goto(`${BASE}/#/watch/big-buck-bunny`);
await tp.waitForSelector('.cs-root');
await tp.waitForFunction(() => document.querySelector('video').readyState >= 1 && document.querySelector('video').duration > 0, null, { timeout: 30000 });
await tp.evaluate(
  () =>
    new Promise((res) => {
      const v = document.querySelector('video');
      v.pause();
      v.addEventListener('seeked', () => res(), { once: true });
      v.currentTime = 60;
    }),
);
await tp.locator('.cs-stage').tap({ position: { x: 20, y: 20 } });
await tp.waitForTimeout(300);
await tp.locator('button[aria-label="Forward 10 seconds"]').tap();
await tp.waitForTimeout(500);
const tapT = await tp.evaluate(() => Math.round(document.querySelector('video').currentTime * 1000) / 1000);
const tapTargets = await tp.evaluate(() => [...document.querySelectorAll('.cs-pod button')].map((b) => `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
check('Touch: tapping Forward seeks exactly +10 s; every pod target is at least 44px', Math.abs(tapT - 70) < 0.05 && tapTargets.every((s) => s.split('x').every((n) => Number(n) >= 44)), `${tapT}; ${tapTargets.join(', ')}`);
if (SHOTS) await tp.screenshot({ path: join(SHOTS, 'pod-touch-phone.png') });
await touchCtx.close();

/* ---------- 17. The Film Slate: XENON's pause ---------- */
await open('tears-of-steel');
await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 });
await seekTo(200);
await page.locator('.cs-pod-play').focus();
await page.waitForTimeout(1600);
const slate = await page.evaluate(() => {
  const s = document.querySelector('.cs-slate');
  const stick = document.querySelector('.cs-slate-stick');
  const stage = document.querySelector('.cs-stage').getBoundingClientRect();
  const b = s?.getBoundingClientRect();
  const fields = [...document.querySelectorAll('.cs-slate-fields > div')].map((d) => d.innerText.replace(/\s+/g, ' ').trim());
  return {
    slate: !!s,
    fields,
    frame: stick?.hasAttribute('data-frame'),
    swatches: (stick?.getAttribute('title') ?? '').match(/#[0-9a-f]{6}/g)?.length ?? 0,
    clap: getComputedStyle(stick).animationName,
    coverage: b ? Math.round(((b.width * b.height) / (stage.width * stage.height)) * 1000) / 10 : null,
    focusKept: document.activeElement?.classList.contains('cs-pod-play'),
    label: document.querySelector('.cs-pause')?.getAttribute('aria-label'),
  };
});
check(
  'Film Slate: chalked scene, time and time left; a clapstick painted with the paused frame’s own colours; under 6% of the frame; takes no focus',
  slate.slate && slate.fields.some((f) => /^Section 3/i.test(f)) && slate.fields.some((f) => /^Time 3:20$/i.test(f)) && slate.fields.some((f) => /^Left /i.test(f)) && slate.frame && slate.swatches >= 3 && slate.clap === 'cs-slate-clap' && slate.coverage < 6 && slate.focusKept && /Paused: Tears of Steel, 3:20/.test(slate.label ?? ''),
  JSON.stringify(slate),
);
await shot(page, 'film-slate');

/* ---------- 18. Edge lens: seek feedback for keys and double taps ---------- */
const lensState = () =>
  page.evaluate(() => {
    const l = document.querySelector('.cs-seeklens');
    const stage = document.querySelector('.cs-stage').getBoundingClientRect();
    const r = l?.getBoundingClientRect();
    return { lens: !!l, dir: l?.dataset.direction ?? null, text: l?.querySelector('.cs-seeklens-text')?.textContent ?? null, side: r ? (r.left - stage.left < stage.width / 2 ? 'left' : 'right') : null, t: Math.round(document.querySelector('video').currentTime * 1000) / 1000 };
  });
await page.keyboard.press('j');
await page.waitForTimeout(100);
await page.keyboard.press('j');
await page.waitForTimeout(150);
const lensBack = await lensState();
check('J twice: the edge lens rises on the left and reads "−20 s"; the video moved exactly 20 s', lensBack.lens && lensBack.dir === 'backward' && lensBack.side === 'left' && lensBack.text === '−20 s' && Math.abs(lensBack.t - 180) < 0.05, JSON.stringify(lensBack));
await shot(page, 'edge-lens-back');
await page.waitForTimeout(1300);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
const lensFwd = await lensState();
check('Arrow right: the lens rises on the right and reads "+10 s"', lensFwd.dir === 'forward' && lensFwd.side === 'right' && lensFwd.text === '+10 s' && Math.abs(lensFwd.t - 190) < 0.05, JSON.stringify(lensFwd));
await page.waitForTimeout(1300);
await seekTo(4);
await page.locator('.cs-pod-play').focus();
await page.keyboard.press('j');
await page.waitForTimeout(200);
const lensStart = await lensState();
check('A key seek clamped at the start says "Start"', lensStart.text === 'Start' && lensStart.t === 0, JSON.stringify(lensStart));
await page.waitForTimeout(1300);
await wake();
await page.locator('button[aria-label="Forward 10 seconds"]').click();
await page.waitForTimeout(150);
check('Pod presses confirm on the pod only: no edge lens as well', !(await lensState()).lens && (await page.locator('.cs-pod-confirm').count()) === 1);

/* ---------- 19. Tail slate: the end of the film ---------- */
const filmEnd = await page.evaluate(() => document.querySelector('video').duration);
await seekTo(filmEnd - 1.2);
await page.evaluate(() => document.querySelector('video').play());
await page.waitForFunction(() => document.querySelector('video').ended, null, { timeout: 20000 });
await page.waitForTimeout(900);
const tail = await page.evaluate(() => {
  const t = document.querySelector('.cs-tail');
  const stick = t?.querySelector('.cs-slate-stick');
  const board = t?.querySelector('.cs-slate-board')?.getBoundingClientRect();
  const sb = stick?.getBoundingClientRect();
  return {
    tail: !!t,
    next: t?.querySelector('.cs-tail-title')?.textContent,
    play: t?.querySelector('.cs-tail-play')?.textContent.trim(),
    stickBelow: !!(sb && board && sb.top >= board.bottom - 1),
    replayOnPod: document.querySelector('.cs-pod-play')?.getAttribute('aria-label') === 'Replay',
    replayDuplicated: [...(t?.querySelectorAll('button') ?? [])].some((b) => /replay/i.test(b.textContent)),
    toast: document.querySelector('.cs-toast')?.textContent,
  };
});
check(
  'Tail slate at the end: the next film on the wheel with an explicit Play, the stick held below, Replay left to the pod, the end announced',
  tail.tail && tail.next === 'Big Buck Bunny' && tail.play === 'Play Big Buck Bunny' && tail.stickBelow && tail.replayOnPod && !tail.replayDuplicated && /End of Tears of Steel/.test(tail.toast ?? ''),
  JSON.stringify(tail),
);
await shot(page, 'tail-slate');
await page.locator('.cs-tail-play').click();
await page.waitForFunction(() => location.hash === '#/watch/big-buck-bunny' && (document.querySelector('video')?.currentTime ?? 0) > 0.3 && !document.querySelector('video').paused, null, { timeout: 30000 }).catch(() => {});
const afterNext = await page.evaluate(() => ({ hash: location.hash, playing: !document.querySelector('video').paused, t: document.querySelector('video').currentTime }));
check('Play next switches to that film and starts it (nothing started before the press)', afterNext.hash === '#/watch/big-buck-bunny' && afterNext.playing, JSON.stringify(afterNext));

/* ---------- 20. Accessibility audit: axe-core, WCAG 2.2 AA, every main state ---------- */
const axeAudit = async (p, label) => {
  if (!(await p.evaluate(() => 'axe' in window))) await p.addScriptTag({ path: AXE_PATH });
  const v = await p.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('.cs-root'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
  });
  check(`axe WCAG 2.2 AA — ${label}: no violations`, v.length === 0, v.join(' | ').slice(0, 700));
};
await open('tears-of-steel');
await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 });
await seekTo(200);
await page.waitForTimeout(1500);
await wake();
await axeAudit(page, 'Watch, paused, Film Slate');
await page.locator('.cs-reel').click();
await page.waitForTimeout(700);
await axeAudit(page, 'navigation drawer');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await wake();
await page.locator('.cs-seg-btn', { hasText: 'Explore' }).click();
await page.waitForTimeout(900);
await axeAudit(page, 'Explore');
await page.locator('.cs-rail-toggle[aria-label="Collapse navigation"]').click();
await page.waitForTimeout(700);
await axeAudit(page, 'Explore, collapsed');
await page.locator('.cs-rail-toggle[aria-label="Expand navigation"]').click();
await page.locator('.cs-seg-btn', { hasText: 'My Atlas' }).click();
await page.waitForTimeout(900);
await axeAudit(page, 'My Atlas');
await page.locator('.cs-seg-btn', { hasText: 'Watch' }).click();
await page.waitForTimeout(600);
await wake();
await page.locator('button[aria-label="Settings"]').click();
await page.waitForTimeout(600);
await axeAudit(page, 'Settings panel');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('t');
await page.waitForTimeout(600);
await axeAudit(page, 'Time Lens');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('?');
await page.waitForTimeout(500);
await axeAudit(page, 'keyboard shortcuts dialog');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await seekTo(filmEnd - 1.2);
await page.evaluate(() => document.querySelector('video').play());
await page.waitForFunction(() => document.querySelector('video').ended, null, { timeout: 20000 });
await page.waitForTimeout(900);
await axeAudit(page, 'tail slate');
await setSize('Phone');
await page.mouse.move(200, 400);
await page.locator('.cs-reel').click();
await page.waitForTimeout(700);
await axeAudit(page, 'phone, navigation sheet');
await page.keyboard.press('Escape');
await setSize('Desktop');

/* ---------- 21. Double tap on a touch screen: the lens on the tapped side ---------- */
const tapCtx = await browser.newContext({ viewport: { width: 900, height: 900 }, hasTouch: true });
const tp2 = await tapCtx.newPage();
await tp2.goto(`${BASE}/#/`);
await tp2.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await tp2.goto(`${BASE}/#/watch/big-buck-bunny`);
await tp2.waitForSelector('.cs-root');
await tp2.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 });
await tp2.evaluate(
  () =>
    new Promise((res) => {
      const v = document.querySelector('video');
      v.pause();
      v.addEventListener('seeked', () => res(), { once: true });
      v.currentTime = 120;
    }),
);
await tp2.waitForTimeout(600);
// A point on the left of the picture that is bare video whether or not the controls are showing: below the
// top bar's full height (the first tap wakes it) and above the pause slate. Controls and the slate rightly
// ignore gestures, so a tap that lands on them is not a double tap.
const spot = await tp2.evaluate(() => {
  const r = document.querySelector('.cs-stage').getBoundingClientRect();
  const top = document.querySelector('.cs-top')?.getBoundingClientRect();
  const slate = document.querySelector('.cs-slate')?.getBoundingClientRect();
  const from = top ? top.bottom + 12 : r.top + r.height * 0.3;
  const to = slate ? slate.top - 12 : r.top + r.height * 0.7;
  return { x: r.left + r.width * 0.14, y: (from + to) / 2 };
});
await tp2.touchscreen.tap(spot.x, spot.y);
await tp2.waitForTimeout(90);
await tp2.touchscreen.tap(spot.x, spot.y);
await tp2.waitForTimeout(250);
const dbl = await tp2.evaluate(() => ({
  dir: document.querySelector('.cs-seeklens')?.dataset.direction ?? null,
  text: document.querySelector('.cs-seeklens-text')?.textContent ?? null,
  t: Math.round(document.querySelector('video').currentTime * 1000) / 1000,
}));
check('Double tap on the left of the picture: the lens says "−10 s" and the video moved back exactly 10 s', dbl.dir === 'backward' && dbl.text === '−10 s' && Math.abs(dbl.t - 110) < 0.05, JSON.stringify(dbl));
if (SHOTS) await tp2.screenshot({ path: join(SHOTS, 'edge-lens-doubletap.png') });
await tapCtx.close();


/* ---------- 22. Photon Frame: playing, paused, saved, Clear Frame, exploring, switching, fullscreen, sizes ---------- */
const frame = () =>
  page.evaluate(() => {
    const root = document.querySelector('.cs-root');
    const f = document.querySelector('.cs-photon');
    const c = f.querySelector('.cs-photon-corner');
    const cs = getComputedStyle(c);
    return {
      playback: root.dataset.playback,
      hidden: f.getAttribute('aria-hidden') === 'true' && getComputedStyle(f).pointerEvents === 'none',
      display: getComputedStyle(f).display,
      opacity: Number(cs.opacity),
      colour: cs.borderTopColor,
      animation: cs.animationName,
      flash: f.dataset.flash ?? null,
      accent: getComputedStyle(f).getPropertyValue('--pf-accent').trim(),
      transition: getComputedStyle(f).transitionProperty,
      arm: Math.round(c.getBoundingClientRect().width),
      lens: getComputedStyle(c.querySelector('.cs-photon-lens')).display,
    };
  });
await open('tears-of-steel');
await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 });
await page.evaluate(() => {
  const v = document.querySelector('video');
  v.currentTime = 150;
  return v.play();
});
await page.waitForTimeout(1200);
await wake();
// A cut while playing brightens the corners for its glint; sample the resting state, between glints.
await page.waitForFunction(() => !document.querySelector('.cs-photon').dataset.glint, null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(450);
const fPlay = await frame();
await page.mouse.move(5, 5);
await page.waitForTimeout(4300);
const fIdle = await frame();
check(
  'Photon Frame while playing: minimal corners (softer still when the controls rest), decorative only, no animation',
  fPlay.playback === 'playing' && fPlay.hidden && fPlay.opacity <= 0.5 && fIdle.opacity < 0.3 && fPlay.animation === 'none',
  JSON.stringify({ play: fPlay.opacity, idle: fIdle.opacity, hidden: fPlay.hidden }),
);
await page.evaluate(() => document.querySelector('video').pause());
await page.waitForTimeout(1600);
const fPause = await frame();
// Paused corners carry the frame's own key light, as the Lightmeter reads it (the film's accent if unreadable).
const keyLight = await page.evaluate(() => {
  const v = document.querySelector('.cs-root').style.getPropertyValue('--cs-light').trim();
  if (!v) return null;
  const n = parseInt(v.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
});
check(
  'Paused: the optical corners light in turn (pause-to-freeze) in the frame’s own key light and stay lit; the Film Slate appears',
  fPause.playback === 'paused' && fPause.animation === 'pf-freeze' && fPause.opacity > 0.9 && fPause.colour === (keyLight ?? 'rgb(92, 211, 255)') && (await page.locator('.cs-slate').count()) === 1,
  JSON.stringify({ ...fPause, keyLight }),
);
await shot(page, 'photon-paused');
await wake();
await page.locator('.cs-slate button[aria-label="Save this moment"]').click();
await page.waitForTimeout(420);
const fSaved = await frame();
await page.waitForTimeout(1000);
const fAfter = await frame();
check(
  'Saving a moment pulses the frame in the Moment Atlas lavender, then returns to the film’s colour',
  fSaved.flash !== null && fSaved.colour === 'rgb(173, 160, 248)' && fAfter.flash === null && fAfter.colour === (keyLight ?? 'rgb(92, 211, 255)'),
  `${fSaved.colour} → ${fAfter.colour}`,
);
await page.locator('.cs-pod-play').focus();
await page.keyboard.press('x');
await page.waitForTimeout(300);
const cleared = await page.evaluate(() => ({
  slate: !!document.querySelector('.cs-slate'),
  focus: document.activeElement?.classList.contains('cs-pod-play'),
  controls: ['Play', 'Rewind 10 seconds', 'Forward 10 seconds', 'Settings'].every((n) => document.querySelector(`button[aria-label="${n}"]`)),
  toast: document.querySelector('.cs-toast')?.textContent,
  corners: Number(getComputedStyle(document.querySelector('.cs-photon-corner')).opacity),
}));
await page.keyboard.press('x');
await page.waitForTimeout(300);
const restored = await page.locator('.cs-slate').count();
check(
  'Clear Frame (X): the pause information goes, playback controls stay reachable with focus on the pod; X brings it back',
  !cleared.slate && cleared.focus && cleared.controls && /Frame cleared/.test(cleared.toast ?? '') && cleared.corners > 0.9 && restored === 1,
  JSON.stringify(cleared),
);
await wake();
await page.locator('.cs-slate .cs-pause-close').click();
await page.waitForTimeout(250);
check(
  'The slate’s own "Clear frame" button does the same',
  (await page.locator('.cs-slate').count()) === 0 && (await page.locator('button[aria-label="Clear frame: hide the pause information"]').count()) === 0,
);
await page.keyboard.press('x');
await wake();
await page.locator('.cs-seg-btn', { hasText: 'Explore' }).click();
await page.waitForTimeout(900);
const couple = await page.evaluate(() => {
  const c = document.querySelector('.wheel-coupler');
  const r = c.getBoundingClientRect();
  const rail = document.querySelector('.cs-rail').getBoundingClientRect();
  const gate = document.querySelector('.wheel-gate').getBoundingClientRect();
  return { shown: getComputedStyle(c).display, toSeam: Math.abs(r.right - rail.right) <= 1, fromGate: r.left >= gate.right - 1, atGate: Math.abs(r.top - (gate.top + gate.height / 2)) <= 2, seam: getComputedStyle(document.querySelector('.cs-rail')).boxShadow };
});
await page.locator('.wheel-item[tabindex="0"]').focus();
// Mark the current coupler; a new selection mounts a fresh one whose pulse is running.
const couplerBefore = await page.evaluate(() => {
  const c = document.querySelector('.wheel-coupler');
  c.dataset.old = '1';
  return c.getAnimations().length;
});
await page.keyboard.press('ArrowDown');
const replayed = await page
  .waitForFunction(() => {
    const c = document.querySelector('.wheel-coupler');
    return !!c && !c.dataset.old && c.getAnimations().some((a) => a.animationName === 'wheel-couple');
  }, null, { timeout: 2000, polling: 16 })
  .then(() => true)
  .catch(() => false);
check(
  'Exploring: a coupler runs from the wheel’s gate to the lit seam with the picture, and pulses once per new selection',
  couple.shown === 'block' && couple.toSeam && couple.fromGate && couple.atGate && /rgb|color/.test(couple.seam) && replayed,
  JSON.stringify({ ...couple, couplerBefore, replayed }),
);
await shot(page, 'photon-explore');
await page.locator('.cs-seg-btn', { hasText: 'Watch' }).click();
await page.waitForTimeout(600);
await wake();
await page.locator('.cs-reel').click();
await page.waitForTimeout(500);
await page.keyboard.press('End');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForFunction(() => location.hash === '#/watch/big-buck-bunny', null, { timeout: 10000 });
await page.waitForTimeout(250);
const fMid = await frame();
await page.waitForTimeout(1500);
const fDone = await frame();
check(
  'Switching films glides the frame’s colours to the new palette instead of snapping',
  /--pf-accent/.test(fDone.transition) && fDone.accent === 'rgb(232, 197, 111)' && fMid.accent !== fDone.accent,
  `${fMid.accent} → ${fDone.accent}`,
);
await page.locator('.cs-pod-play').focus().catch(() => {});
await page.keyboard.press('f');
await page.waitForTimeout(700);
const fFull = { fs: await page.evaluate(() => !!document.fullscreenElement), ...(await frame()) };
await page.keyboard.press('f');
await page.waitForTimeout(500);
check('Fullscreen: the decorative frame steps aside for the picture', fFull.fs && fFull.display === 'none', JSON.stringify({ fs: fFull.fs, display: fFull.display }));
for (const [size, arm, lens] of [
  ['Desktop', 46, 'block'],
  ['Tablet', 46, 'block'],
  ['Phone', 24, 'none'],
  ['Tiny', 16, 'none'],
]) {
  await setSize(size);
  await wake();
  const f = await frame();
  const clicks = await page.evaluate(() => {
    const r = document.querySelector('.cs-root').getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 6, r.top + 6);
    return !hit?.closest('.cs-photon');
  });
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`Photon Frame @ ${size}: ${arm}px corners${lens === 'none' ? ', simplified (no lens)' : ' with lens markers'}; never takes a click; no overflow`, f.arm === arm && f.lens === lens && clicks && ox <= 0, JSON.stringify({ arm: f.arm, lens: f.lens, clicks, ox }));
  await shot(page, `photon-${size.toLowerCase()}`);
}
await setSize('Desktop');
await openLab();
await page.locator('.seg-btn', { hasText: 'High Contrast Test' }).click();
await page.waitForTimeout(300);
const fHc = await page.evaluate(() => ({ corner: getComputedStyle(document.querySelector('.cs-photon-corner')).borderTopColor, rim: getComputedStyle(document.querySelector('.cs-photon-rim')).backgroundColor }));
check('High contrast: the frame is plain white, no glow', fHc.corner === 'rgb(255, 255, 255)' && fHc.rim === 'rgb(255, 255, 255)', JSON.stringify(fHc));
await page.locator('.seg-btn', { hasText: 'Default' }).click();
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.evaluate(() => document.querySelector('video').play());
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('video').pause());
await page.waitForTimeout(300);
const fStill = await frame();
check('Reduced motion: no pause-to-freeze animation, the corners simply light', fStill.playback === 'paused' && fStill.animation === 'none' && fStill.opacity > 0.9, JSON.stringify(fStill));
await page.emulateMedia({ reducedMotion: 'no-preference' });
await page.emulateMedia({ forcedColors: 'active' });
await page.waitForTimeout(200);
check('Forced colours: the decorative frame is withdrawn', (await frame()).display === 'none');
await page.emulateMedia({ forcedColors: 'none' });
const fontOk = await page.evaluate(() =>
  [...document.querySelectorAll('.cs-root button, .cs-root .cs-slate *, .cs-root .rail *, .cs-root .cs-time')].every((el) => /Space Grotesk/.test(getComputedStyle(el).fontFamily)),
);
check('Space Grotesk throughout the player chrome', fontOk);


/* ---------- 23. Lightmeter and the animated optical corners ---------- */
const meter = () =>
  page.evaluate(() => {
    const root = document.querySelector('.cs-root');
    const plate = document.querySelector('.cs-plate');
    const stage = document.querySelector('.cs-stage').getBoundingClientRect();
    const pr = plate.getBoundingClientRect();
    const corner = document.querySelector('.cs-photon-corner');
    return {
      reading: plate.dataset.reading,
      label: document.querySelector('.cs-lm').getAttribute('aria-label'),
      read: document.querySelector('.cs-lm-read').innerText.replace(/\s+/g, ' ').trim(),
      needle: parseFloat(document.querySelector('.cs-lm-needle')?.style.left ?? 'NaN'),
      scale: getComputedStyle(document.querySelector('.cs-lm-scale')).backgroundImage,
      light: root.style.getPropertyValue('--cs-light'),
      ap: Number(root.style.getPropertyValue('--pf-ap')),
      corner: getComputedStyle(corner).borderTopColor,
      glint: document.querySelector('.cs-photon').dataset.glint ?? null,
      glintAnim: getComputedStyle(corner, '::before').animationName,
      ratio: Math.round((stage.width / stage.height) * 1000) / 1000,
      plateH: Math.round(pr.height),
      below: pr.top >= stage.bottom - 1,
      display: getComputedStyle(plate).display,
    };
  });
await open('tears-of-steel');
await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 });
await seekTo(174);
await page.waitForFunction(() => document.querySelector('.cs-plate')?.dataset.reading === 'on', null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1300);
const warmRoom = await meter();
check(
  'Lightmeter: a 40px plate under a picture that stays exactly 16:9; it reads the real frame (exposure, warmth, colour temperature) and paints the scale with its tones',
  warmRoom.reading === 'on' && warmRoom.plateH === 40 && warmRoom.below && warmRoom.ratio === 1.778 && /^Light meter: [\u2212+]?\d\.\d EV, warm, \d{4} K$/.test(warmRoom.label ?? '') && /WARM \d{4} K/.test(warmRoom.read) && /linear-gradient/.test(warmRoom.scale) && warmRoom.needle > 0 && warmRoom.needle < 50,
  JSON.stringify(warmRoom),
);
check('The optical corners catch the frame\u2019s key light, and the lens irises open for a dark frame', warmRoom.light !== '' && warmRoom.ap > 0.7, JSON.stringify({ light: warmRoom.light, ap: warmRoom.ap, corner: warmRoom.corner }));
await shot(page, 'lightmeter-warm');
await seekTo(151);
const glinted = await page
  .waitForFunction(() => !!document.querySelector('.cs-photon')?.dataset.glint, null, { timeout: 3000, polling: 16 })
  .then(() => true)
  .catch(() => false);
const atCut = await meter();
await page.waitForTimeout(1600);
const blueStreet = await meter();
check(
  'A cut: one glint runs round the corner brackets, the needle glides to the new exposure and the corners turn to the new light',
  glinted && /pf-glint/.test(atCut.glintAnim) && blueStreet.glint === null && /COOL/.test(blueStreet.read) && blueStreet.needle < warmRoom.needle && blueStreet.light !== warmRoom.light && blueStreet.corner !== warmRoom.corner,
  JSON.stringify({ glinted, anim: atCut.glintAnim, read: blueStreet.read, needle: [warmRoom.needle, blueStreet.needle], corner: [warmRoom.corner, blueStreet.corner] }),
);
await shot(page, 'lightmeter-cool');
for (const [size, h, shown] of [
  ['Tablet', 40, 'grid'],
  ['Phone', 32, 'grid'],
  ['Tiny', 0, 'none'],
]) {
  await setSize(size);
  await page.waitForTimeout(300);
  const m = await meter();
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`Lightmeter @ ${size}: ${shown === 'none' ? 'withdrawn on the smallest player' : `${h}px plate, nothing overflows`}`, m.display === shown && m.plateH === h && ox <= 0, JSON.stringify({ display: m.display, h: m.plateH, read: m.read, ox }));
}
await setSize('Desktop');
await page.locator('.cs-pod-play').focus().catch(() => {});
await page.keyboard.press('f');
await page.waitForTimeout(700);
const fsMeter = await page.evaluate(() => ({ fs: !!document.fullscreenElement, plate: getComputedStyle(document.querySelector('.cs-plate')).display }));
await page.keyboard.press('f');
await page.waitForTimeout(500);
check('Fullscreen: the plate steps aside with the frame', fsMeter.fs && fsMeter.plate === 'none', JSON.stringify(fsMeter));
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
await page.waitForSelector('.cs-plate');
await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 });
await seekTo(174);
await page.waitForTimeout(900);
await seekTo(151);
await page.waitForTimeout(600);
const stillMeter = await page.evaluate(() => ({ glint: document.querySelector('.cs-photon').dataset.glint ?? null, needleTransition: getComputedStyle(document.querySelector('.cs-lm-needle')).transitionDuration }));
check('Reduced motion: no glint and no gliding needle; the readings simply change', stillMeter.glint === null && /^0s/.test(stillMeter.needleTransition), JSON.stringify(stillMeter));
await page.emulateMedia({ reducedMotion: 'no-preference' });
await axeAudit(page, 'Lightmeter plate');


/* ---------- 24. Spectral gradients ---------- */
const spectral = () =>
  page.evaluate(() => {
    const root = document.querySelector('.cs-root');
    const cs = getComputedStyle(root);
    const hex = (v) => {
      const m = v.match(/\d+/g);
      return m ? '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : v;
    };
    return {
      stops: [1, 2, 3, 4].map((i) => hex(cs.getPropertyValue(`--sg-${i}`).trim())),
      page: hex(getComputedStyle(document.documentElement).getPropertyValue('--page-sg-2').trim()),
      shell: cs.backgroundImage,
      dock: getComputedStyle(document.querySelector('.cs-row')).backgroundImage,
      video: getComputedStyle(document.querySelector('video')).filter + '|' + getComputedStyle(document.querySelector('video')).backgroundImage,
    };
  });
for (const [film, stops] of [
  ['sintel', ['#120d1d', '#463057', '#bf5b3f', '#f4b06b']],
  ['tears-of-steel', ['#071420', '#19445c', '#36a4bc', '#c5e6ef']],
  ['big-buck-bunny', ['#071c17', '#204a37', '#a47835', '#e2d78a']],
]) {
  await open(film);
  const s = await spectral();
  check(
    `Spectral gradients on ${film}: its four stops drive the layered shell, the dock and the page; the video is untouched`,
    stops.every((c, i) => s.stops[i] === c) && s.page === stops[1] && (s.shell.match(/gradient/g) ?? []).length >= 3 && (s.dock.match(/gradient/g) ?? []).length >= 3 && s.video === 'none|none',
    JSON.stringify(s.stops),
  );
  await shot(page, `spectral-${film}`);
}
await wake();
await page.locator('.cs-reel').click();
await page.waitForTimeout(500);
await page.keyboard.press('Home');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const xMid = (await spectral()).stops[1];
await page.waitForTimeout(1300);
const xEnd = (await spectral()).stops[1];
check('Switching films crossfades the spectrum (Bunny’s moss to Sintel’s plum) without reloading the player', xMid !== '#204a37' && xMid !== '#463057' && xEnd === '#463057', `${xMid} → ${xEnd}`);
await wake();
await page.locator('button[aria-label="Appearance settings"]').click();
await page.waitForTimeout(600);
const sgCard = page.getByRole('region', { name: 'Spectral gradients' });
await sgCard.getByRole('button', { name: 'Vivid' }).click();
await page.waitForTimeout(300);
await sgCard.getByRole('button', { name: 'My palette' }).click();
await page.waitForTimeout(200);
const controls = await sgCard.evaluate((el) => ({
  sliders: [...el.querySelectorAll('input[type="range"]')].map((i) => i.closest('label')?.textContent?.split(':')[0]),
  colours: el.querySelectorAll('input[type="color"]').length,
}));
await page.keyboard.press('Escape');
await page.reload();
await page.waitForSelector('.cs-root');
await page.waitForTimeout(600);
const kept = await page.evaluate(() => {
  const a = JSON.parse(localStorage.getItem('cinema-skin:v1:appearance') ?? '{}');
  const r = document.querySelector('.cs-root').style;
  return { preset: a.gradient?.preset, mode: a.gradient?.paletteMode, k: r.getPropertyValue('--sg-k'), alpha: r.getPropertyValue('--cs-panel-alpha') };
});
check(
  'Appearance Studio: presets, film or own palette with four colour stops, and sliders for intensity, ambient colour, direction, blur and panel transparency, saved across a reload',
  controls.colours === 4 && ['Gradient intensity', 'Ambient colour', 'Gradient direction', 'Background blur', 'Panel transparency'].every((n) => controls.sliders.includes(n)) && kept.mode === 'custom' && kept.k === '0.85' && kept.alpha === '0.8',
  JSON.stringify({ controls, kept }),
);
await openLab();
await page.locator('.seg-btn', { hasText: 'High Contrast Test' }).click();
await page.waitForTimeout(300);
const hcSurface = await page.evaluate(() => ({ shell: getComputedStyle(document.querySelector('.cs-root')).backgroundImage, dock: getComputedStyle(document.querySelector('.cs-row')).backgroundImage }));
check('High contrast: flat, opaque surfaces with no gradients', hcSurface.shell === 'none' && !/gradient/.test(hcSurface.dock), JSON.stringify(hcSurface));
await page.locator('.seg-btn', { hasText: 'Default' }).click();
await page.evaluate(() => localStorage.removeItem('cinema-skin:v1:appearance'));
await axeAudit(page, 'spectral surfaces');


/* ---------- 25. The movable pause console ---------- */
await open('tears-of-steel');
await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 });
await seekTo(174);
await page.waitForSelector('.cs-slate');
await page.waitForTimeout(500);
const slateAt = () =>
  page.evaluate(() => {
    const st = document.querySelector('.cs-stage').getBoundingClientRect();
    const s = document.querySelector('.cs-slate').getBoundingClientRect();
    const pod = document.querySelector('.cs-pod').getBoundingClientRect();
    const top = document.querySelector('.cs-top').getBoundingClientRect();
    const row = document.querySelector('.cs-row').getBoundingClientRect();
    return {
      x: Math.round(s.left - st.left),
      y: Math.round(s.top - st.top),
      clear: !(s.left < pod.right && s.right > pod.left && s.top < pod.bottom && s.bottom > pod.top) && s.top >= top.bottom && s.bottom <= row.top,
      t: document.querySelector('video').currentTime,
      saved: localStorage.getItem('cinema-skin:v1:slate-pos'),
    };
  });
const s0 = await slateAt();
const grip = await page.locator('.cs-slate-grip').boundingBox();
await page.mouse.move(grip.x + 10, grip.y + 10);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(grip.x + 10 + i * 80, grip.y + 10 - i * 30);
await page.mouse.up();
await page.waitForTimeout(200);
const s1 = await slateAt();
const podBox = await page.locator('.cs-pod').boundingBox();
const grip2 = await page.locator('.cs-slate-grip').boundingBox();
await page.mouse.move(grip2.x + 10, grip2.y + 10);
await page.mouse.down();
await page.mouse.move(podBox.x + 10, podBox.y + 10, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
const s2 = await slateAt();
check('Pause console: drag moves it, it settles clear of the pod, top bar and dock, and the place is saved', s1.x > s0.x + 300 && s1.clear && s2.clear && !!s2.saved, JSON.stringify({ s0, s1, s2 }));
await page.locator('.cs-slate-grip').focus();
// Left and down: the console has just settled below the pod, and up would put it back on the pod (refused).
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('Shift+ArrowDown');
await page.waitForTimeout(150);
const s3 = await slateAt();
check('Arrow keys on the grip move the console (16 px, Shift 64 px) without seeking the film', s3.x === s2.x - 16 && s3.y > s2.y && s3.clear && Math.abs(s3.t - s2.t) < 0.01, JSON.stringify({ s2, s3 }));
await page.reload();
await page.waitForSelector('.cs-root');
await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 });
await seekTo(174);
await page.waitForSelector('.cs-slate');
await page.waitForTimeout(500);
const s4 = await slateAt();
await page.locator('.cs-slate-grip').focus();
await page.keyboard.press('Home');
await page.waitForTimeout(150);
const s5 = await slateAt();
check('The place survives a reload; Home puts the console back and forgets the place', Math.abs(s4.x - s3.x) <= 1 && Math.abs(s4.y - s3.y) <= 1 && s5.x === s0.x && s5.y === s0.y && s5.saved === 'null', JSON.stringify({ s4, s5 }));
await axeAudit(page, 'movable pause console');

check('No uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
