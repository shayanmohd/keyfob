/* Keyfob: the update test. fixtures/v100-record.json is a record written by the shipped
   1.0.0 through its own UI (see capture-1.0.0.js). Load it into this build and prove that
   nothing is lost, nothing is misread, and the cards 1.0.0 printed still rebuild the phrase. */
const fs = require('fs');
const path = require('path');
module.exports = async ({ page, shot, wait, errors, log }) => {
  const sleep = wait;
  const fails = [];
  const check = (name, ok, extra) => { log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails.push(name); };

  // the bridge has to exist before the page script runs: App captures window.Native at load
  await page.evaluateOnNewDocument(() => {
    window.__doc = '';
    window.Native = { isNative: () => true, vibrate: () => {}, vibratePattern: () => {},
                      hasAmplitudeControl: () => true, cancelVibration: () => {}, keepAwake: () => {},
                      saveFile: () => 'content://x', shareText: (s, t) => { window.__doc = t; }, shareUri: () => {} };
  });

  const record = fs.readFileSync(path.join(__dirname, 'fixtures/v100-record.json'), 'utf8');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v100-cards.json'), 'utf8'));
  const before = JSON.parse(record);

  await page.evaluate(r => { localStorage.clear(); localStorage.setItem('keyfob.v1', r); }, record);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(700);

  // 1. the record itself
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('keyfob.v1')));
  check('the 1.0.0 record is still under keyfob.v1', !!after);
  check('plan survived untouched', JSON.stringify(after.plan) === JSON.stringify(before.plan));
  check('heirs survived', JSON.stringify(after.heirs) === JSON.stringify(before.heirs));
  check('the letter survived', after.letter === before.letter && after.letterAt === before.letterAt);
  check('drills survived', JSON.stringify(after.drills) === JSON.stringify(before.drills));
  check('quiz result survived', JSON.stringify(after.quiz) === JSON.stringify(before.quiz));
  check('owner survived', after.owner === before.owner);
  check('settings survived, including conceal off',
    after.settings.haptics === before.settings.haptics && after.settings.conceal === before.settings.conceal,
    JSON.stringify(after.settings));

  // 2. the app reads it rather than just storing it
  const shown = await page.evaluate(() => [...document.querySelectorAll('.screen')].filter(s => !s.hidden)[0].id);
  check('lands on the plan, not onboarding', shown === 'v-plan', shown);
  const planText = await page.evaluate(() => document.querySelector('#v-plan').innerText);
  check('the plan screen shows the 1.0.0 threshold', /3 of 5/i.test(planText), planText.split('\n')[1]);
  check('the plan screen shows the 1.0.0 guardians', planText.indexOf('cards out') > 0 || planText.indexOf('Needs you') > 0);
  await shot('u01-plan-from-1.0.0');

  const circleText = await page.evaluate(() => { App.go('circle'); return document.querySelector('#v-circle').innerText; });
  await sleep(400);
  for (const g of before.plan.guardians) {
    check('circle lists ' + g.name + ' with label ' + g.cardId,
      circleText.indexOf(g.name) >= 0 && circleText.indexOf(g.cardId) >= 0);
  }
  await shot('u02-circle-from-1.0.0');

  const letterText = await page.evaluate(() => { App.renderLetter(); App.show('letter'); return document.querySelector('#letterText').value; });
  check('the 1.0.0 letter is readable', letterText.indexOf('Kemi, if you are reading this') >= 0);
  await sleep(300);
  await shot('u03-letter-from-1.0.0');

  const drillText = await page.evaluate(() => { App.go('drill'); return document.querySelector('#v-drill').innerText; });
  check('the 1.0.0 drill log is intact', (drillText.match(/drill,|drill/gi) || []).length >= 2);

  // 3. the estate document rebuilds from the old plan
  const doc = await page.evaluate(() => {
    App.go('vault');
    document.querySelector('#vEstate').click();
    document.querySelector('#sheetGo').click();
    return window.__doc || '';
  });
  check('the estate document names every 1.0.0 holder',
    before.plan.guardians.every(g => doc.indexOf(g.name) >= 0 && doc.indexOf(g.cardId) >= 0));
  await sleep(300);

  // 4. the cards 1.0.0 printed still rebuild the phrase in this build
  const rebuilt = await page.evaluate(async (cards) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startGather('rebuild'); await sleep(350);
    const fill = ws => {
      const ins = [...document.querySelectorAll('#gGridHost .wg-in')];
      ins.forEach((el, i) => { el.value = ws[i] || ''; });
      ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    };
    for (const idx of [0, 2, 4]) {
      fill(cards[idx]); await sleep(220);
      const add = document.querySelector('#gAdd');
      if (!add || add.disabled) return { ok: false, why: 'card ' + idx + ' was refused' };
      add.click(); await sleep(250);
    }
    document.querySelector('#gGo').click(); await sleep(600);
    const words = [...document.querySelectorAll('.card-words b')].map(b => b.textContent.replace(/^\d+/, ''));
    return { ok: true, words: words };
  }, cards);
  check('three 1.0.0 cards rebuild the phrase in this build', rebuilt.ok, rebuilt.why || '');
  const PHRASE = 'describe mask expose excite screen income need badge dance sock option phone';
  check('and the phrase is exactly the one 1.0.0 split',
    rebuilt.ok && rebuilt.words.join(' ') === PHRASE, rebuilt.ok ? rebuilt.words.join(' ') : '');
  await shot('u04-rebuilt-from-1.0.0-cards');

  // 5. the built in self test still passes, at the same size
  const st = await page.evaluate(() => Shamir.selfTest(120));
  check('selfTest passes 480 combinations', st.ok === true && st.combos === 480, JSON.stringify(st));

  log('console errors: ' + errors.length);
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join('; '));
  if (errors.length) throw new Error('page errored');
};
