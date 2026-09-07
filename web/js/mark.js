/* Keyfob. The mark: one key, broken cleanly into shards.

   This is the app's whole idea in one drawing, and it is the same drawing as the
   launcher icon. A key that is whole is a key with one copy. Break it and each
   piece is a card in somebody else's hands: a shard is not a smaller key, it is
   not a key at all, and the gap between the pieces is the part that protects you.

   Every state a card can be in shows in its shard. A confirmed card is solid
   metal. A card nobody has checked lately is hatched and hollow. A lost card
   drifts out of line with the rest, which is exactly what it has done. */
const KeyMark = (function () {
  'use strict';

  /* The key, in a 320 x 118 box: round bow on the left, shaft, two teeth.
     Drawn as a mask so the hole in the bow is a hole, and so a shard can be
     any shape at all and still come out key shaped. */
  /* The key: the same drawing as the launcher icon, drawn a little longer because
     this one is looked at at three hundred pixels rather than forty eight. Round
     bow, rounded shaft, one long tooth and one short. */
  const W = 310, H = 104;
  const BOW = { cx: 48, cy: 55, r: 44, hole: 17.5 };
  const SHAPES =
    '<circle cx="48" cy="55" r="44"/>' +
    '<rect x="70" y="40" width="232" height="30" rx="15"/>' +
    '<rect x="232" y="52" width="16" height="46" rx="5.6"/>' +
    '<rect x="262" y="52" width="16" height="36" rx="5.6"/>';
  const X0 = 4, X1 = 302;           // the key's own extent, which is what gets divided
  const SHEAR = 8;                  // a break is never a straight vertical cut

  let seq = 0;
  const f = n => Math.round(n * 100) / 100;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Where the breaks fall. Not at even intervals along the whole key: the bow is
     one lump of metal and looks wrong sliced into three, so the breaks are spread
     across the shaft and the bow stays with the first card. */
  function cutAt(i, n) {
    const wide = n > 3;
    const A = X0 + (wide ? 0.22 : 0.30) * (X1 - X0);
    const B = X0 + (wide ? 0.86 : 0.85) * (X1 - X0);
    return A + (B - A) * i / n;
  }
  /** The break widens with the pieces, so five cards do not become five slivers. */
  function gapFor(n) {
    if (n < 2) return 0;
    const wide = n > 3;
    const span = ((wide ? 0.64 : 0.55) * (X1 - X0)) / n;
    return Math.max(7, Math.min(22, span * 0.36));
  }
  function spanOf(i, n, gap) {
    return [i === 0 ? X0 - 40 : cutAt(i, n) + gap / 2,
            i === n - 1 ? X1 + 40 : cutAt(i + 1, n) - gap / 2];
  }
  /** One shard as a sheared quadrilateral across the whole height of the box. */
  function shardPoints(i, n, gap) {
    const s = spanOf(i, n, gap);
    return [
      [f(s[0] + SHEAR), -20], [f(s[1] + SHEAR), -20],
      [f(s[1] - SHEAR), H + 20], [f(s[0] - SHEAR), H + 20]
    ].map(p => p.join(',')).join(' ');
  }

  /* A lost shard slides out of line with the others, because it has. */
  function driftOf(i, n) {
    const mid = (n - 1) / 2;
    const away = i === mid ? 0 : (i < mid ? -1 : 1);
    return { dx: away * 7, dy: (i % 2 ? 5 : -5), rot: away * 3.5 };
  }
  /* How far the metal is thrown down and right to show its thickness. Same light as
     the icon: from the top left, so the cut faces fall away from it. */
  const EX = 4, EY = 6;

  /** opts: { n, states:[], intact, numbers, sheen, label } */
  function svg(opts) {
    opts = opts || {};
    const intact = !!opts.intact;
    const n = intact ? 1 : Math.max(1, Math.min(12, opts.n || 3));
    const states = opts.states || [];
    const gap = intact ? 0 : gapFor(n);
    const id = 'km' + (++seq);
    const p = [];

    p.push('<svg viewBox="0 0 ' + W + ' ' + (opts.numbers ? H + 22 : H) + '" class="keymark' +
      (intact ? ' is-whole' : '') + '" role="img" aria-label="' +
      esc(opts.label || (intact ? 'a whole key' : 'a key in ' + n + ' shards')) + '">');

    p.push('<defs>');
    /* The mask region is drawn larger than the key, and backed in black across the
       whole of it, so a shard that overhangs the box has something to be hidden by. */
    p.push('<mask id="' + id + 'm" maskUnits="userSpaceOnUse" x="-80" y="-60" width="' + (W + 160) +
      '" height="' + (H + 120) + '">' +
      '<rect x="-80" y="-60" width="' + (W + 160) + '" height="' + (H + 120) + '" fill="#000"/>' +
      '<g fill="#fff">' + SHAPES + '</g>' +
      '<circle cx="' + BOW.cx + '" cy="' + BOW.cy + '" r="' + BOW.hole + '" fill="#000"/>' +
      '</mask>');
    p.push('<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" class="km-g0"/><stop offset="1" class="km-g1"/></linearGradient>');
    p.push('<linearGradient id="' + id + 'c" x1="0" y1="0" x2="0.3" y2="1">' +
      '<stop offset="0" class="km-c0"/><stop offset="1" class="km-c1"/></linearGradient>');
    p.push('<pattern id="' + id + 'h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">' +
      '<rect width="7" height="7" class="km-hatch-bg"/><rect width="2.6" height="7" class="km-hatch-fg"/></pattern>');
    /* the lit inner edge: the key, minus the same key nudged down and right, which
       leaves a sliver along the top of the outline and nothing along the joins */
    p.push('<mask id="' + id + 'r" maskUnits="userSpaceOnUse" x="-80" y="-60" width="' + (W + 160) +
      '" height="' + (H + 120) + '">' +
      '<g fill="#fff">' + SHAPES + '</g>' +
      '<circle cx="' + BOW.cx + '" cy="' + BOW.cy + '" r="' + BOW.hole + '" fill="#000"/>' +
      '<g fill="#000" transform="translate(2.6 4)">' + SHAPES + '</g>' +
      '</mask>');
    p.push('<linearGradient id="' + id + 's" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#fff" stop-opacity="0"/>' +
      '<stop offset="0.5" stop-color="#fff" stop-opacity="0.5"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>');
    p.push('</defs>');

    /* One shard, twice: the cut face underneath carrying the metal's thickness, then
       the lit face on top of it. Both move together, so a shard that drifts takes its
       own side with it. */
    function shards(cls, faceCls, fill) {
      const q = [];
      for (let i = 0; i < n; i++) {
        const st = intact ? 'whole' : (states[i] || 'ok');
        const d = st === 'lost' ? driftOf(i, n) : null;
        q.push('<g class="km-shard s-' + st + '"' +
          (d ? ' transform="translate(' + d.dx + ' ' + d.dy + ') rotate(' + d.rot + ' ' +
            (W / 2) + ' ' + (H / 2) + ')"' : '') +
          ' style="--i:' + i + '">');
        q.push('<polygon class="' + faceCls + '" points="' + shardPoints(i, n, gap) + '" fill="' + fill + '"/>');
        if (st === 'unsure' && faceCls === 'km-face') {
          q.push('<polygon class="km-hatch" points="' + shardPoints(i, n, gap) + '" fill="url(#' + id + 'h)"/>');
        }
        q.push('</g>');
      }
      return '<g class="' + cls + '" mask="url(#' + id + 'm)">' + q.join('') + '</g>';
    }

    /* The lit edge and the sheen are cut by the same breaks the metal is: a highlight
       that runs across a gap quietly undoes the one idea in the drawing. */
    const live = [];
    for (let i = 0; i < n; i++) {
      if (!intact && (states[i] || 'ok') === 'lost') continue;
      live.push('<polygon points="' + shardPoints(i, n, gap) + '"/>');
    }
    p.push('<clipPath id="' + id + 'p" clipPathUnits="userSpaceOnUse">' + live.join('') + '</clipPath>');

    p.push('<g class="km-stack">');
    p.push('<g transform="translate(' + EX + ' ' + EY + ')">' +
      shards('km-under', 'km-side', 'url(#' + id + 'c)') + '</g>');
    p.push(shards('km-body', 'km-face', 'url(#' + id + 'g)'));

    // the lit top edge, which is what makes it read as metal rather than a sticker
    p.push('<g class="km-rim" mask="url(#' + id + 'r)" clip-path="url(#' + id + 'p)">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '"/></g>');
    p.push('</g>');

    if (opts.sheen !== false && !intact) {
      p.push('<g class="km-sheen" mask="url(#' + id + 'm)" clip-path="url(#' + id + 'p)">' +
        '<rect x="-140" y="0" width="130" height="' + H + '" fill="url(#' + id + 's)"/></g>');
    }

    if (opts.numbers) {
      for (let i = 0; i < n; i++) {
        const s = spanOf(i, n, gap);
        const mid = Math.max(X0 + 12, Math.min(X1 - 12, (Math.max(s[0], X0) + Math.min(s[1], X1)) / 2));
        p.push('<text class="km-num n-' + (states[i] || 'ok') + '" x="' + f(mid) +
          '" y="' + (H + 16) + '">' + (i + 1) + '</text>');
      }
    }
    p.push('</svg>');
    return p.join('');
  }

  /** The states of a plan's guardians, in card order, for svg({ states }). */
  function statesOf(plan) {
    return plan.guardians.map(g =>
      g.health === 'lost' ? 'lost' : (g.health === 'unsure' || !g.held) ? 'unsure' : 'ok');
  }

  return { svg: svg, statesOf: statesOf };
})();
