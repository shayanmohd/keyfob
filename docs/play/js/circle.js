/* Keyfob. The custody circle: your phrase at the centre, the cards around it.

   Drawn as SVG so it stays sharp at any size and takes its colours from the
   stylesheet, which is what keeps one drawing working in both themes. */
const Circle = (function () {
  'use strict';

  const SIZE = 340, C = SIZE / 2;
  const R_RING = 114;         // guardians
  const R_HEIR = 152;         // heirs, outside the ring, holding nothing
  const R_NODE = 23;
  const R_CORE = 34;

  const pt = (angle, r) => [C + r * Math.cos(angle), C + r * Math.sin(angle)];
  const f = n => Math.round(n * 100) / 100;

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const stateOf = g => (g.health === 'lost' ? 'lost' : (g.health === 'unsure' || !g.held) ? 'unsure' : 'ok');

  /** SVG markup for a plan. opts: { interactive, heirs } */
  function svg(plan, opts) {
    opts = opts || {};
    const gs = plan.guardians;
    const n = gs.length;
    const parts = [];
    parts.push('<svg viewBox="0 0 ' + SIZE + ' ' + SIZE + '" class="circle" role="img" ' +
      'aria-label="' + esc(plan.m + ' of ' + n + ' custody circle') + '">');

    // the ring the cards sit on
    parts.push('<circle class="ring-line" cx="' + C + '" cy="' + C + '" r="' + R_RING + '"/>');

    // spokes, drawn first so the nodes sit on top
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const [x1, y1] = pt(a, R_CORE + 3);
      const [x2, y2] = pt(a, R_RING - R_NODE - 3);
      parts.push('<line class="spoke s-' + stateOf(gs[i]) + '" x1="' + f(x1) + '" y1="' + f(y1) +
                 '" x2="' + f(x2) + '" y2="' + f(y2) + '"/>');
    }

    // heirs: outside everything, joined to nothing, because they hold no card
    const hs = opts.heirs || [];
    if (hs.length) {
      const spread = Math.min(1.5, 0.34 * (hs.length - 1));
      for (let i = 0; i < hs.length; i++) {
        const a = Math.PI / 2 + (hs.length === 1 ? 0 : (-spread / 2 + spread * i / (hs.length - 1)));
        const [x, y] = pt(a, R_HEIR);
        parts.push('<g class="heir"><circle cx="' + f(x) + '" cy="' + f(y) + '" r="11"/>' +
          '<text x="' + f(x) + '" y="' + f(y + 3.5) + '">' + esc(initials(hs[i].name)) + '</text></g>');
      }
    }

    // the core: your phrase
    parts.push('<circle class="core" cx="' + C + '" cy="' + C + '" r="' + R_CORE + '"/>');
    parts.push('<rect class="core-mark" x="' + (C - 9) + '" y="' + (C - 9) + '" width="18" height="18" rx="4"/>');

    // the cards
    for (let i = 0; i < n; i++) {
      const g = gs[i];
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const [x, y] = pt(a, R_RING);
      const st = stateOf(g);
      parts.push('<g class="node n-' + st + '"' +
        (opts.interactive ? ' data-guardian="' + esc(g.id) + '" tabindex="0" role="button" aria-label="' +
          esc(g.name + ', card ' + g.cardNo) + '"' : '') + '>');
      parts.push('<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + R_NODE + '"/>');
      parts.push('<text x="' + f(x) + '" y="' + f(y + 5.5) + '">' + esc(initials(g.name)) + '</text>');
      if (st === 'lost') {
        parts.push('<line class="strike" x1="' + f(x - 15) + '" y1="' + f(y + 15) +
                   '" x2="' + f(x + 15) + '" y2="' + f(y - 15) + '"/>');
      }
      parts.push('</g>');
    }

    parts.push('</svg>');
    return parts.join('');
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { svg: svg, initials: initials, stateOf: stateOf };
})();
