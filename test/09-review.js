/* Keyfob: the adversarial pass. Everything here is a claim someone made about the
   app, checked by measuring the running page rather than by reading the source.

   Run it three ways:
     node drive.js <url> 09-review.js --out test/shots
     ... --dark --reduced-motion
     ... --dark --safe            (status bar 48px, navigation bar 34px)
*/
const seed = require('./seed');

module.exports = async ({ page, shot, wait, click, text, errors, log }) => {
  const sleep = wait;
  const argv = process.argv;
  const safe = argv.includes('--safe');
  const reduced = argv.includes('--reduced-motion');
  const tag = (safe ? 'rev-safe-' : reduced ? 'rev-rm-' : 'rev-');
  const SAT = 48, SAB = 34, H = 844, W = 390;

  let fails = 0;
  const check = (name, ok, note) => {
    if (!ok) fails++;
    log((ok ? 'ok   ' : 'FAIL ') + name + (note ? '  ' + note : ''));
  };

  if (safe) {
    await page.evaluateOnNewDocument((sat, sab) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--sat', sat + 'px');
        document.documentElement.style.setProperty('--sab', sab + 'px');
      });
    }, SAT, SAB);
  }
  const cards = await seed(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(700);

  /* ---------- 1. every screen, measured ---------- */
  const SCREENS = [
    ['plan', () => App.go('plan')],
    ['circle', () => App.go('circle')],
    ['guardian', () => App.openGuardian(Store.plan().guardians[0].id)],
    ['drill', () => App.go('drill')],
    ['vault', () => App.go('vault')],
    ['threat', () => { App.renderThreat(); App.show('threat'); }],
    ['letter', () => { App.renderLetter(); App.show('letter'); }],
    ['quiz', () => App.startQuiz('full')],
    ['gather', () => App.startGather('drill-self')],
    ['build', () => App.startBuild('new')]
  ];
  for (const [name, fn] of SCREENS) {
    await page.evaluate(fn);
    await sleep(520);
    const m = await page.evaluate((SAT, SAB, H, W) => {
      const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const bad = [];
      // the chrome: bar contents, footbar contents, tabs, onboarding foot
      const chrome = [...document.querySelectorAll(
        '.screen:not([hidden]) .bar .icon, .screen:not([hidden]) .bar .bar-title, ' +
        '.screen:not([hidden]) .bar .bar-sub, .screen:not([hidden]) .footbar .btn, ' +
        '#tabs:not([hidden]) .tab, .ob-foot .btn, .ob-dots')].filter(vis);
      for (const el of chrome) {
        const r = el.getBoundingClientRect();
        if (r.top < SAT - 0.5) bad.push(['under the status bar', el.className || el.tagName, Math.round(r.top)]);
        if (r.bottom > H - SAB + 0.5) bad.push(['under the navigation bar', el.className || el.tagName, Math.round(r.bottom)]);
      }
      // nothing may push the page sideways
      const doc = document.documentElement;
      // SVG shapes are masked and deliberately overhang their box, so only laid out
      // HTML boxes count; scrollWidth is the honest answer for the page itself
      const wide = [...document.querySelectorAll('.screen:not([hidden]) *')]
        .filter(el => el instanceof HTMLElement)
        .filter(vis).filter(el => el.getBoundingClientRect().right > W + 1)
        .slice(0, 3).map(el => (el.className || el.tagName) + '@' + Math.round(el.getBoundingClientRect().right));
      return { bad: bad, wide: wide, scrollW: doc.scrollWidth, view: [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id) };
    }, SAT, SAB, H, W);
    check(name + ': one screen visible', m.view.length === 1, JSON.stringify(m.view));
    // with no insets the bars are meant to sit against the edges, so this only
    // asks a question in the --safe run
    if (safe) check(name + ': clear of both bars', m.bad.length === 0, JSON.stringify(m.bad));
    check(name + ': nothing wider than the viewport', m.wide.length === 0 && m.scrollW <= W,
      'scrollWidth ' + m.scrollW + ' ' + JSON.stringify(m.wide));
    await shot(tag + name);
  }

  /* ---------- 2. back() on every nested screen ---------- */
  const backs = await page.evaluate(() => {
    const out = {};
    const at = () => [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id)[0];
    App.go('plan'); out.rootPlan = App.back();
    App.go('circle'); out.circle = App.back(); out.afterCircle = at();
    App.openGuardian(Store.plan().guardians[0].id); out.guardian = App.back(); out.afterGuardian = at();
    App.renderLetter(); App.show('letter'); out.letter = App.back();
    App.startQuiz('full'); out.quiz = App.back();
    App.renderThreat(); App.show('threat'); out.threat = App.back();
    App.go('vault'); out.vault = App.back(); out.afterVault = at();
    App.go('plan'); out.root = App.back();
    return out;
  });
  check('back() is false only at the root', backs.root === false && backs.rootPlan === false, JSON.stringify(backs));
  check('back() is true on circle, guardian, letter, quiz, threat, vault',
    backs.circle && backs.guardian && backs.letter && backs.quiz && backs.threat && backs.vault,
    JSON.stringify(backs));
  check('back() from a guardian lands on the circle', backs.afterGuardian === 'v-circle', backs.afterGuardian);

  /* ---------- 3. a word grid is covered while the app is in the background ---------- */
  await page.evaluate(() => { App.startBuild('new'); });
  await sleep(300);
  await page.evaluate(() => document.querySelector('#fGo').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('#practiceBtn').click());
  await sleep(400);
  const typed = await page.evaluate(() => [...document.querySelectorAll('#gridHost .wg-in')].map(i => i.value));
  check('the practice phrase filled the grid', typed.filter(Boolean).length === 12, typed.length + ' slots');
  await page.evaluate(() => window.App.onPause());
  await sleep(250);
  const covered = await page.evaluate(() => {
    const wg = document.querySelector('.wg');
    const after = getComputedStyle(wg, '::after');
    return { cls: document.body.classList.contains('is-covered'),
             content: after.content, pos: after.position,
             words: [...document.querySelectorAll('#gridHost .wg-in')].map(i => i.value) };
  });
  await shot(tag + 'paused-grid');
  check('the grid is covered on pause', covered.cls && covered.pos === 'absolute' && covered.content.indexOf('Covered') >= 0,
    JSON.stringify({ cls: covered.cls, pos: covered.pos }));
  check('the words are still there underneath', covered.words.filter(Boolean).length === 12);
  await page.evaluate(() => window.App.onResume());
  await sleep(250);
  const back2 = await page.evaluate(() => ({
    cls: document.body.classList.contains('is-covered'),
    words: [...document.querySelectorAll('#gridHost .wg-in')].map(i => i.value)
  }));
  check('resume uncovers it and loses nothing', !back2.cls && back2.words.filter(Boolean).length === 12);

  /* ---------- 4. a toast does not follow the ceremony to the next step ---------- */
  await page.evaluate(() => document.querySelector('#practiceBtn').click());
  await sleep(200);
  const toastUp = await page.evaluate(() => !document.querySelector('#toast').hidden);
  await page.evaluate(() => document.querySelector('#fGo').click());
  await sleep(250);
  const toastAfter = await page.evaluate(() => !document.querySelector('#toast').hidden);
  check('a toast is raised by the practice phrase', toastUp);
  check('and it is gone at the next step', !toastAfter);

  /* ---------- 5. rapid double taps on the buttons that matter ---------- */
  await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    localStorage.clear();
    App.startBuild('new'); await s(140);
    document.querySelector('#fGo').click(); await s(140);
    document.querySelector('#practiceBtn').click(); await s(280);
    document.querySelector('#fGo').click(); await s(180);   // shape
    document.querySelector('#fGo').click(); await s(180);   // people
    ['A', 'B', 'C', 'D', 'E'].forEach((n, i) => {
      const el = document.querySelector('#pn' + i);
      el.value = n; el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await s(180);
    document.querySelector('#fGo').click(); await s(240);   // the two questions
    // answer them correctly on purpose: the point of this block is the double tap
    const right = Content.QUIZ.map(q => q.a.filter(a => a.ok)[0].t);
    for (let k = 0; k < 12; k++) {
      const o = [...document.querySelectorAll('#buildBody .opt:not([disabled])')]
        .filter(b => right.indexOf(b.querySelector('.opt-t').textContent.trim()) >= 0);
      if (!o.length) break;
      o[0].click(); await s(180);
      if (!document.querySelector('#fGo').disabled) break;
    }
    // both taps land before anything can re-render
    const go = document.querySelector('#fGo');
    go.click(); go.click();
  });
  await sleep(700);
  const afterIssue = await page.evaluate(() => ({
    view: [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id),
    n: Store.plan() ? Store.plan().n : 0,
    cardNos: Store.plan() ? Store.plan().guardians.map(g => g.cardNo) : []
  }));
  await shot(tag + 'double-issue');
  check('a double tap on Issue the cards issues one set', afterIssue.view.length === 1 &&
    afterIssue.view[0] === 'v-cards' && afterIssue.n === 5, JSON.stringify(afterIssue));

  // collect the cards, then double tap Add and Rebuild
  const issuedCards = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const out = [];
    for (let i = 0; i < 5; i++) {
      const rev = document.querySelector('#cardReveal');
      if (rev) { rev.click(); await s(90); }
      out.push([...document.querySelectorAll('#cardsBody .card-words b span')].map(x => x.textContent));
      if (i < 4) { document.querySelector('#cardNext').click(); await s(140); }
    }
    return out;
  });
  check('five cards came off the card screen', issuedCards.length === 5 && issuedCards[0].length === 16,
    issuedCards[0].length + ' words');
  const dbl = await page.evaluate(async (cardsIn) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const before = Store.drills().length;
    App.startGather('drill-self'); await s(300);
    const fill = ws => {
      const ins = [...document.querySelectorAll('#gGridHost .wg-in')];
      ins.forEach((el, i) => { el.value = ws[i] || ''; });
      ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    };
    fill(cardsIn[0]); await s(260);
    const add = document.querySelector('#gAdd');
    add.click(); add.click();                       // twice, on purpose
    await s(300);
    const afterOne = document.querySelectorAll('#gatherBody .row .dot').length;
    fill(cardsIn[1]); await s(260); document.querySelector('#gAdd').click(); await s(280);
    fill(cardsIn[2]); await s(260); document.querySelector('#gAdd').click(); await s(300);
    const go = document.querySelector('#gGo');
    go.click(); go.click();                         // twice again
    await s(700);
    return { afterOne: afterOne, added: Store.drills().length - before,
             sub: document.querySelector('#gatherSub').textContent };
  }, issuedCards);
  await shot(tag + 'double-rebuild');
  check('a double tap on Add this card adds one', dbl.afterOne === 1, 'rows=' + dbl.afterOne);
  check('a double tap on Rebuild logs one drill', dbl.added === 1, 'added=' + dbl.added);
  check('and the drill passed', /Rebuilt in/.test(dbl.sub), dbl.sub);

  /* ---------- 6. the promises the listing makes ---------- */
  const promises = await page.evaluate(() => {
    const src = [...document.querySelectorAll('script[src]')].map(s => s.src);
    return {
      scripts: src,
      offline: src.every(u => u.indexOf(location.origin) === 0),
      stored: localStorage.getItem('keyfob.v1') || '',
      keys: Object.keys(localStorage)
    };
  });
  check('every script is served from this origin', promises.offline, promises.scripts.length + ' scripts');
  check('one storage key only', promises.keys.length === 1 && promises.keys[0] === 'keyfob.v1',
    JSON.stringify(promises.keys));
  const leaked = await page.evaluate((cardsIn) => {
    const raw = localStorage.getItem('keyfob.v1') || '';
    const words = [].concat.apply([], cardsIn);
    // a card word appearing three times in a row in the record would be a leak; single
    // common words like "add" can appear inside a name, so runs are what matter
    let worst = 0;
    for (let i = 0; i + 2 < words.length; i++) {
      const run = words.slice(i, i + 3).join(' ');
      if (raw.indexOf(run) >= 0) worst++;
    }
    return { worst: worst, len: raw.length };
  }, issuedCards);
  check('no card words in the stored record', leaked.worst === 0, JSON.stringify(leaked));

  if (errors.length) { fails++; log('FAIL ' + errors.length + ' console errors'); }
  log(fails ? fails + ' FAILING CHECKS' : 'review clean');
  if (fails) throw new Error(fails + ' failing checks');
};
