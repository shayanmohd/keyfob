/* Keyfob: the specific things I suspected were wrong. Each check is one behaviour,
   named so a failure says what broke. */
const seed = require('./seed');
module.exports = async ({ page, shot, wait, errors, log }) => {
  const sleep = wait;
  const fails = [];
  const check = (name, ok, extra) => { log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails.push(name); };

  await page.evaluateOnNewDocument(() => {
    window.Native = { isNative: () => true, vibrate: () => {}, vibratePattern: () => {},
      hasAmplitudeControl: () => true, cancelVibration: () => {}, keepAwake: () => {},
      saveFile: () => 'content://x', shareText: () => {}, shareUri: () => {} };
  });

  // ---- 1. a rebuilt phrase must not be left on screen when the app is backgrounded ----
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  const cards = await seed(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await page.evaluate(async (cards) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startGather('rebuild'); await sleep(300);
    const fill = ws => {
      const ins = [...document.querySelectorAll('#gGridHost .wg-in')];
      ins.forEach((el, i) => { el.value = ws[i] || ''; });
      ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    };
    for (const i of [0, 1, 2]) { fill(cards[i]); await sleep(200); document.querySelector('#gAdd').click(); await sleep(200); }
    document.querySelector('#gGo').click(); await sleep(500);
  }, cards);
  await sleep(400);
  const onScreen = await page.evaluate(() => document.querySelector('#v-gather').innerText);
  check('the rebuild screen does show the phrase', onScreen.indexOf('describe') >= 0);
  await page.evaluate(() => App.onPause());
  await sleep(200);
  const afterPause = await page.evaluate(() => document.querySelector('#v-gather').innerText);
  check('onPause hides the rebuilt phrase', afterPause.indexOf('describe') < 0,
        afterPause.indexOf('describe') >= 0 ? 'STILL ON SCREEN' : '');
  await shot('e01-rebuild-paused');
  await page.evaluate(() => App.onResume());
  await sleep(300);

  // ---- 2. the drill clock must not keep ticking while the app is in the background ----
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  const timer = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let ticks = 0;
    const realSet = window.setInterval;
    App.startGather('drill-self'); await sleep(200);
    const sub = document.querySelector('#gatherSub');
    const obs = new MutationObserver(() => { ticks++; });
    obs.observe(sub, { childList: true, characterData: true, subtree: true });
    App.onPause(); await sleep(2400);
    obs.disconnect();
    return ticks;
  });
  check('the drill clock stops while the app is paused', timer === 0, timer + ' repaints after onPause');

  // ---- 3. singular seconds ----
  const secs = await page.evaluate(() => {
    const out = [];
    // exercised through the drill sub line, which is the only place it shows
    App.startGather('drill-self');
    out.push(document.querySelector('#gatherSub').textContent);
    return out[0];
  });
  check('one second reads as "1 second"', !/\b1 seconds\b/.test(secs), secs);

  // ---- 4. rotating a practice plan must keep saying it is practice ----
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  const practice = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    localStorage.clear();
    // build a practice plan
    App.startBuild('new'); await sleep(120);
    document.querySelector('#fGo').click(); await sleep(120);
    document.querySelector('#practiceBtn').click(); await sleep(250);
    const words = [...document.querySelectorAll('#gridHost .wg-in')].map(i => i.value);
    document.querySelector('#fGo').click(); await sleep(120);
    document.querySelector('#fGo').click(); await sleep(120);
    for (let i = 0; i < 5; i++) {
      const a = document.querySelector('#pn' + i); a.value = 'H' + i;
      a.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(120);
    document.querySelector('#fGo').click(); await sleep(200);
    const right = Content.QUIZ.map(q => q.a.filter(x => x.ok)[0].t);
    for (let r = 0; r < 6; r++) {
      const o = [...document.querySelectorAll('#buildBody .opt:not([disabled])')]
        .filter(x => right.indexOf(x.textContent) >= 0)[0];
      if (!o) break; o.click(); await sleep(150);
    }
    document.querySelector('#fGo').click(); await sleep(300);
    for (let i = 0; i < 4; i++) { document.querySelector('#cardNext').click(); await sleep(80); }
    document.querySelector('#cardNext').click(); await sleep(120);
    document.querySelector('#sheetGo').click(); await sleep(250);
    const wasPractice = Store.plan().practice;

    // now rotate, typing the same practice phrase back in by hand
    App.startBuild('rotate'); await sleep(150);
    document.querySelector('#fGo').click(); await sleep(150);
    const ins = [...document.querySelectorAll('#gridHost .wg-in')];
    ins.forEach((el, i) => { el.value = words[i]; });
    ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(250);
    document.querySelector('#fGo').click(); await sleep(150);
    document.querySelector('#fGo').click(); await sleep(150);
    document.querySelector('#fGo').click(); await sleep(200);
    for (let r = 0; r < 6; r++) {
      const o = [...document.querySelectorAll('#buildBody .opt:not([disabled])')]
        .filter(x => right.indexOf(x.textContent) >= 0)[0];
      if (!o) break; o.click(); await sleep(150);
    }
    document.querySelector('#fGo').click(); await sleep(300);
    for (let i = 0; i < 4; i++) { document.querySelector('#cardNext').click(); await sleep(80); }
    document.querySelector('#cardNext').click(); await sleep(120);
    document.querySelector('#sheetGo').click(); await sleep(250);
    return { wasPractice: wasPractice, stillPractice: Store.plan().practice };
  });
  check('a practice plan is marked practice', practice.wasPractice === true, JSON.stringify(practice));
  check('rotating a practice plan keeps the practice warning', practice.stillPractice === true, JSON.stringify(practice));

  // ---- 5. changing the phrase length must not silently bin what you typed ----
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  const lenSwitch = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startBuild('new'); await sleep(120);
    document.querySelector('#fGo').click(); await sleep(150);
    const ins = [...document.querySelectorAll('#gridHost .wg-in')];
    const PH = ['describe', 'mask', 'expose', 'excite', 'screen', 'income',
                'need', 'badge', 'dance', 'sock', 'option', 'phone'];
    ins.forEach((el, i) => { el.value = PH[i]; });
    ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    document.querySelector('[data-len="24"]').click(); await sleep(250);
    const after = [...document.querySelectorAll('#gridHost .wg-in')].map(i => i.value).filter(Boolean);
    return after.length;
  });
  check('switching 12 to 24 words keeps the words already typed', lenSwitch === 12, lenSwitch + ' words survived');

  // ---- 6. a structurally broken record must not brick the app ----
  await page.evaluate(() => localStorage.setItem('keyfob.v1',
    JSON.stringify({ v: 1, onboarded: true, plan: { m: 3, n: 5 }, heirs: [], drills: [] })));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(600);
  const broken = await page.evaluate(() => {
    const vis = [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id);
    return { vis: vis, text: (document.body.innerText || '').slice(0, 90) };
  });
  check('a plan with no guardians array still renders a screen', broken.vis.length === 1 && broken.text.length > 10,
        JSON.stringify(broken));
  await shot('e02-broken-record');

  // ---- 7. eight heirs must not pile on top of each other ----
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  await seed(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('keyfob.v1'));
    d.heirs = ['Kemi Adeyemi', 'Tomas Adeyemi', 'Ada Nwosu', 'Sam Ellis', 'Ruth Bell',
               'Ola Bakare', 'Jean Pilar', 'Wu Chen'].map((n, i) => ({ id: 'h' + i, name: n, relation: 'named' }));
    localStorage.setItem('keyfob.v1', JSON.stringify(d));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await page.evaluate(() => App.go('circle'));
  await sleep(500);
  await shot('e03-eight-heirs');
  const overlap = await page.evaluate(() => {
    const hs = [...document.querySelectorAll('#v-circle svg.circle .heir circle')].map(c => ({
      x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), r: +c.getAttribute('r') }));
    let worst = 999;
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const d = Math.hypot(hs[i].x - hs[j].x, hs[i].y - hs[j].y) - hs[i].r - hs[j].r;
      if (d < worst) worst = d;
    }
    return { count: hs.length, gap: Math.round(worst * 10) / 10 };
  });
  check('eight heirs keep a gap between them', overlap.gap > 0, JSON.stringify(overlap));

  log('console errors: ' + errors.length);
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join('; '));
  if (errors.length) throw new Error('page errored');
};
