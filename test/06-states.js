/* Keyfob: every state a card can be in, on the mark and on the circle, plus the
   screens that only appear when something has gone wrong. */
const seed = require('./seed');
module.exports = async ({ page, shot, wait, errors, log }) => {
  const sleep = wait;
  const fails = [];
  const check = (name, ok, extra) => { log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails.push(name); };

  // mixed: two confirmed, two unsure, one lost
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  await seed(page, { health: ['ok', 'unsure', 'ok', 'lost', 'unsure'] });
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('keyfob.v1'));
    d.plan.guardians[1].held = false;
    localStorage.setItem('keyfob.v1', JSON.stringify(d));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(700);
  await shot('s01-plan-mixed');
  await page.evaluate(() => App.go('circle')); await sleep(600);
  await shot('s02-circle-mixed');

  // a plan that can no longer be rebuilt
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('keyfob.v1'));
    d.plan.guardians.forEach((g, i) => { if (i > 1) g.health = 'lost'; });
    localStorage.setItem('keyfob.v1', JSON.stringify(d));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(700);
  await shot('s03-plan-broken-threshold');
  const t = await page.evaluate(() => document.querySelector('#planBody').innerText);
  check('a plan below its threshold says so first', t.indexOf('cannot be recovered right now') > 0,
        t.split('\n').filter(Boolean)[3]);

  // eight cards, three needed, at the far end of the range
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  const big = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startBuild('new'); await sleep(120);
    document.querySelector('#fGo').click(); await sleep(120);
    document.querySelector('#practiceBtn').click(); await sleep(250);
    document.querySelector('#fGo').click(); await sleep(150);
    for (let i = 0; i < 3; i++) { document.querySelector('#st-n-up').click(); await sleep(80); }
    for (let i = 0; i < 2; i++) { document.querySelector('#st-m-up').click(); await sleep(80); }
    return { n: document.querySelector('#st-n-val').textContent,
             m: document.querySelector('#st-m-val').textContent };
  });
  await sleep(300);
  await shot('s04-shape-five-of-eight');
  check('the shape step reaches five of eight', big.n === '8' && big.m === '5', JSON.stringify(big));

  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#fGo').click(); await sleep(150);
    const NAMES = ['Tomas', 'Priya', 'Dad', 'Ellen', 'Bank box', 'Ada', 'Sam', 'Wu'];
    for (let i = 0; i < 8; i++) {
      const a = document.querySelector('#pn' + i);
      a.value = NAMES[i]; a.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(150);
    document.querySelector('#fGo').click(); await sleep(250);
    const right = Content.QUIZ.map(q => q.a.filter(x => x.ok)[0].t);
    for (let r = 0; r < 6; r++) {
      const o = [...document.querySelectorAll('#buildBody .opt:not([disabled])')]
        .filter(x => right.indexOf(x.textContent) >= 0)[0];
      if (!o) break; o.click(); await sleep(150);
    }
    document.querySelector('#fGo').click(); await sleep(350);
    const rv = document.querySelector('#cardReveal'); if (rv) rv.click();
  });
  await sleep(400);
  await shot('s05-card-one-of-eight');
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 7; i++) { document.querySelector('#cardNext').click(); await sleep(80); }
    document.querySelector('#cardNext').click(); await sleep(150);
    document.querySelector('#sheetGo').click(); await sleep(300);
    App.go('plan');
  });
  await sleep(600);
  await shot('s06-plan-eight');

  // two cards to one name: the warning has to appear and must not block
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  const dup = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startBuild('new'); await sleep(120);
    document.querySelector('#fGo').click(); await sleep(120);
    document.querySelector('#practiceBtn').click(); await sleep(250);
    document.querySelector('#fGo').click(); await sleep(120);
    document.querySelector('#fGo').click(); await sleep(150);
    const NAMES = ['Dad', 'Dad', 'Priya Nair', 'Ellen Okoro', 'Bank box'];
    for (let i = 0; i < 5; i++) {
      const a = document.querySelector('#pn' + i);
      a.value = NAMES[i]; a.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(200);
    document.querySelector('#pn1').scrollIntoView({ block: 'center' });
    await sleep(120);
    return { warned: !document.querySelector('#pe1').hidden,
             blocked: document.querySelector('#fGo').disabled };
  });
  await sleep(300);
  await shot('s07-duplicate-holder');
  check('two cards to one name is called out', dup.warned, JSON.stringify(dup));
  check('and it is a warning, not a wall', dup.blocked === false, JSON.stringify(dup));

  // a wrong answer in the ceremony
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const a = document.querySelector('#pn1'); a.value = 'Dad at the office';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(120);
    document.querySelector('#fGo').click(); await sleep(250);
    const right = Content.QUIZ.map(q => q.a.filter(x => x.ok)[0].t);
    const wrong = [...document.querySelectorAll('#buildBody .opt')]
      .filter(x => right.indexOf(x.textContent) < 0)[0];
    if (wrong) wrong.click();
  });
  await sleep(400);
  await shot('s08-wrong-answer');
  const blocked = await page.evaluate(() => document.querySelector('#fGo').disabled);
  check('a wrong answer keeps the cards unissued', blocked === true, String(blocked));

  // empty states
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);
  await page.evaluate(() => { Store.onboarded(true); });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(600);
  await shot('s09-empty-plan');
  await page.evaluate(() => App.go('circle')); await sleep(500);
  await shot('s10-empty-circle');
  await page.evaluate(() => App.go('drill')); await sleep(500);
  await shot('s11-empty-drill');
  await page.evaluate(() => App.go('vault')); await sleep(500);
  await shot('s12-empty-vault');

  // rotating through screens fast
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 24; i++) {
      ['plan', 'circle', 'drill', 'vault'][i % 4] && App.go(['plan', 'circle', 'drill', 'vault'][i % 4]);
      await sleep(35);
    }
  });
  await sleep(400);
  const after = await page.evaluate(() => [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id));
  check('rotating through the tabs fast leaves one screen up', after.length === 1, JSON.stringify(after));
  await shot('s13-after-thrash');

  log('console errors: ' + errors.length);
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join('; '));
  if (errors.length) throw new Error('page errored');
};
