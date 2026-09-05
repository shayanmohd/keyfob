/* Keyfob. Shamir secret sharing over GF(256), and the card format built on top of it.

   The idea in one paragraph. Your recovery phrase is a number. Pick a random line
   through that number and hand each guardian one point on it: no point tells you
   anything about where the line crosses zero, but any two points fix the line, and
   the crossing is the secret. Raise the degree of the curve and you need three
   points, or four, or five. That is the whole trick, and it is the same arithmetic
   Trezor's SLIP-39 backups use.

   Every byte of the secret is split independently in the field of 256 elements, so
   a share is exactly as long as the secret. Sharing is information theoretic: with
   fewer than the threshold, every possible phrase remains exactly as likely as it
   was before, which is a stronger promise than encryption can make.

   Keyfob's card format is its own, not SLIP-39. It carries the threshold, the card
   number, the length and a checksum alongside the share, encoded in the same 2048
   BIP-39 words a recovery phrase uses, so a guardian copies out one familiar kind
   of thing. Cards from Keyfob are read by Keyfob. */
const Shamir = (function () {
  'use strict';

  /* ---------- the field ---------- */
  /* GF(2^8) modulo x^8 + x^4 + x^3 + x + 1, the polynomial AES uses.
     Its generator is 3, not 2: doubling walks a cycle of only 51 elements here,
     so the log tables are built by repeatedly multiplying by 3, which visits all
     255 non-zero elements exactly once. */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      const dbl = ((x << 1) ^ ((x & 0x80) ? 0x11b : 0)) & 0xff;
      x = x ^ dbl;                                   // x * 3
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const add = (a, b) => a ^ b;                       // and subtraction, identically
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  const div = (a, b) => {
    if (b === 0) throw new Error('division by zero in GF(256)');
    return a === 0 ? 0 : EXP[LOG[a] + 255 - LOG[b]];
  };

  function randomBytes(n) {
    const b = new Uint8Array(n);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else throw new Error('no random source');
    return b;
  }

  /* ---------- split and combine ---------- */

  /** Split `secret` into n shares of which any m reconstruct it.
      Returns [{ x, y }], x running 1..n. */
  function split(secret, m, n) {
    if (m < 2 || m > n || n > 16) throw new Error('threshold out of range');
    const L = secret.length;
    // coefficients[j] holds the degree-j coefficient for every byte position
    const coef = [];
    for (let j = 1; j < m; j++) coef.push(randomBytes(L));
    const out = [];
    for (let x = 1; x <= n; x++) {
      const y = new Uint8Array(L);
      for (let i = 0; i < L; i++) {
        let acc = 0;
        for (let j = m - 1; j >= 1; j--) acc = add(mul(acc, x), coef[j - 1][i]);
        y[i] = add(mul(acc, x), secret[i]);
      }
      out.push({ x: x, y: y });
    }
    return out;
  }

  /** Reconstruct the secret from any m or more distinct points. */
  function combine(points) {
    if (!points.length) throw new Error('no shares');
    const L = points[0].y.length;
    for (const p of points) if (p.y.length !== L) throw new Error('shares are different lengths');
    const seen = {};
    for (const p of points) {
      if (p.x === 0) throw new Error('card number 0 is not a valid point');
      if (seen[p.x]) throw new Error('two cards have the same number');
      seen[p.x] = 1;
    }
    const out = new Uint8Array(L);
    for (let i = 0; i < points.length; i++) {
      // Lagrange basis for this point, evaluated at x = 0
      let basis = 1;
      for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        basis = mul(basis, div(points[j].x, add(points[i].x, points[j].x)));
      }
      for (let k = 0; k < L; k++) out[k] = add(out[k], mul(points[i].y[k], basis));
    }
    return out;
  }

  /* ---------- the card format ----------
     payload = [ card number ] [ secret length ] [ (m-1)<<4 | (n-1) ] [ share bytes ] [ 2 byte check ]
     then packed 11 bits to a word, padded with zeros to a whole word.
     The card number leads so that two cards from one set differ from their first
     word, which is what stops a guardian copying out the wrong one. */

  const wordCount = elen => Math.ceil((elen + 5) * 8 / 11);

  function payloadOf(share, m, n) {
    const L = share.y.length;
    const p = new Uint8Array(L + 5);
    p[0] = share.x;
    p[1] = L;
    p[2] = ((m - 1) << 4) | (n - 1);
    p.set(share.y, 3);
    const sum = Sha256.digest(p.subarray(0, L + 3));
    p[L + 3] = sum[0]; p[L + 4] = sum[1];
    return p;
  }

  /** A share -> the words a guardian writes down. */
  function toCard(share, m, n) {
    const p = payloadOf(share, m, n);
    let bits = '';
    for (let i = 0; i < p.length; i++) bits += p[i].toString(2).padStart(8, '0');
    const words = wordCount(p.length - 5);
    bits = bits.padEnd(words * 11, '0');
    const out = [];
    for (let i = 0; i < bits.length; i += 11) out.push(Bip39.WORDS[parseInt(bits.slice(i, i + 11), 2)]);
    return out;
  }

  /** The words a guardian wrote down -> { ok, m, n, share } or { ok:false, error }. */
  function fromCard(phrase) {
    const w = Array.isArray(phrase) ? phrase.map(x => String(x).toLowerCase()) : Bip39.normalise(phrase);
    if (w.length < 6) return { ok: false, error: 'A guardian card is a longer list of words than this.' };
    const bad = [];
    for (let i = 0; i < w.length; i++) if (!Bip39.isWord(w[i])) bad.push(i);
    if (bad.length) {
      return { ok: false, badWords: bad,
        error: bad.length === 1 ? 'Word ' + (bad[0] + 1) + ' is not in the standard word list.'
                                : bad.length + ' words are not in the standard word list.' };
    }
    let bits = '';
    for (let i = 0; i < w.length; i++) bits += Bip39.WORDS.indexOf(w[i]).toString(2).padStart(11, '0');
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    if (bytes.length < 6) return { ok: false, error: 'That card is too short to be a Keyfob card.' };
    const x = bytes[0], L = bytes[1], m = (bytes[2] >> 4) + 1, n = (bytes[2] & 15) + 1;
    if ([16, 20, 24, 28, 32].indexOf(L) < 0) {
      return { ok: false, error: 'That does not look like a Keyfob card. The words are real, but they do not decode to a card.' };
    }
    if (w.length !== wordCount(L)) {
      return { ok: false, error: 'A card for this size of phrase is ' + wordCount(L) + ' words. You entered ' + w.length + '.' };
    }
    if (m < 2 || m > n || x < 1 || x > n) {
      return { ok: false, error: 'That does not look like a Keyfob card. The words are real, but they do not decode to a card.' };
    }
    const need = L + 5;
    const p = bytes.subarray(0, need);
    const sum = Sha256.digest(p.subarray(0, L + 3));
    if (p[L + 3] !== sum[0] || p[L + 4] !== sum[1]) {
      return { ok: false, checksum: true,
        error: 'Every word is real, but the card fails its own checksum. A word is mistyped, out of order, or from a different card.' };
    }
    return { ok: true, m: m, n: n, share: { x: x, y: new Uint8Array(p.subarray(3, 3 + L)) },
             id: Sha256.fingerprint(p, 3).toUpperCase() };
  }

  /** The short label printed on a card, so the app can tell one card from another. */
  const cardId = (share, m, n) => Sha256.fingerprint(payloadOf(share, m, n), 3).toUpperCase();

  /* ---------- the arithmetic, checked in front of you ----------
     Splits random secrets at random thresholds, reconstructs from random subsets,
     and confirms that one card short of the threshold never lands on the answer. */
  function selfTest(rounds) {
    rounds = rounds || 120;
    let combos = 0;
    for (let r = 0; r < rounds; r++) {
      const L = [16, 20, 24, 28, 32][r % 5];
      const n = 2 + (r % 7);
      const m = 2 + (r % (n - 1));
      const secret = randomBytes(L);
      const shares = split(secret, m, n);
      for (let t = 0; t < 4; t++) {
        const pick = shares.slice().sort(() => Math.random() - 0.5).slice(0, m);
        const got = combine(pick);
        combos++;
        for (let i = 0; i < L; i++) if (got[i] !== secret[i]) {
          return { ok: false, where: 'reconstruction with ' + m + ' of ' + n };
        }
      }
      if (m > 2) {
        const short = shares.slice(0, m - 1);
        const got = combine(short);
        let same = true;
        for (let i = 0; i < L; i++) if (got[i] !== secret[i]) { same = false; break; }
        if (same) return { ok: false, where: 'one card short of ' + m + ' reproduced the secret' };
      }
      const card = toCard(shares[0], m, n);
      const back = fromCard(card);
      if (!back.ok || back.m !== m || back.n !== n || back.share.x !== shares[0].x) {
        return { ok: false, where: 'card encoding at ' + m + ' of ' + n };
      }
      for (let i = 0; i < L; i++) if (back.share.y[i] !== shares[0].y[i]) {
        return { ok: false, where: 'card encoding at ' + m + ' of ' + n };
      }
    }
    return { ok: true, rounds: rounds, combos: combos };
  }

  return { split: split, combine: combine, toCard: toCard, fromCard: fromCard,
           cardId: cardId, wordCount: wordCount, randomBytes: randomBytes, selfTest: selfTest };
})();
