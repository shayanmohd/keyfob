/* Keyfob. Every icon in the app, drawn here.

   One box (24), one stroke width (1.8), round caps and joins, one corner radius.
   Nothing here is a font glyph or an emoji, so the whole set scales, takes the
   colour of the text beside it, and looks like one hand drew it. */
const Icons = (function () {
  'use strict';

  const P = {
    /* the app's own subject: a key with one clean break in it */
    plan: '<circle cx="6.4" cy="12" r="3.6"/><path d="M10 12h3.1"/><path d="M15.6 12H21v2.4"/>' +
          '<path d="M18.2 12v2.2"/>',
    /* the circle: the phrase at the centre, cards around it */
    circle: '<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="4.6" r="1.5"/>' +
            '<circle cx="19" cy="9.7" r="1.5"/><circle cx="16.3" cy="18" r="1.5"/>' +
            '<circle cx="7.7" cy="18" r="1.5"/><circle cx="5" cy="9.7" r="1.5"/>',
    /* a rehearsal: round again, once a year */
    drill: '<path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8"/><path d="M20.6 3.4v4.4h-4.4"/>' +
           '<path d="M12 8.4v3.9l2.6 1.5"/>',
    /* the vault: a box with a keyhole in it, papers and proofs inside */
    vault: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.6"/>' +
           '<circle cx="12" cy="10.9" r="1.9"/><path d="M12 12.8v2.6"/>',
    chevron: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M12 6v12"/><path d="M6 12h12"/>',
    tick: '<path d="M4.8 12.6 9.4 17 19.2 6.8"/>',
    cross: '<path d="M6.4 6.4 17.6 17.6"/><path d="M17.6 6.4 6.4 17.6"/>',
    warn: '<path d="M12 4.6 21 19.4H3z"/><path d="M12 10v4"/><path d="M12 16.6v.1"/>',
    hand: '<path d="M4 15.5V9.2a1.5 1.5 0 0 1 3 0v4.1"/><path d="M7 12.8V7.4a1.5 1.5 0 0 1 3 0v5"/>' +
          '<path d="M10 12.4V8.2a1.5 1.5 0 0 1 3 0v4.4"/>' +
          '<path d="M13 12.6v-2a1.5 1.5 0 0 1 3 0v6a4.4 4.4 0 0 1-4.4 4.4H10A6 6 0 0 1 4 15"/>',
    paper: '<path d="M6 3.4h7.6L19 8.8v11.8H6z"/><path d="M13.4 3.4v5.6H19"/>' +
           '<path d="M9 13h7"/><path d="M9 16.4h5"/>',
    lock: '<rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.4"/>' +
          '<path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2V12l3.2 2"/>',
    person: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
    share: '<path d="M12 15.4V4.2"/><path d="M8 8.2 12 4.2l4 4"/>' +
           '<path d="M5.2 13.6v5.4a1.4 1.4 0 0 0 1.4 1.4h10.8a1.4 1.4 0 0 0 1.4-1.4v-5.4"/>',
    erase: '<path d="M5 7.2h14"/><path d="M9.4 7.2V4.8h5.2v2.4"/>' +
           '<path d="M6.8 7.2 7.8 20h8.4l1-12.8"/>',
    check2: '<circle cx="12" cy="12" r="8.4"/><path d="M8.2 12.2 11 15l4.9-5.4"/>'
  };

  /** One icon, sized in em so it sits on the line it is next to. */
  function svg(name, cls) {
    const d = P[name];
    if (!d) return '';
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + d + '</svg>';
  }

  return { svg: svg, has: n => !!P[n] };
})();
