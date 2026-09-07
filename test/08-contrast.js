/* Keyfob: WCAG contrast, measured off the running page rather than off a copy of
   the palette. Every token is read with getComputedStyle, so a colour that drifts in
   style.css is caught here. Surfaces that are gradients are checked at both ends,
   which is where a label on a button actually has its worst moment.

   node _shiptools/drive.js <url> test/08-contrast.js --out test/shots [--dark] */
const { ratio, over } = require('./contrast');

module.exports = async ({ page, wait, errors, log }) => {
  const dark = process.argv.includes('--dark');
  if (!dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(300);

  const V = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = ['--bg', '--bg-2', '--bg-3', '--fg', '--fg-soft', '--fg-faint', '--hair',
                   '--cu', '--cu-line', '--cu-lit', '--on-cu', '--btn-a', '--btn-b', '--alert'];
    const out = {};
    // resolve each token to rgb by painting it, so "var" chains and hex both come back the same way
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    for (const n of names) {
      probe.style.color = cs.getPropertyValue(n).trim();
      out[n] = getComputedStyle(probe).color;
    }
    document.body.removeChild(probe);
    out.scheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return out;
  });
  const hex = rgb => {
    const m = rgb.match(/\d+/g).slice(0, 3).map(Number);
    return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const C = {};
  for (const k of Object.keys(V)) C[k] = k === 'scheme' ? V[k] : hex(V[k]);
  log('theme reported by the page: ' + C.scheme);

  const wash = C.scheme === 'dark' ? 0.13 : 0.10;
  const alertWash = C.scheme === 'dark' ? 0.12 : 0.09;

  /* every pair the app actually paints. Where a surface is a gradient, both stops
     are listed, because the label does not get to choose which half it sits on. */
  const pairs = [
    ['body text on the ground', C['--fg'], C['--bg']],
    ['lead text on the ground', C['--fg-soft'], C['--bg']],
    ['help text on the ground', C['--fg-faint'], C['--bg']],
    ['help text on a panel top', C['--fg-faint'], C['--bg-2']],
    ['help text on a panel foot', C['--fg-faint'], C['--bg-3']],
    ['row value on a panel foot', C['--fg-faint'], C['--bg-3']],
    ['word grid number', C['--fg-faint'], C['--bg-3']],
    ['placeholder in a field', C['--fg-faint'], C['--bg-2']],
    ['card meta on the sheet foot', C['--fg-faint'], C['--bg-3']],
    ['card words on the sheet', C['--fg'], C['--bg-3']],
    ['bar subtitle', C['--fg-faint'], C['--bg-2']],
    ['tab label, resting', C['--fg-faint'], C['--bg']],
    ['tab label, current', C['--cu'], C['--bg']],
    ['accent text on the ground', C['--cu'], C['--bg']],
    ['accent on a brass panel', C['--cu'], over(C['--cu'], C['--bg'], wash)],
    ['fingerprint on a card sheet', C['--cu'], C['--bg-3']],
    ['alert text on the ground', C['--alert'], C['--bg']],
    ['alert on an alert panel', C['--alert'], over(C['--alert'], C['--bg'], alertWash)],
    ['primary button label, light end', C['--on-cu'], C['--btn-a']],
    ['primary button label, dark end', C['--on-cu'], C['--btn-b']],
    ['ghost button label, top', C['--fg'], C['--bg-2']],
    ['ghost button label, foot', C['--fg'], C['--bg-3']],
    ['disabled button label', C['--fg-faint'], C['--bg-2']],
    ['bar back button label', C['--fg-soft'], C['--bg-2']],
    ['danger button label', C['--alert'], C['--bg']],
    ['heir initials in the circle', C['--fg-faint'], C['--bg-2']],
    ['guardian initials, node top', C['--on-cu'], C['--btn-a']],
    ['guardian initials, node foot', C['--on-cu'], C['--btn-b']],
    ['guardian initials, unconfirmed', C['--fg'], C['--bg-2']],
    ['dot number, top', C['--on-cu'], C['--btn-a']],
    ['dot number, foot', C['--on-cu'], C['--btn-b']],
    ['focus ring against the ground', C['--cu-lit'], C['--bg']],
    ['shard number', C['--fg-faint'], C['--bg']],
    ['toast label', C['--fg'], C['--bg-3']],
    ['sheet body', C['--fg-soft'], C['--bg-2']],
    ['option label', C['--fg'], C['--bg-3']]
  ];

  let worst = 99, worstName = '';
  let bad = 0;
  for (const [name, a, b] of pairs) {
    const r = ratio(a, b);
    if (r < worst) { worst = r; worstName = name; }
    const need = name.indexOf('focus ring') === 0 ? 3 : 4.5;
    if (r < need) bad++;
    log((r >= need ? 'ok   ' : 'FAIL ') + name.padEnd(34) + a + ' on ' + b + '  ' + r.toFixed(2));
  }
  log('worst: ' + worstName + ' at ' + worst.toFixed(2));
  if (bad) throw new Error(bad + ' pairs below their WCAG bar in the ' + C.scheme + ' theme');
  if (errors.length) throw new Error(errors.length + ' page errors');
};
