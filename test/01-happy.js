/* Keyfob: first run, the whole ceremony, and every tab with real data in it.
   Uses a practice phrase so the run is self-contained, then collects the real card
   words off the card screen so later steps can type them back in. */
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const sleep = wait;

  // ---- first run: onboarding ----
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  await shot('01-onboard-1');
  await click('#obNext'); await sleep(500); await shot('01-onboard-2');
  await click('#obNext'); await sleep(500); await shot('01-onboard-3');
  await click('#obNext'); await sleep(500);

  // ---- build, step 0 ----
  await shot('02-build-before');
  await click('#fGo'); await sleep(300);

  // ---- step 1: practice phrase ----
  await shot('03-phrase-empty');
  await click('#practiceBtn'); await sleep(400);
  await shot('04-phrase-filled');
  const phrase = await page.evaluate(() =>
    [...document.querySelectorAll('#gridHost .wg-in')].map(i => i.value));
  log('practice phrase: ' + phrase.join(' '));
  await click('#fGo'); await sleep(300);

  // ---- step 2: shape ----
  await shot('05-shape');
  // walk the steppers to prove they behave
  await click('#st-n-up'); await sleep(200);
  await click('#st-m-up'); await sleep(200);
  await shot('05b-shape-4of6');
  await click('#st-n-down'); await sleep(200);
  await click('#st-m-down'); await sleep(200);
  await click('#fGo'); await sleep(300);

  // ---- step 3: people ----
  await shot('06-people-empty');
  const NAMES = ['Tomas Adeyemi', 'Priya Nair', 'Dad', 'Ellen Okoro', 'Bank box, Halifax'];
  const NOTES = ['fireproof box, Leeds', 'the safe at her practice', 'the tin in the loft',
                 'her filing cabinet', 'deposit box 214'];
  await page.evaluate((NAMES, NOTES) => {
    for (let i = 0; i < 5; i++) {
      const a = document.querySelector('#pn' + i), b = document.querySelector('#pw' + i);
      a.value = NAMES[i]; a.dispatchEvent(new Event('input', { bubbles: true }));
      b.value = NOTES[i]; b.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, NAMES, NOTES);
  await sleep(250);
  await shot('06b-people-filled');
  await click('#fGo'); await sleep(300);

  // ---- step 4: the two questions ----
  await shot('07-check');
  await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let round = 0; round < 6; round++) {
      const opts = [...document.querySelectorAll('#buildBody .opt:not([disabled])')];
      if (!opts.length) break;
      // pick the correct one by consulting the live quiz definition
      const right = Content.QUIZ.map(q => q.a.filter(a => a.ok)[0].t);
      const pick = opts.filter(o => right.indexOf(o.textContent) >= 0)[0];
      if (!pick) break;
      pick.click(); await sleep(220);
    }
  });
  await sleep(400);
  await shot('07b-check-answered');

  // ---- issue ----
  await click('#fGo'); await sleep(600);
  await shot('08-card-concealed');
  const cards = [];
  for (let i = 0; i < 5; i++) {
    const hasReveal = await page.evaluate(() => !!document.querySelector('#cardReveal'));
    if (hasReveal) { await click('#cardReveal'); await sleep(220); }
    if (i === 0) await shot('08b-card-revealed');
    cards.push(await page.evaluate(() =>
      [...document.querySelectorAll('.card-words b')].map(b => b.textContent.replace(/^\d+/, ''))));
    await click('#cardHeld'); await sleep(160);
    if (i < 4) { await click('#cardNext'); await sleep(300); }
  }
  await shot('09-card-last');
  await click('#cardNext'); await sleep(300);
  await shot('10-clear-sheet');
  await click('#sheetGo'); await sleep(600);
  await shot('11-circle');

  // stash the card words for later scripts
  await page.evaluate(c => sessionStorage.setItem('cards', JSON.stringify(c)), cards);

  // ---- circle, guardian ----
  await click('.rows button.row'); await sleep(400);
  await shot('12-guardian');
  await click('#gdnUnsure'); await sleep(300);
  await shot('12b-guardian-unsure');
  await click('#gdnLost'); await sleep(300);
  await shot('12c-guardian-lost');
  await click('#gdnOk'); await sleep(300);
  await click('#gdnBack'); await sleep(400);

  // ---- plan ----
  await page.evaluate(() => App.go('plan')); await sleep(500);
  await shot('13-plan');

  // ---- drill ----
  await page.evaluate(() => App.go('drill')); await sleep(400);
  await shot('14-drill');
  await click('#drillSelf'); await sleep(400);
  await shot('15-gather-empty');
  // type three cards
  for (const idx of [0, 2, 4]) {
    await page.evaluate((ws) => {
      const ins = [...document.querySelectorAll('#gGridHost .wg-in')];
      ins.forEach((el, i) => { el.value = ws[i] || ''; });
      ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    }, cards[idx]);
    await sleep(350);
    if (idx === 0) await shot('15b-gather-one-typed');
    await click('#gAdd'); await sleep(350);
  }
  await shot('16-gather-ready');
  await click('#gGo'); await sleep(700);
  await shot('17-drill-passed');
  await click('#rDone'); await sleep(500);
  await shot('18-drill-log');

  // ---- vault ----
  await page.evaluate(() => App.go('vault')); await sleep(400);
  await shot('19-vault');
  await click('#vFormat'); await sleep(2500);
  await shot('20-selftest');
  await click('#sheetGo'); await sleep(300);
  await click('#vThreat'); await sleep(400);
  await shot('21-threat');
  await click('#threatBack'); await sleep(400);
  await click('#vQuiz'); await sleep(400);
  await shot('22-quiz');
  await page.evaluate(() => {
    const right = Content.QUIZ.map(q => q.a.filter(a => a.ok)[0].t);
    const o = [...document.querySelectorAll('#quizBody .opt')].filter(x => right.indexOf(x.textContent) >= 0)[0];
    if (o) o.click();
  });
  await sleep(400);
  await shot('22b-quiz-answered');
  await click('#quizBack'); await sleep(400);

  // ---- letter and heirs ----
  await click('#vLetter'); await sleep(400);
  await shot('23-letter-empty');
  await page.evaluate(() => {
    document.querySelector('#ownName').value = 'Ruth Adeyemi';
    document.querySelector('#ownName').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#heirName').value = 'Kemi Adeyemi';
    document.querySelector('#heirRel').value = 'Daughter';
  });
  await click('#heirAdd'); await sleep(400);
  await page.evaluate(() => {
    document.querySelector('#letterText').value =
      'Kemi, if you are reading this then the plan worked and I am not here.';
  });
  await click('#letterSave'); await sleep(400);
  await shot('24-letter-full');
  await click('#letterBack'); await sleep(400);
  await shot('25-vault-after');

  log('console errors: ' + errors.length);
  if (errors.length) throw new Error('page errored');
};
