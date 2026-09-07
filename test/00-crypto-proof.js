/* Keyfob: the proof that the arithmetic is right.

   Nothing here trusts the app's own word for anything. The phrase and its entropy
   were worked out away from this app with node's own SHA-256 and the raw word list,
   and every reconstruction is checked twice: once by the app's Shamir module in the
   page, and once by a small independent GF(256) implementation in node that reads
   the cards exactly the way the estate document tells a stranger to read them.

   What it proves, for a 3 of 5 plan over a known 24 word phrase:
     - all 10 subsets of 3 cards rebuild the phrase word for word,
     - none of the 10 subsets of 2 cards rebuilds it,
     - the words come back through the card encoding, not just the raw shares,
     - the app's own selfTest passes every combination it checks,
     - and the whole thing works through the real screens, not only the modules.
*/
const crypto = require('crypto');

/* ---------- an independent GF(256), written from the field definition ---------- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    let d = x << 1; if (d & 0x100) d ^= 0x11b;      // xtime under the AES polynomial
    x = (x ^ d) & 0xff;                              // times three
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
const gdiv = (a, b) => a === 0 ? 0 : EXP[LOG[a] + 255 - LOG[b]];

/** Lagrange interpolation at x = 0, byte by byte. points: [{x, y:Uint8Array}] */
function interpolate(points) {
  const L = points[0].y.length;
  const out = Buffer.alloc(L);
  for (let i = 0; i < points.length; i++) {
    let basis = 1;
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      basis = gmul(basis, gdiv(points[j].x, points[i].x ^ points[j].x));
    }
    for (let k = 0; k < L; k++) out[k] ^= gmul(points[i].y[k], basis);
  }
  return out;
}

/** A card, read the way the estate document says to read it. Nothing app-specific. */
function readCard(words, wordlist) {
  let bits = '';
  for (const w of words) {
    const idx = wordlist.indexOf(w);
    if (idx < 0) throw new Error('word not on the standard list: ' + w);
    bits += idx.toString(2).padStart(11, '0');
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const x = bytes[0], len = bytes[1], m = (bytes[2] >> 4) + 1, n = (bytes[2] & 15) + 1;
  const body = bytes.subarray(0, len + 3);
  const sum = crypto.createHash('sha256').update(body).digest();
  if (bytes[len + 3] !== sum[0] || bytes[len + 4] !== sum[1]) throw new Error('card checksum failed');
  return { x: x, m: m, n: n, y: bytes.subarray(3, 3 + len) };
}

/** Every k-sized subset of 0..n-1. */
function subsets(n, k) {
  const out = [];
  (function walk(start, cur) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < n; i++) { cur.push(i); walk(i + 1, cur); cur.pop(); }
  })(0, []);
  return out;
}

/* ---------- the phrase, worked out with node's crypto and nothing else ---------- */
const ENT_HEX = '2f1a7c9e40b3d6058e21c47fa9036be5d84c17209fb3e6a5c0d982741e5b3a6c';
const PHRASE = ['congress', 'stadium', 'chest', 'lift', 'dice', 'actress', 'decade', 'decade',
                'leisure', 'elite', 'sustain', 'slight', 'luggage', 'argue', 'list', 'wait',
                'trade', 'come', 'cushion', 'agent', 'draft', 'collect', 'trust', 'narrow'];

module.exports = async ({ page, shot, wait, click, errors, log }) => {
  const fail = m => { throw new Error(m); };
  const sleep = wait;

  /* ---------- 0. the app's own self test, run harder than the app runs it ---------- */
  const st = await page.evaluate(() => Shamir.selfTest(400));
  if (!st.ok) fail('selfTest failed at: ' + st.where);
  log('selfTest: ok, ' + st.rounds + ' secrets, ' + st.combos + ' reconstructions, every one exact');
  if (st.combos < 1600) fail('selfTest checked only ' + st.combos + ' combinations');

  /* ---------- 1. the known phrase goes in, cards come out ---------- */
  const made = await page.evaluate((PHRASE) => {
    const r = Bip39.toEntropy(PHRASE);
    if (!r.ok) return { error: 'the app rejected the known phrase: ' + r.error };
    const hex = Array.from(r.entropy).map(b => b.toString(16).padStart(2, '0')).join('');
    const shares = Shamir.split(r.entropy, 3, 5);
    return {
      hex: hex,
      words: Shamir.WORDS ? null : null,
      cards: shares.map(s => Shamir.toCard(s, 3, 5)),
      ids: shares.map(s => Shamir.cardId(s, 3, 5)),
      fp: Sha256.fingerprint(r.entropy, 4),
      wordlist: Bip39.WORDS
    };
  }, PHRASE);
  if (made.error) fail(made.error);
  if (made.hex !== ENT_HEX) fail('the app read the phrase as ' + made.hex + ', not ' + ENT_HEX);
  log('phrase -> entropy: ' + made.hex + '  (matches the value computed outside the app)');
  if (made.wordlist.length !== 2048) fail('word list is ' + made.wordlist.length + ' words');
  if (made.cards.length !== 5) fail('expected 5 cards');
  made.cards.forEach((c, i) => {
    if (c.length !== 27) fail('card ' + (i + 1) + ' is ' + c.length + ' words, expected 27');
  });
  log('cards: ' + made.ids.join(' ') + ', ' + made.cards[0].length + ' words each');
  log('card 1: ' + made.cards[0].join(' '));

  /* ---------- 2. node, on its own, reads the cards and rebuilds the phrase ---------- */
  {
    // the phrase is a real BIP-39 phrase: checked here with node's SHA-256
    let bits = '';
    for (const w of PHRASE) bits += made.wordlist.indexOf(w).toString(2).padStart(11, '0');
    const ent = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) ent[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    if (ent.toString('hex') !== ENT_HEX) fail('the known phrase does not carry the known entropy');
    const want = crypto.createHash('sha256').update(ent).digest()[0].toString(2).padStart(8, '0');
    if (bits.slice(256) !== want) fail('the known phrase fails its own BIP-39 checksum');
    log('BIP-39 checksum on the known phrase: holds, checked with node crypto');
  }
  const pts = made.cards.map(c => readCard(c, made.wordlist));
  pts.forEach((p, i) => {
    if (p.x !== i + 1 || p.m !== 3 || p.n !== 5 || p.y.length !== 32) {
      fail('card ' + (i + 1) + ' decoded as x=' + p.x + ' m=' + p.m + ' n=' + p.n + ' len=' + p.y.length);
    }
  });
  log('all 5 cards decode independently: x 1..5, threshold 3 of 5, 32 byte shares, checksums hold');

  let okTriples = 0;
  for (const s of subsets(5, 3)) {
    const got = interpolate(s.map(i => pts[i])).toString('hex');
    if (got !== ENT_HEX) fail('node rebuild failed for cards ' + s.map(i => i + 1).join('+') + ': ' + got);
    okTriples++;
  }
  log('node, independently: all ' + okTriples + ' subsets of 3 cards rebuilt the exact entropy');

  let pairsChecked = 0;
  for (const s of subsets(5, 2)) {
    const got = interpolate(s.map(i => pts[i])).toString('hex');
    if (got === ENT_HEX) fail('two cards rebuilt the secret: ' + s.map(i => i + 1).join('+'));
    pairsChecked++;
  }
  log('node, independently: none of the ' + pairsChecked + ' subsets of 2 cards produced the entropy');

  /* ---------- 3. the app, through its own card reader, returns the words ---------- */
  const inApp = await page.evaluate((cards, PHRASE) => {
    const sub = (n, k) => { const o = []; (function w(s, c) { if (c.length === k) { o.push(c.slice()); return; } for (let i = s; i < n; i++) { c.push(i); w(i + 1, c); c.pop(); } })(0, []); return o; };
    const parsed = cards.map(c => Shamir.fromCard(c));
    if (parsed.some(p => !p.ok)) return { error: 'the app could not read a card it wrote' };
    const good = [], bad = [];
    for (const s of sub(5, 3)) {
      const ent = Shamir.combine(s.map(i => parsed[i].share));
      const got = Bip39.toPhrase(ent);
      const same = got.length === PHRASE.length && got.every((w, i) => w === PHRASE[i]);
      good.push({ set: s.map(i => i + 1).join('+'), same: same, phrase: got.join(' ') });
    }
    for (const s of sub(5, 2)) {
      const ent = Shamir.combine(s.map(i => parsed[i].share));
      const got = Bip39.toPhrase(ent);
      const same = got.length === PHRASE.length && got.every((w, i) => w === PHRASE[i]);
      bad.push({ set: s.map(i => i + 1).join('+'), same: same, first: got.slice(0, 3).join(' ') });
    }
    return { good: good, bad: bad, m: parsed[0].m, n: parsed[0].n };
  }, made.cards, PHRASE);
  if (inApp.error) fail(inApp.error);
  const wrong = inApp.good.filter(g => !g.same);
  if (wrong.length) fail('the app did not return the phrase for: ' + wrong.map(w => w.set).join(', '));
  log('in the page: all ' + inApp.good.length + ' subsets of 3 cards returned the 24 words, word for word');
  log('  example, cards ' + inApp.good[0].set + ': ' + inApp.good[0].phrase);
  const leaked = inApp.bad.filter(b => b.same);
  if (leaked.length) fail('two cards returned the phrase: ' + leaked.map(b => b.set).join(', '));
  log('in the page: none of the ' + inApp.bad.length + ' subsets of 2 cards returned it');
  log('  example, cards ' + inApp.bad[0].set + ' begins: ' + inApp.bad[0].first + ' ...');

  /* ---------- 4. a wrong word must not slip through ---------- */
  const tamper = await page.evaluate((card) => {
    const bent = card.slice();
    bent[7] = bent[7] === 'zoo' ? 'abandon' : 'zoo';        // one real word, in the wrong place
    const r = Shamir.fromCard(bent);
    const short = Shamir.fromCard(card.slice(0, 26));
    const junk = Shamir.fromCard(card.map((w, i) => i === 3 ? 'qwertyx' : w));
    return { bent: r.ok, bentChecksum: !!r.checksum, short: short.ok, junk: junk.ok };
  }, made.cards[0]);
  if (tamper.bent) fail('a card with one word changed was accepted');
  if (!tamper.bentChecksum) fail('a changed word was rejected, but not by the checksum');
  if (tamper.short) fail('a card with a word missing was accepted');
  if (tamper.junk) fail('a card with a word that is not on the list was accepted');
  log('a card with one word changed, one word missing, or one word invented: all three refused');

  /* ---------- 5. the same thing through the real screens ---------- */
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  await click('#obNext'); await click('#obNext'); await click('#obNext'); await sleep(400);
  await click('#fGo'); await sleep(300);                       // past "before you start"
  await page.evaluate((PHRASE) => {
    const ins = [...document.querySelectorAll('#gridHost .wg-in')];
    for (let i = 0; i < ins.length; i++) {
      ins[i].value = PHRASE[i] || '';
      ins[i].dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, PHRASE.slice(0, 12));
  await sleep(300);
  await click('[data-len="24"]'); await sleep(400);            // and the typed words carry over
  await page.evaluate((PHRASE) => {
    const ins = [...document.querySelectorAll('#gridHost .wg-in')];
    for (let i = 0; i < ins.length; i++) {
      ins[i].value = PHRASE[i] || '';
      ins[i].dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, PHRASE);
  await sleep(400);
  await shot('p1-phrase-typed');
  const state = await page.evaluate(() => document.querySelector('#phraseState').innerText);
  log('the build screen says: ' + state.replace(/\s+/g, ' ').trim());
  if (!/checksum holds/i.test(state)) fail('the app did not accept the known phrase on screen');
  if (await page.evaluate(() => document.querySelector('#fGo').disabled)) fail('continue stayed disabled');
  await click('#fGo'); await sleep(300);                      // shape: 3 of 5 is the default
  await shot('p2-shape');
  await click('#fGo'); await sleep(300);
  await page.evaluate(() => {
    ['Tomas', 'Priya', 'Dad', 'Ellen', 'Bank box'].forEach((n, i) => {
      const el = document.querySelector('#pn' + i);
      el.value = n; el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  await sleep(250);
  await click('#fGo'); await sleep(300);
  await page.evaluate(async () => {                            // answer the two questions
    const s = ms => new Promise(r => setTimeout(r, ms));
    const right = Content.QUIZ.map(q => q.a.filter(a => a.ok)[0].t);
    for (let round = 0; round < 12; round++) {
      const o = [...document.querySelectorAll('#buildBody .opt:not([disabled])')]
        .filter(b => right.indexOf(b.querySelector('.opt-t').textContent.trim()) >= 0);
      if (!o.length) break;
      o[0].click(); await s(200);
      if (!document.querySelector('#fGo').disabled) break;
    }
  });
  await sleep(400);
  await click('#fGo'); await sleep(500);                       // issue the cards
  const onScreen = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const btn = document.querySelector('#cardReveal');
      if (btn) btn.click();
      out.push([...document.querySelectorAll('#cardsBody .card-words b span')].map(s => s.textContent));
      const next = document.querySelector('#cardNext');
      if (i < 4) next.click();
    }
    return out;
  });
  await sleep(300);
  await shot('p3-card-on-screen');
  onScreen.forEach((c, i) => {
    if (c.length !== 27) fail('card ' + (i + 1) + ' on screen has ' + c.length + ' words');
  });
  log('five cards issued on screen, 27 words each');

  // type three of them back in, in the app, and read the phrase off the rebuild screen
  await click('#cardNext'); await sleep(300);                  // finish -> confirm sheet
  await click('#sheetGo'); await sleep(500);
  await page.evaluate(() => window.App.startGather('rebuild'));
  await sleep(400);
  for (const idx of [0, 2, 4]) {
    await page.evaluate((words) => {
      const ins = [...document.querySelectorAll('#gGridHost .wg-in')];
      for (let i = 0; i < ins.length; i++) {
        ins[i].value = words[i] || '';
        ins[i].dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, onScreen[idx]);
    await sleep(300);
    await click('#gAdd'); await sleep(350);
  }
  await shot('p4-three-cards-in');
  await click('#gGo'); await sleep(600);
  const rebuilt = await page.evaluate(() =>
    [...document.querySelectorAll('#gatherBody .card-words b span')].map(s => s.textContent));
  await shot('p5-rebuilt-phrase');
  if (rebuilt.length !== 24) fail('the rebuild screen showed ' + rebuilt.length + ' words');
  for (let i = 0; i < 24; i++) {
    if (rebuilt[i] !== PHRASE[i]) {
      fail('word ' + (i + 1) + ' came back as "' + rebuilt[i] + '", expected "' + PHRASE[i] + '"');
    }
  }
  log('through the real screens: cards 1, 3 and 5 rebuilt the phrase word for word');
  log('  ' + rebuilt.join(' '));

  if (errors.length) throw new Error(errors.length + ' page errors');
};
