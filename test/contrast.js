/* WCAG contrast for every pairing Keyfob actually renders. node test/contrast.js */
const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = h => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const l1 = L(a), l2 = L(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
// blend a translucent wash over its ground so the measurement is what a user sees
const over = (fg, bg, a) => {
  const f = hex(fg), b = hex(bg);
  return '#' + [0, 1, 2].map(i => Math.round(f[i] * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
};
module.exports = { ratio, over };
if (require.main === module) {
  const T = process.argv[2] === '--light' ? 'light' : 'dark';
  const P = require('./palette.json')[T];
  const pairs = [
    ['body text', P.fg, P.bg], ['soft text', P.fgSoft, P.bg], ['faint text', P.fgFaint, P.bg],
    ['soft text on panel', P.fgSoft, P.bg2], ['faint text on panel', P.fgFaint, P.bg2],
    ['accent text', P.copper, P.bg], ['accent on panel', P.copper, P.bg2],
    ['accent on its own wash', P.copper, over(P.copper, P.bg, P.washA)],
    ['alert text', P.alert, P.bg], ['alert on its own wash', P.alert, over(P.alert, P.bg, P.washA)],
    ['primary button label', P.bg, P.fg],
    ['accent button label', P.onCopper, P.copper],
    ['tab label, off', P.fgFaint, P.bg], ['tab label, on', P.fg, P.bg],
    ['card words', P.fg, P.bg2], ['card label', P.copper, P.bg2],
    ['placeholder', P.fgFaint, P.bg2],
    ['hairline on ground', P.hair, P.bg]
  ];
  let worst = 99;
  for (const [name, a, b] of pairs) {
    const r = ratio(a, b);
    const need = name === 'hairline on ground' ? 1.2 : 4.5;
    if (name !== 'hairline on ground') worst = Math.min(worst, r);
    console.log((r >= need ? 'ok   ' : 'FAIL ') + name.padEnd(28) + a + ' on ' + b + '  ' + r.toFixed(2));
  }
  console.log('\nworst text pair: ' + worst.toFixed(2) + (worst >= 4.5 ? '  (AA)' : '  BELOW AA'));
}
