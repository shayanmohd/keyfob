/* Keyfob: what the mark actually renders as, with animations on and off.
   Android maps "animations off" to prefers-reduced-motion, and the mark is the app.
   Stopping travel is right; losing the metal is not. */
const seed = require('./seed');
module.exports = async ({ page, shot, wait, errors, log }) => {
  const sleep = wait;
  const reduced = process.argv.includes('--reduced-motion');
  const tag = reduced ? 'motion-off-' : 'motion-on-';

  await seed(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(900);

  const probe = await page.evaluate(() => {
    const g = document.querySelector('.mark-wrap .keymark');
    if (!g) return { error: 'no mark on the plan screen' };
    const cs = el => {
      const s = getComputedStyle(el);
      return { op: s.opacity, tr: s.transform, fill: s.fill, an: s.animationName,
               ad: s.animationDelay, du: s.animationDuration, vis: s.visibility, disp: s.display };
    };
    const box = el => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return {
      under: cs(g.querySelector('.km-under')),
      body: cs(g.querySelector('.km-body')),
      side0: cs(g.querySelector('.km-under .km-side')),
      face0: cs(g.querySelector('.km-body .km-face')),
      shardUnder0: cs(g.querySelector('.km-under .km-shard')),
      shardBody0: cs(g.querySelector('.km-body .km-shard')),
      underBox: box(g.querySelector('.km-under')),
      bodyBox: box(g.querySelector('.km-body')),
      rim: cs(g.querySelector('.km-rim rect')),
      sheen: g.querySelector('.km-sheen rect') ? cs(g.querySelector('.km-sheen rect')) : null,
      shards: g.querySelectorAll('.km-body .km-shard').length,
      unders: g.querySelectorAll('.km-under .km-shard').length
    };
  });
  if (probe.error) throw new Error(probe.error);
  for (const k of Object.keys(probe)) log(k + ': ' + JSON.stringify(probe[k]));

  // how many separate copper runs the shaft actually has, read off the pixels
  const runs = await page.evaluate(async () => {
    const svg = document.querySelector('.mark-wrap .keymark');
    const b = svg.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  log('mark box: ' + JSON.stringify(runs));
  await shot(tag + 'plan-mark');

  // and the same drawing everywhere else it appears
  await page.evaluate(() => App.startGather('drill-self'));
  await sleep(700);
  await shot(tag + 'gather-mark');
  await page.evaluate(() => { App.go('circle'); });
  await sleep(700);
  await shot(tag + 'circle');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(800);
  await shot(tag + 'onboard');
  await page.evaluate(() => { document.querySelector('#obNext').click(); });
  await sleep(700);
  await shot(tag + 'onboard-2');

  if (errors.length) throw new Error(errors.length + ' page errors');
};
