/* Keyfob: the things that break apps. Persistence across reloads, the Back contract,
   pause and resume, both export paths, rapid double taps, and silly input. */
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const sleep = wait;
  const fails = [];
  const check = (name, ok, extra) => { log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails.push(name); };

  // A mock Native so saveFile and shareText take the native branch.
  await page.evaluateOnNewDocument(() => {
    window.__saved = []; window.__shared = [];
    if (sessionStorage.getItem('keyfob.noNative')) return;
    window.Native = {
      isNative: () => true,
      vibrate: () => {}, vibratePattern: () => {}, hasAmplitudeControl: () => true,
      cancelVibration: () => {}, keepAwake: () => {},
      saveFile: (name, mime, b64) => { window.__saved.push({ name, mime, b64 }); return 'content://downloads/' + name; },
      shareText: (subject, text) => { window.__shared.push({ subject, text }); },
      shareUri: () => {}
    };
  });

  // ---- build a plan straight through the API, then reload ----
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);

  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startBuild('new'); await sleep(120);
    document.querySelector('#fGo').click(); await sleep(120);
    document.querySelector('#practiceBtn').click(); await sleep(250);
    document.querySelector('#fGo').click(); await sleep(120);
    document.querySelector('#fGo').click(); await sleep(120);
    const NAMES = ['Tomas Adeyemi', 'Priya Nair', 'Dad', 'Ellen Okoro', 'Bank box, Halifax'];
    for (let i = 0; i < 5; i++) {
      const a = document.querySelector('#pn' + i);
      a.value = NAMES[i]; a.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(120);
    document.querySelector('#fGo').click(); await sleep(200);
    const right = Content.QUIZ.map(q => q.a.filter(a => a.ok)[0].t);
    for (let r = 0; r < 6; r++) {
      const o = [...document.querySelectorAll('#buildBody .opt:not([disabled])')]
        .filter(x => right.indexOf(x.textContent) >= 0)[0];
      if (!o) break; o.click(); await sleep(160);
    }
    document.querySelector('#fGo').click(); await sleep(300);
  });
  const cards = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = [];
    for (let i = 0; i < 5; i++) {
      const rv = document.querySelector('#cardReveal'); if (rv) { rv.click(); await sleep(60); }
      out.push([...document.querySelectorAll('.card-words b')].map(b => b.textContent.replace(/^\d+/, '')));
      document.querySelector('#cardHeld').click(); await sleep(60);
      if (i < 4) { document.querySelector('#cardNext').click(); await sleep(100); }
    }
    document.querySelector('#cardNext').click(); await sleep(120);
    document.querySelector('#sheetGo').click(); await sleep(200);
    return out;
  });
  log('cards captured: ' + cards.length);

  // ---- 1. rapid double taps on primary buttons ----
  await page.evaluate(() => App.go('drill'));
  await sleep(300);
  await page.evaluate(() => {
    const b = document.querySelector('#drillSelf');
    b.click(); b.click(); b.click();
  });
  await sleep(500);
  await shot('r01-double-tap-drill');
  const gatherState = await page.evaluate(() => ({
    view: [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id),
    sub: document.querySelector('#gatherSub').textContent
  }));
  check('double tap on Run the drill leaves one screen', gatherState.view.length === 1, JSON.stringify(gatherState));

  // add the same card twice, fast
  await page.evaluate(async (ws) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const ins = [...document.querySelectorAll('#gGridHost .wg-in')];
    ins.forEach((el, i) => { el.value = ws[i] || ''; });
    ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(150);
    const b = document.querySelector('#gAdd'); b.click(); b.click();
  }, cards[0]);
  await sleep(400);
  const entries = await page.evaluate(() => document.querySelectorAll('#gatherBody .rows .row').length);
  check('double tap on Add this card adds one card', entries === 1, 'entries=' + entries);
  await shot('r02-one-entry');

  // ---- 2. Back contract on every nested screen ----
  const backOn = async (setup, label) => {
    await page.evaluate(setup);
    await sleep(350);
    const r = await page.evaluate(() => { try { return App.back(); } catch (e) { return 'THREW: ' + e.message; } });
    check('back() true on ' + label, r === true, String(r));
    await sleep(300);
    // clear anything the back left open
    await page.evaluate(() => { const s = document.querySelector('#sheet'); if (!s.hidden) document.querySelector('#sheetNo').click(); });
    await sleep(150);
  };
  await page.evaluate(() => { if (window.gatherStop) {} App.go('plan'); });
  await sleep(300);
  await backOn(() => App.startBuild('new'), 'build');
  await page.evaluate(() => App.go('plan')); await sleep(200);
  await backOn(() => App.startGather('drill-self'), 'gather');
  await page.evaluate(() => App.go('plan')); await sleep(200);
  await backOn(() => App.openGuardian(Store.plan().guardians[0].id), 'guardian');
  await backOn(() => { App.renderLetter(); App.show('letter'); }, 'letter');
  await backOn(() => App.startQuiz('full'), 'quiz');
  await backOn(() => { App.renderThreat(); App.show('threat'); }, 'threat');
  await backOn(() => App.go('circle'), 'circle tab');
  await backOn(() => App.go('drill'), 'drill tab');
  await backOn(() => App.go('vault'), 'vault tab');

  // root
  await page.evaluate(() => App.go('plan')); await sleep(300);
  const atRoot = await page.evaluate(() => App.back());
  check('back() false at the root', atRoot === false, String(atRoot));

  // sheet closes first
  await page.evaluate(() => App.go('vault')); await sleep(250);
  await page.evaluate(() => document.querySelector('#vErase').click()); await sleep(250);
  const sheetBack = await page.evaluate(() => App.back());
  const sheetHidden = await page.evaluate(() => document.querySelector('#sheet').hidden);
  check('back() closes an open sheet and returns true', sheetBack === true && sheetHidden, sheetBack + '/' + sheetHidden);

  // ---- 3. pause and resume ----
  const pr = await page.evaluate(() => {
    try { App.onPause(); App.onResume(); return 'ok'; } catch (e) { return 'THREW: ' + e.message; }
  });
  check('onPause/onResume on the vault', pr === 'ok', pr);
  // and on the card screen, where a secret is on display
  const prCards = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    App.startBuild('new'); await sleep(100);
    try { App.onPause(); App.onResume(); } catch (e) { return 'THREW: ' + e.message; }
    return 'ok';
  });
  check('onPause/onResume mid ceremony', prCards === 'ok', prCards);
  await page.evaluate(() => { App.go('plan'); });
  await sleep(300);

  // ---- 4. persistence across a reload ----
  const before = await page.evaluate(() => localStorage.getItem('keyfob.v1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  const after = await page.evaluate(() => localStorage.getItem('keyfob.v1'));
  check('localStorage survives a reload byte for byte', before === after);
  const shown = await page.evaluate(() => [...document.querySelectorAll('.screen')].filter(s => !s.hidden)[0].id);
  check('a returning user lands on the plan, not onboarding', shown === 'v-plan', shown);
  await shot('r03-after-reload');

  // ---- 5. export, both paths ----
  await page.evaluate(() => App.go('vault')); await sleep(300);
  await page.evaluate(() => document.querySelector('#vExport').click()); await sleep(400);
  const saved = await page.evaluate(() => window.__saved.map(s => s.name));
  check('Native.saveFile got the record', saved.length === 1 && /^keyfob-record-\d{4}-\d{2}-\d{2}\.json$/.test(saved[0]), JSON.stringify(saved));
  const round = await page.evaluate(() => {
    const raw = decodeURIComponent(escape(atob(window.__saved[0].b64)));
    let j; try { j = JSON.parse(raw); } catch (e) { return 'not json: ' + e.message; }
    const live = JSON.parse(localStorage.getItem('keyfob.v1'));
    if (j.app !== 'keyfob' || j.format !== 1) return 'wrong envelope';
    if (JSON.stringify(j.data) !== JSON.stringify(live)) return 'record differs from live state';
    if (raw.indexOf('"words"') >= 0) return 'record contains card words';
    return 'ok';
  });
  check('the exported record round trips to the live state', round === 'ok', round);

  // the estate document through shareText
  await page.evaluate(() => { document.querySelector('#vEstate').click(); });
  await sleep(250);
  await page.evaluate(() => document.querySelector('#sheetGo').click());
  await sleep(300);
  const doc = await page.evaluate(() => window.__shared.length ? window.__shared[0].text : '');
  check('estate document shared through Native.shareText', doc.indexOf('KEYFOB ESTATE DOCUMENT') === 0, doc.slice(0, 40));
  const leak = await page.evaluate((cards) => {
    const d = window.__shared[0].text;
    for (const c of cards) for (const w of c) { }
    // no full card should appear in the document
    for (const c of cards) { if (d.indexOf(c.slice(0, 4).join(' ')) >= 0) return 'card words present'; }
    return 'clean';
  }, cards);
  check('the estate document carries no card words', leak === 'clean', leak);

  // browser download path: reload with the bridge absent, the way a plain browser runs it
  await page.evaluate(() => sessionStorage.setItem('keyfob.noNative', '1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  await page.evaluate(() => App.go('vault'));
  await sleep(300);
  const dl = await page.evaluate(() => new Promise(res => {
    const realClick = HTMLAnchorElement.prototype.click;
    let got = null;
    HTMLAnchorElement.prototype.click = function () { got = { name: this.download, href: this.href }; };
    document.querySelector('#vExport').click();
    setTimeout(() => { HTMLAnchorElement.prototype.click = realClick; res(got); }, 200);
  }));
  check('browser download path builds an object url', !!dl && /^blob:/.test(dl.href) && /\.json$/.test(dl.name), JSON.stringify(dl));
  await page.evaluate(() => sessionStorage.removeItem('keyfob.noNative'));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);

  // ---- 6. silly input ----
  await page.evaluate(() => { App.renderLetter(); App.show('letter'); });
  await sleep(300);
  const heirEdge = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const add = async (n, r) => {
      document.querySelector('#heirName').value = n;
      document.querySelector('#heirRel').value = r || '';
      document.querySelector('#heirAdd').click();
      await sleep(120);
    };
    await add('', '');                       // empty
    const afterEmpty = Store.heirs().length;
    await add('   ', '');                    // whitespace only
    const afterSpaces = Store.heirs().length;
    await add('Kemi Adeyemi', 'Daughter');
    await add('Kemi Adeyemi', 'Daughter');   // duplicate
    const afterDup = Store.heirs().length;
    await add('x'.repeat(400), 'y'.repeat(400));
    const afterLong = Store.heirs().length;
    return { afterEmpty, afterSpaces, afterDup, afterLong,
             overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  check('empty heir name is refused', heirEdge.afterEmpty === 0, JSON.stringify(heirEdge));
  check('whitespace heir name is refused', heirEdge.afterSpaces === 0);
  check('a 400 character name does not burst the layout', !heirEdge.overflow);
  await shot('r04-heir-edges');
  log('duplicate heirs allowed: ' + (heirEdge.afterDup === 2));

  // very long guardian name on the circle
  await page.evaluate(() => {
    Store.setGuardian(Store.plan().guardians[0].id, { name: 'Bartholomew Fitzwilliam-Cholmondeley the Third' });
    App.go('circle');
  });
  await sleep(400);
  await shot('r05-long-name-circle');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('a very long guardian name does not scroll the page sideways', !wide);

  // steppers at their limits
  await page.evaluate(() => App.startBuild('new'));
  await sleep(250);
  const stepper = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#fGo').click(); await sleep(100);
    document.querySelector('#practiceBtn').click(); await sleep(200);
    document.querySelector('#fGo').click(); await sleep(150);
    for (let i = 0; i < 12; i++) { const b = document.querySelector('#st-n-up'); if (!b.disabled) b.click(); await sleep(40); }
    const maxN = document.querySelector('#st-n-val').textContent;
    for (let i = 0; i < 14; i++) { const b = document.querySelector('#st-n-down'); if (!b.disabled) b.click(); await sleep(40); }
    const minN = document.querySelector('#st-n-val').textContent;
    for (let i = 0; i < 12; i++) { const b = document.querySelector('#st-m-down'); if (!b.disabled) b.click(); await sleep(40); }
    const minM = document.querySelector('#st-m-val').textContent;
    for (let i = 0; i < 12; i++) { const b = document.querySelector('#st-m-up'); if (!b.disabled) b.click(); await sleep(40); }
    const maxM = document.querySelector('#st-m-val').textContent;
    return { maxN, minN, minM, maxM };
  });
  check('card count clamps to 3..8', stepper.maxN === '8' && stepper.minN === '3', JSON.stringify(stepper));
  check('threshold clamps to 2..n', stepper.minM === '2' && stepper.maxM === stepper.minN, JSON.stringify(stepper));
  await shot('r06-stepper-limits');

  log('console errors: ' + errors.length);
  if (fails.length) throw new Error(fails.length + ' checks failed: ' + fails.join('; '));
  if (errors.length) throw new Error('page errored');
};
