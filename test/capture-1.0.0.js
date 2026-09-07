/* Run this against the SHIPPED 1.0.0 build to capture a record in exactly the shape it
   writes, plus the card words that record's plan was built from. The fixture it writes
   is what test/04-upgrade.js loads into the new build.
     node _shiptools/drive.js http://127.0.0.1:8830/index.html keyfob/test/capture-1.0.0.js --out keyfob/test/shots */
const fs = require('fs');
const path = require('path');
module.exports = async ({ page, wait, log }) => {
  const sleep = wait;
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(300);

  const cards = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // the whole ceremony, through the shipped UI, so the record is written by real code paths
    document.querySelector('#obNext').click(); await sleep(120);
    document.querySelector('#obNext').click(); await sleep(120);
    document.querySelector('#obNext').click(); await sleep(200);
    document.querySelector('#fGo').click(); await sleep(150);
    const PHRASE = ['describe', 'mask', 'expose', 'excite', 'screen', 'income',
                    'need', 'badge', 'dance', 'sock', 'option', 'phone'];
    const ins = [...document.querySelectorAll('#gridHost .wg-in')];
    ins.forEach((el, i) => { el.value = PHRASE[i]; });
    ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(250);
    document.querySelector('#fGo').click(); await sleep(150);
    document.querySelector('#fGo').click(); await sleep(150);
    const NAMES = ['Tomas Adeyemi', 'Priya Nair', 'Dad', 'Ellen Okoro', 'Bank box, Halifax'];
    const NOTES = ['fireproof box, Leeds', 'the safe at her practice', 'the tin in the loft',
                   'her filing cabinet at home', 'deposit box 214, opened 2019'];
    for (let i = 0; i < 5; i++) {
      const a = document.querySelector('#pn' + i), b = document.querySelector('#pw' + i);
      a.value = NAMES[i]; a.dispatchEvent(new Event('input', { bubbles: true }));
      b.value = NOTES[i]; b.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(150);
    document.querySelector('#fGo').click(); await sleep(250);
    const right = Content.QUIZ.map(q => q.a.filter(x => x.ok)[0].t);
    for (let r = 0; r < 6; r++) {
      const o = [...document.querySelectorAll('#buildBody .opt:not([disabled])')]
        .filter(x => right.indexOf(x.textContent) >= 0)[0];
      if (!o) break; o.click(); await sleep(160);
    }
    document.querySelector('#fGo').click(); await sleep(350);
    const out = [];
    for (let i = 0; i < 5; i++) {
      const rv = document.querySelector('#cardReveal'); if (rv) { rv.click(); await sleep(80); }
      out.push([...document.querySelectorAll('.card-words b')].map(b => b.textContent.replace(/^\d+/, '')));
      document.querySelector('#cardHeld').click(); await sleep(80);
      if (i < 4) { document.querySelector('#cardNext').click(); await sleep(120); }
    }
    document.querySelector('#cardNext').click(); await sleep(150);
    document.querySelector('#sheetGo').click(); await sleep(250);

    // heirs, letter, a drill and the quiz, so every part of the record is populated
    Store.owner('Ruth Adeyemi');
    Store.addHeir('Kemi Adeyemi', 'Daughter');
    Store.addHeir('Tomas Adeyemi', 'Brother, and executor');
    Store.letter('Kemi, if you are reading this then the plan worked and I am not here.');
    Store.quiz(true);
    Store.addDrill({ kind: 'self', gathered: 3, seconds: 604, passed: true });
    Store.addDrill({ kind: 'heirs', gathered: 3, seconds: 1841, passed: true });
    Store.settings({ conceal: false });
    return out;
  });

  const record = await page.evaluate(() => localStorage.getItem('keyfob.v1'));
  const dir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'v100-record.json'), record);
  fs.writeFileSync(path.join(dir, 'v100-cards.json'), JSON.stringify(cards, null, 1));
  log('wrote fixtures/v100-record.json (' + record.length + ' bytes) and v100-cards.json');
};
