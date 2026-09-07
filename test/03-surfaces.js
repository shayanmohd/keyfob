/* Keyfob: every screen in the conditions that break layouts.
   Run it four ways:
     node drive.js <url> 03-surfaces.js --out test/shots                  light
     ... --dark                                                          dark
     ... --dark --reduced-motion                                         animations off
     ... --dark --safe                                                   status and nav bar insets
   The prefix in the file name says which run it was. */
const seed = require('./seed');
module.exports = async ({ page, shot, wait, click, errors, log }) => {
  const sleep = wait;
  const argv = process.argv;
  const dark = argv.includes('--dark');
  const reduced = argv.includes('--reduced-motion');
  const safe = argv.includes('--safe');
  const tag = (safe ? 'safe' : reduced ? 'rm' : dark ? 'dark' : 'light') + '-';

  // headless shell reports dark by default, so the light pass has to say so out loud
  if (!dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  if (safe) {
    await page.evaluateOnNewDocument(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--sat', '48px');
        document.documentElement.style.setProperty('--sab', '34px');
      });
    });
  }
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(200);

  // onboarding first, with nothing stored
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await shot(tag + '01-onboard');
  await click('#obNext'); await sleep(500);
  await shot(tag + '02-onboard-2');

  // then a full plan
  const cards = await seed(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(600);
  await shot(tag + '03-plan');
  await page.evaluate(() => App.go('circle')); await sleep(500);
  await shot(tag + '04-circle');
  await page.evaluate(() => App.openGuardian(Store.plan().guardians[1].id)); await sleep(400);
  await shot(tag + '05-guardian');
  await page.evaluate(() => App.go('drill')); await sleep(400);
  await shot(tag + '06-drill');
  await page.evaluate(() => App.go('vault')); await sleep(400);
  await shot(tag + '07-vault');
  await page.evaluate(() => { App.renderThreat(); App.show('threat'); }); await sleep(400);
  await shot(tag + '08-threat');
  await page.evaluate(() => { App.renderLetter(); App.show('letter'); }); await sleep(400);
  await shot(tag + '09-letter');
  await page.evaluate(() => App.startQuiz('full')); await sleep(400);
  await shot(tag + '10-quiz');

  // the ceremony
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startBuild('new'); await sleep(150);
    document.querySelector('#fGo').click(); await sleep(150);
    document.querySelector('#practiceBtn').click(); await sleep(250);
  });
  await sleep(300);
  await shot(tag + '11-phrase');
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#fGo').click(); await sleep(200);
  });
  await sleep(300);
  await shot(tag + '12-shape');
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#fGo').click(); await sleep(150);
    const NAMES = ['Tomas Adeyemi', 'Priya Nair', 'Dad', 'Ellen Okoro', 'Bank box, Halifax'];
    for (let i = 0; i < 5; i++) {
      const a = document.querySelector('#pn' + i);
      a.value = NAMES[i]; a.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(150);
    document.querySelector('#fGo').click(); await sleep(250);
    const right = Content.QUIZ.map(q => q.a.filter(x => x.ok)[0].t);
    for (let r = 0; r < 6; r++) {
      const o = [...document.querySelectorAll('#buildBody .opt:not([disabled])')]
        .filter(x => right.indexOf(x.textContent) >= 0)[0];
      if (!o) break; o.click(); await sleep(180);
    }
  });
  await sleep(300);
  await shot(tag + '13-check');
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#fGo').click(); await sleep(400);
    const rv = document.querySelector('#cardReveal'); if (rv) rv.click();
  });
  await sleep(400);
  await shot(tag + '14-card');

  // gathering
  await page.evaluate(() => { App.go('plan'); });
  await sleep(200);
  const cards2 = await seed(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await page.evaluate(async (cards) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startGather('drill-self'); await sleep(300);
    const fill = ws => {
      const ins = [...document.querySelectorAll('#gGridHost .wg-in')];
      ins.forEach((el, i) => { el.value = ws[i] || ''; });
      ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    };
    fill(cards[0]); await sleep(250);
    document.querySelector('#gAdd').click(); await sleep(250);
    fill(cards[2]); await sleep(250);
  }, cards2);
  await sleep(400);
  await shot(tag + '15-gather');
  await page.evaluate(async (cards) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#gAdd').click(); await sleep(250);
    const ins = [...document.querySelectorAll('#gGridHost .wg-in')];
    ins.forEach((el, i) => { el.value = cards[4][i] || ''; });
    ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(250);
    document.querySelector('#gAdd').click(); await sleep(250);
    document.querySelector('#gGo').click(); await sleep(500);
  }, cards2);
  await sleep(400);
  await shot(tag + '16-drill-done');

  if (safe) {
    const bad = await page.evaluate(() => {
      const sat = 48, sab = 34;
      const out = [];
      const bar = document.querySelector('.screen:not([hidden]) .bar');
      if (bar) { const r = bar.getBoundingClientRect(); if (r.top < 0) out.push('bar above the viewport'); }
      const tabs = document.querySelector('#tabs');
      if (tabs && !tabs.hidden) {
        const r = tabs.getBoundingClientRect();
        if (Math.round(window.innerHeight - r.bottom) !== 0) out.push('tab bar not flush');
        if (r.height < 58 + sab - 1) out.push('tab bar too short for the nav inset: ' + r.height);
      }
      return out;
    });
    log('safe area findings: ' + (bad.length ? bad.join('; ') : 'none'));
  }
  log('console errors: ' + errors.length);
  if (errors.length) throw new Error('page errored');
};
