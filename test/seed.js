/* One believable plan, built in the page through the app's own modules and written to
   localStorage in exactly the shape the shipped 1.0.0 store wrote. Returns the card words. */
module.exports = async function seed(page, opts) {
  opts = opts || {};
  return page.evaluate((opts) => {
    const DAY = 86400000, now = Date.now();
    const PHRASE = ['describe', 'mask', 'expose', 'excite', 'screen', 'income',
                    'need', 'badge', 'dance', 'sock', 'option', 'phone'];
    const ent = Bip39.toEntropy(PHRASE).entropy;
    const m = 3, n = 5;
    const shares = Shamir.split(ent, m, n);
    const NAMES = ['Tomas Adeyemi', 'Priya Nair', 'Dad', 'Ellen Okoro', 'Bank box, Halifax'];
    const NOTES = ['fireproof box, Leeds', 'the safe at her practice', 'the tin in the loft',
                   'her filing cabinet at home', 'deposit box 214, opened 2019'];
    const rec = {
      v: 1,
      onboarded: true,
      plan: {
        created: now - 519 * DAY,
        rotated: now - 154 * DAY,
        m: m, n: n,
        wordCount: 12,
        elen: ent.length,
        cardWords: Shamir.wordCount(ent.length),
        fp: Sha256.fingerprint(ent, 4),
        practice: false,
        guardians: shares.map((s, i) => ({
          id: 'g' + (now).toString(36) + i,
          name: NAMES[i], note: NOTES[i],
          cardNo: s.x,
          cardId: Shamir.cardId(s, m, n),
          held: true,
          health: opts.health ? opts.health[i] : 'ok',
          confirmedAt: now - [9, 24, 6, 41, 88][i] * DAY
        }))
      },
      owner: 'Ruth Adeyemi',
      heirs: [{ id: 'h1', name: 'Kemi Adeyemi', relation: 'Daughter' },
              { id: 'h2', name: 'Tomas Adeyemi', relation: 'Brother, and executor' }],
      letter: 'Kemi, if you are reading this then the plan worked and I am not here. ' +
              'Ring Tomas first. He knows what this is and he has done the drill with me twice.',
      letterAt: now - 151 * DAY,
      drills: opts.noDrills ? [] : [
        { at: now - 96 * DAY, kind: 'heirs', gathered: 3, seconds: 1841, passed: true },
        { at: now - 371 * DAY, kind: 'self', gathered: 3, seconds: 604, passed: true },
        { at: now - 372 * DAY, kind: 'self', gathered: 2, seconds: 188, passed: false }
      ],
      quiz: { passed: true, at: now - 154 * DAY },
      settings: { haptics: true, conceal: true }
    };
    localStorage.setItem('keyfob.v1', JSON.stringify(rec));
    return shares.map(s => Shamir.toCard(s, m, n));
  }, opts);
};
