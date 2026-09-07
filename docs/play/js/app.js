/* Keyfob. Screens, flows and the ceremony around the arithmetic.

   A note on where secrets live. Nothing in this file writes a recovery phrase or a
   guardian card to storage. The phrase exists as a local variable inside the build
   flow; the cards exist inside `issued` while the card screen is open. Leaving
   either screen drops the reference, and there is no other copy. */
const App = (function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const N = window.Native;

  const TABS = ['plan', 'circle', 'drill', 'vault'];
  let view = 'plan';        // the visible screen
  let tab = 'plan';         // the tab to come back to

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- small machinery ---------------- */

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function hideToast() { clearTimeout(toastTimer); $('#toast').hidden = true; }

  function haptic(kind) {
    if (!Store.settings().haptics || !N) return;
    try {
      if (kind === 'tap' && N.vibrate) N.vibrate(12, 90);
      else if (kind === 'seal' && N.vibratePattern) N.vibratePattern('[26,70,26,70,150]', 150);
      else if (kind === 'good' && N.vibratePattern) N.vibratePattern('[18,60,60]', 130);
      else if (kind === 'bad' && N.vibrate) N.vibrate(180, 200);
    } catch (e) {}
  }

  let sheetGo = null;
  function confirmSheet(title, body, goLabel, fn, soleButton) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').textContent = body;
    $('#sheetGo').textContent = goLabel;
    $('#sheetNo').hidden = !!soleButton;
    sheetGo = fn;
    $('#sheet').hidden = false;
  }
  function closeSheet() { $('#sheet').hidden = true; sheetGo = null; }

  function saveText(name, text) {
    if (N && N.saveFile) {
      let uri = '';
      try { uri = N.saveFile(name, 'text/plain', btoa(unescape(encodeURIComponent(text)))); } catch (e) {}
      toast(uri ? 'Saved to Downloads as ' + name : 'Could not write the file');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Saved as ' + name);
  }
  function shareText(subject, text) {
    if (N && N.shareText) { try { N.shareText(subject, text); return; } catch (e) {} }
    saveText(subject.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt', text);
  }

  /* ---------------- routing ---------------- */

  function show(id) {
    $$('.screen').forEach(s => { s.hidden = true; s.classList.remove('enter'); });
    const el = document.getElementById(id === 'onboard' ? 'onboard' : 'v-' + id);
    if (el) el.hidden = false;
    view = id;
    const onTab = TABS.indexOf(id) >= 0;
    $('#tabs').hidden = !onTab;
    document.body.classList.toggle('has-tabs', onTab);
    if (onTab) {
      tab = id;
      $$('.tab').forEach(b => b.classList.toggle('is-on', b.dataset.view === id));
    }
    const sc = el && el.querySelector('.scroller');
    if (sc) sc.scrollTop = 0;
    // a toast belongs to the screen that raised it
    hideToast();
    // a footbar sits where the toast wants to be
    const foot = el && el.querySelector('.footbar');
    document.documentElement.style.setProperty('--toast-lift',
      (onTab ? 66 : (foot && !foot.hidden) ? 62 : 8) + 'px');
    if (el) { void el.offsetWidth; el.classList.add('enter'); }
  }

  function go(id) {
    if (id === 'plan') renderPlan();
    else if (id === 'circle') renderCircle();
    else if (id === 'drill') renderDrill();
    else if (id === 'vault') renderVault();
    show(id);
  }

  /* ---------------- onboarding ---------------- */

  /* The three slides are the mark in three states: whole, broken, handed out.
     Everything else in the app is drawn from the same key. */
  const OB_ART = {
    whole: () => KeyMark.svg({ intact: true, label: 'one key, whole' }),
    split: () => KeyMark.svg({ n: 5, states: ['ok', 'ok', 'ok', 'ok', 'ok'],
                               label: 'the key in five shards' }),
    held: () => KeyMark.svg({ n: 5, numbers: true,
                              states: ['ok', 'unsure', 'ok', 'ok', 'unsure'],
                              label: 'five shards, in five pairs of hands' })
  };

  let obIndex = 0;
  function onboard() {
    const track = $('#obTrack');
    track.innerHTML = Content.INTRO.map(c =>
      '<article class="ob-card"><div class="ob-art mark-wrap">' + OB_ART[c.mark]() + '</div>' +
      '<p class="ob-line">' + esc(c.line) + '</p><p class="ob-sub">' + esc(c.sub) + '</p></article>').join('');
    $('#obDots').innerHTML = Content.INTRO.map((c, i) => '<i class="' + (i ? '' : 'on') + '"></i>').join('');
    obIndex = 0;
    paintOb();
  }
  function paintOb() {
    $$('#obTrack .ob-card').forEach(c => { c.style.transform = 'translateX(' + (-100 * obIndex) + '%)'; });
    $$('#obDots i').forEach((d, i) => d.classList.toggle('on', i === obIndex));
    $('#obNext').textContent = obIndex === Content.INTRO.length - 1 ? 'Build the plan' : 'Next';
  }
  function obNext() {
    if (obIndex < Content.INTRO.length - 1) { obIndex++; paintOb(); haptic('tap'); return; }
    Store.onboarded(true);
    startBuild('new');
  }

  /* ---------------- plan ---------------- */

  function renderPlan() {
    const p = Store.plan();
    const body = $('#planBody');
    if (!p) {
      $('#planSub').textContent = 'Nothing protected yet';
      body.innerHTML =
        '<div class="mark-wrap tall">' + KeyMark.svg({ intact: true, label: 'one key, whole' }) +
        '<p class="mark-cap">One key. One copy.</p></div>' +
        '<p class="h1">One phrase, one piece of paper, one bad afternoon.</p>' +
        '<p class="lead">Keyfob splits a recovery phrase you already hold into cards that mean ' +
        'nothing on their own, and writes down a plan somebody else could follow.</p>' +
        (Store.planBroken()
          ? panel('alert', 'warn', 'There is a plan on this phone that will not open',
              'The record is there and untouched, and this app cannot read it. Export the record ' +
              'from the vault before you build anything new. The cards already in circulation are ' +
              'unaffected: they never depended on this app.')
          : panel('', 'clock', '', 'You will need about fifteen minutes, your recovery phrase, and ' +
              'a pen. Nothing you type leaves this phone. Nothing can: the app has no internet ' +
              'permission at all.')) +
        '<div class="btnrow stack"><button class="btn" id="planStart" type="button">Build the plan</button>' +
        '<button class="btn ghost" id="planThreat" type="button">Read what this protects first</button></div>';
      $('#planStart').addEventListener('click', () => startBuild('new'));
      $('#planThreat').addEventListener('click', () => { renderThreat(); show('threat'); });
      return;
    }

    const h = Store.health();
    $('#planSub').textContent = p.m + ' of ' + p.n + ' · issued ' + Store.shortDate(p.rotated);

    const bits = [];
    bits.push('<div class="mark-wrap">' +
      KeyMark.svg({ n: p.n, states: KeyMark.statesOf(p), numbers: true,
                    label: 'your key in ' + p.n + ' shards' }) +
      '<p class="mark-cap">' + esc(cap(Content.word(h.reachable))) + ' reachable, ' +
      esc(Content.word(Math.max(0, h.spare))) + ' to spare</p></div>');
    bits.push('<p class="lead" style="text-align:center">' +
      esc(Content.shapeLines(p.m, p.n)[0]) + '<br><span class="fp">phrase ' + esc(fpDisplay(p.fp)) + '</span></p>');

    if (p.practice) {
      bits.push(panel('', 'warn', 'This plan protects a practice phrase',
        'Keyfob generated it here, on this phone, so you could rehearse. Never put money behind ' +
        'it. When you are ready, issue a new set from your real phrase.'));
    }

    // what needs doing, as plain sentences
    const todo = [];
    if (h.broken) {
      todo.push(['alert', 'Your plan cannot be recovered right now. Only ' +
        Content.word(h.reachable) + ' cards are reachable and you need ' + Content.word(p.m) +
        '. Issue a new set today.']);
    }
    if (h.undelivered > 0) {
      todo.push(['brass', cap(Content.word(h.undelivered)) + (h.undelivered === 1 ? ' card has' : ' cards have') +
        ' not been handed over yet. A card still on your phone is a card that does not protect you.']);
    }
    if (!h.everDrilled) {
      todo.push(['brass', 'You have never run a drill. A plan you have not rehearsed is a plan you are ' +
        'guessing about.']);
    } else if (h.drillMonths <= 0) {
      todo.push(['brass', 'Your last drill was ' + Store.ago(Store.lastDrill().at) + '. Once a year is the habit.']);
    }
    if (h.rotationMonths <= 0) {
      todo.push(['brass', 'These cards were issued ' + Store.ago(p.rotated) + '. A yearly rotation catches ' +
        'dead phones, moved houses and people who quietly stopped being in your life.']);
    }
    if (!Store.quiz().passed) {
      todo.push(['brass', 'You have not taken the comprehension check. It takes two minutes and it is the ' +
        'only part of this app that argues with you.']);
    }
    if (!Store.letter()) {
      todo.push(['brass', 'There is no estate document yet. Right now your plan only exists in your head ' +
        'and in this app.']);
    }

    if (todo.length) {
      bits.push('<p class="label">Needs you</p>');
      todo.forEach(t => bits.push('<div class="panel ' + (t[0] === 'alert' ? 'alert' : '') + '">' +
        '<div class="panel-h">' + Icons.svg(t[0] === 'alert' ? 'warn' : 'hand') +
        '<p class="body" style="margin:0">' + esc(t[1]) + '</p></div></div>'));
    } else {
      bits.push('<div class="panel brass"><div class="panel-h">' + Icons.svg('check2') +
        '<p class="body" style="margin:0">Everything is in order. ' +
        cap(Content.word(h.reachable)) + ' cards out, ' + Content.word(h.spare) + ' to spare, last drill ' +
        esc(Store.ago(Store.lastDrill().at)) + '.</p></div></div>');
    }

    bits.push('<p class="label">Standing</p><div class="rows stagger">');
    bits.push(rowStatic('Cards handed over', (p.n - h.undelivered) + ' of ' + p.n,
      h.lost ? Content.word(h.lost) + ' since marked lost' : ''));
    bits.push(rowStatic('Room for loss', h.spare < 0 ? 'none, the plan is short' :
      h.spare + (h.spare === 1 ? ' card' : ' cards'), ''));
    bits.push(rowStatic('Last drill', Store.lastDrill() ? Store.ago(Store.lastDrill().at) : 'never',
      Store.lastDrill() ? Store.longDate(Store.lastDrill().at) : ''));
    bits.push(rowStatic('Cards issued', Store.ago(p.rotated), Store.longDate(p.rotated)));
    bits.push('</div>');

    bits.push('<div class="btnrow stack">' +
      '<button class="btn" id="planDrill" type="button">Run a drill</button>' +
      '<button class="btn ghost" id="planCircle" type="button">Open the circle</button></div>');

    const ds = Store.drills().slice(0, 4);
    if (ds.length) {
      bits.push('<p class="label">Recently</p><div class="rows stagger">');
      ds.forEach(d => bits.push(rowStatic(drillSentence(d), Store.shortDate(d.at), '')));
      bits.push('</div>');
    }

    body.innerHTML = bits.join('');
    $('#planDrill').addEventListener('click', () => go('drill'));
    $('#planCircle').addEventListener('click', () => go('circle'));
  }

  function rowStatic(k, v, sub) {
    return '<div class="row"><div class="row-mid"><p class="row-k">' + esc(k) + '</p>' +
      (sub ? '<p class="row-v">' + esc(sub) + '</p>' : '') + '</div>' +
      '<span class="row-end">' + esc(v) + '</span></div>';
  }
  function rowButton(id, k, sub, end) {
    return '<button class="row" id="' + id + '" type="button"><div class="row-mid">' +
      '<p class="row-k">' + esc(k) + '</p>' + (sub ? '<p class="row-v">' + esc(sub) + '</p>' : '') +
      '</div>' + (end ? '<span class="row-end">' + esc(end) + '</span>' : '') +
      '<span class="row-chev">' + Icons.svg('chevron') + '</span></button>';
  }
  /** A panel with an icon against its heading, used where a panel is making a point. */
  function panel(kind, icon, title, body) {
    return '<div class="panel' + (kind ? ' ' + kind : '') + '">' +
      (title ? '<div class="panel-h">' + Icons.svg(icon) + '<p class="h3">' + esc(title) + '</p></div>' : '') +
      '<p class="body">' + body + '</p></div>';
  }
  const fpDisplay = fp => String(fp || '').toUpperCase().replace(/(.{4})(.{4})/, '$1 $2');
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  function drillSentence(d) {
    const who = d.kind === 'heirs' ? 'Inheritance drill' : 'Recovery drill';
    if (!d.passed) return who + ', did not complete';
    return who + ', ' + Content.word(d.gathered) + ' cards in ' + fmtSecs(d.seconds);
  }
  function fmtSecs(s) {
    s = Math.max(1, Math.round(s));
    if (s < 60) return s + (s === 1 ? ' second' : ' seconds');
    const m = Math.floor(s / 60), r = s % 60;
    return m + (m === 1 ? ' minute' : ' minutes') + (r ? ' ' + r + 's' : '');
  }

  /* ---------------- circle ---------------- */

  function renderCircle() {
    const p = Store.plan();
    const body = $('#circleBody');
    if (!p) {
      $('#circleSub').textContent = 'Nothing to draw yet';
      body.innerHTML = '<div class="empty-state">' +
        KeyMark.svg({ intact: true, label: 'one key, whole' }) +
        '<p class="empty-h">Nothing is split yet.</p>' +
        '<p class="empty-p">Build a plan and the circle appears here: your phrase at the centre, ' +
        'one card in each pair of hands around it.</p>' +
        '<button class="btn" id="circStart" type="button">Build the plan</button></div>';
      $('#circStart').addEventListener('click', () => startBuild('new'));
      return;
    }
    $('#circleSub').textContent = Content.word(p.m) + ' of ' + Content.word(p.n) + ' rebuild the phrase';

    const heirs = Store.heirs();
    const bits = [];
    bits.push('<div class="circle-wrap">' + Circle.svg(p, { interactive: true, heirs: heirs }) + '</div>');
    bits.push('<div class="legend"><span><i></i>holding it</span>' +
      '<span><i class="unsure"></i>not confirmed</span>' +
      '<span><i class="lost"></i>lost</span></div>');
    bits.push('<p class="help" style="text-align:center">The centre is your phrase. Nothing on this ' +
      'phone connects to it: the lines are the cards, and the cards are on paper.</p>');

    bits.push('<p class="label">The cards</p><div class="rows stagger">');
    p.guardians.forEach(g => {
      const st = Circle.stateOf(g);
      const sub = (g.note ? g.note + ' · ' : '') +
        (st === 'lost' ? 'marked lost' : st === 'unsure' ? (g.held ? 'not confirmed lately' : 'not handed over yet') : 'confirmed ' + Store.ago(g.confirmedAt || p.rotated));
      bits.push(rowButton('g-' + g.id, 'Card ' + g.cardNo + '. ' + g.name, sub, g.cardId));
    });
    bits.push('</div>');

    bits.push('<p class="label">Heirs</p>');
    if (heirs.length) {
      bits.push('<div class="rows">');
      heirs.forEach(hh => bits.push(rowStatic(hh.name, '', hh.relation || 'named in your letter')));
      bits.push('</div>');
      bits.push('<p class="help">Heirs hold no cards. They hold the letter and the estate document, ' +
        'which tell them who to call.</p>');
    } else {
      bits.push('<p class="help">Nobody named yet. Heirs hold no cards; they hold the instructions.</p>');
    }
    bits.push('<div class="btnrow stack">' +
      '<button class="btn ghost" id="circLetter" type="button">Heirs and the letter</button>' +
      '<button class="btn ghost" id="circRotate" type="button">Issue a new set of cards</button></div>');

    body.innerHTML = bits.join('');
    p.guardians.forEach(g => {
      const b = document.getElementById('g-' + g.id);
      if (b) b.addEventListener('click', () => openGuardian(g.id));
    });
    $$('#circleBody svg.circle [data-guardian]').forEach(node => {
      const id = node.getAttribute('data-guardian');
      node.addEventListener('click', () => openGuardian(id));
      node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGuardian(id); } });
    });
    $('#circLetter').addEventListener('click', () => { renderLetter(); show('letter'); });
    $('#circRotate').addEventListener('click', askRotate);
  }

  function askRotate() {
    confirmSheet('Issue a new set',
      'Every card you have handed out stops working, and the people holding them need the new ones. ' +
      'You will need your recovery phrase again, or the threshold in cards. Do this when someone has ' +
      'lost a card, when the circle should change, or once a year.',
      'Start the rotation', () => { closeSheet(); startBuild('rotate'); });
  }

  /* ---------------- one guardian ---------------- */

  let gdnId = null;
  function openGuardian(id) {
    gdnId = id;
    renderGuardian();
    show('guardian');
  }
  function renderGuardian() {
    const p = Store.plan();
    const g = Store.guardian(gdnId);
    if (!g) { go('circle'); return; }
    $('#gdnTitle').textContent = g.name;
    $('#gdnSub').textContent = 'Card ' + g.cardNo + ' of ' + p.n + ' · ' + g.cardId;
    const st = Circle.stateOf(g);
    const bits = [];
    bits.push('<div class="mark-wrap"><div style="max-width:180px;margin:0 auto">' +
      KeyMark.svg({ n: p.n, states: p.guardians.map((x, i) =>
          x.id === g.id ? (st === 'lost' ? 'lost' : 'ok') : 'faint'),
        label: 'the shard this card holds' }) + '</div>' +
      '<p class="mark-cap">Shard ' + g.cardNo + ' of ' + p.n + '</p></div>');
    bits.push('<div class="panel"><p class="body">' +
      (st === 'lost'
        ? 'This card counts as gone. ' + (Store.health().broken
            ? 'Without it the threshold can no longer be reached, so a new set is overdue.'
            : 'You have ' + Content.word(Store.health().spare) + ' still to spare, but issue a new set soon.')
        : g.held
          ? 'Handed over. On its own this card rebuilds nothing: ' + Content.word(p.m - 1) +
            ' more would be needed alongside it.'
          : 'Not handed over yet. Until it is in their hands it is not protecting you, and it does ' +
            'not exist anywhere any more, because Keyfob did not keep it.') + '</p></div>');

    bits.push('<div class="field"><label for="gdnName">Name</label>' +
      '<input type="text" id="gdnName" value="' + esc(g.name) + '">' +
      '<p class="err" id="gdnErr" hidden></p></div>');
    bits.push('<div class="field"><label for="gdnNote">Where it lives</label>' +
      '<input type="text" id="gdnNote" value="' + esc(g.note || '') + '" placeholder="the safe at her office"></div>');

    bits.push('<p class="label">Standing</p>');
    bits.push('<div class="btnrow stack" role="group" aria-label="Where this card stands">' +
      '<button class="btn ' + (st === 'ok' ? '' : 'ghost') + '" id="gdnOk" type="button" aria-pressed="' +
      (st === 'ok') + '">They have it, confirmed today</button>' +
      '<button class="btn ' + (st === 'unsure' ? '' : 'ghost') + '" id="gdnUnsure" type="button" aria-pressed="' +
      (st === 'unsure') + '">Not sure any more</button>' +
      '<button class="btn ' + (st === 'lost' ? 'danger' : 'ghost') + '" id="gdnLost" type="button" aria-pressed="' +
      (st === 'lost') + '">Lost, or out of reach</button></div>');
    bits.push('<p class="help">Confirming means you asked them and they looked. Guessing is how plans rot.</p>');

    bits.push('<hr class="rule"><p class="label">If this card is gone</p>');
    bits.push('<p class="body">Keyfob cannot print a replacement. It did not keep the card, and it did ' +
      'not keep the random numbers behind it, so there is no way to make a matching one. Replacing a ' +
      'card means issuing a fresh set to everybody, which also retires whatever the old holder had.</p>');
    bits.push('<button class="btn ghost wide" id="gdnRotate" type="button">Issue a new set of cards</button>');

    $('#gdnBody').innerHTML = bits.join('');
    $('#gdnName').addEventListener('change', e => {
      const v = e.target.value.trim();
      const err = $('#gdnErr');
      if (!v) {
        err.innerHTML = Icons.svg('warn') + '<span>A card has to be held by a name somebody can ' +
          'read out. Kept as ' + esc(g.name) + '.</span>';
        err.hidden = false;
        e.target.value = g.name;
        return;
      }
      err.hidden = true;
      Store.setGuardian(gdnId, { name: v });
      $('#gdnTitle').textContent = v;
    });
    $('#gdnNote').addEventListener('change', e => Store.setGuardian(gdnId, { note: e.target.value.trim() }));
    $('#gdnOk').addEventListener('click', () => {
      Store.setGuardian(gdnId, { health: 'ok', held: true, confirmedAt: Date.now() });
      haptic('tap'); renderGuardian(); toast('Confirmed');
    });
    $('#gdnUnsure').addEventListener('click', () => {
      Store.setGuardian(gdnId, { health: 'unsure' }); haptic('tap'); renderGuardian();
    });
    $('#gdnLost').addEventListener('click', () => {
      Store.setGuardian(gdnId, { health: 'lost' }); haptic('bad'); renderGuardian();
    });
    $('#gdnRotate').addEventListener('click', askRotate);
  }

  /* ---------------- drill ---------------- */

  function renderDrill() {
    const p = Store.plan();
    const body = $('#drillBody');
    if (!p) {
      $('#drillSub').textContent = 'Nothing to rehearse yet';
      body.innerHTML = '<div class="empty-state">' +
        KeyMark.svg({ intact: true, label: 'one key, whole' }) +
        '<p class="empty-h">Nothing to rehearse yet.</p>' +
        '<p class="empty-p">A drill is a rehearsal of the day this matters. There is nothing to ' +
        'rehearse until you have a plan.</p>' +
        '<button class="btn" id="drillStart" type="button">Build the plan</button></div>';
      $('#drillStart').addEventListener('click', () => startBuild('new'));
      return;
    }
    const last = Store.lastDrill();
    $('#drillSub').textContent = last ? 'Last passed ' + Store.ago(last.at) : 'Never run';

    const bits = [];
    bits.push('<p class="h1">Find out now, not then.</p>');
    bits.push('<p class="lead">A drill is the real thing with nothing at stake. You collect ' +
      Content.word(p.m) + ' cards from the people holding them and type them in. Keyfob rebuilds the ' +
      'phrase, checks it against the fingerprint, and then forgets it again. The phrase is never ' +
      'shown during a drill.</p>');

    bits.push('<div class="panel"><div class="panel-h">' + Icons.svg('hand') +
      '<p class="h3">You lost your phone</p></div>' +
      '<p class="body">You are alive and doing this yourself. Ring round, gather ' + Content.word(p.m) +
      ' cards, and see how long it actually takes.</p>' +
      '<button class="btn wide" id="drillSelf" type="button">Run the recovery drill</button></div>');

    bits.push('<div class="panel"><div class="panel-h">' + Icons.svg('person') +
      '<p class="h3">You are not here</p></div>' +
      '<p class="body">Stand in for your heirs. Read only the estate document, do not help from ' +
      'memory, and find out whether the instructions you left are enough. This is the drill families ' +
      'remember.</p>' +
      '<button class="btn wide" id="drillHeirs" type="button">Run the inheritance drill</button></div>');

    const ds = Store.drills();
    bits.push('<p class="label">Drill log</p>');
    if (!ds.length) {
      bits.push('<p class="empty">Nothing here yet. The first drill is the one that finds things.</p>');
    } else {
      bits.push('<div class="rows stagger">');
      ds.forEach(d => bits.push(rowStatic(drillSentence(d), Store.shortDate(d.at), '')));
      bits.push('</div>');
      bits.push('<p class="help">Times get faster and then slower again, as people move and forget. ' +
        'The slow ones are the useful ones.</p>');
    }
    body.innerHTML = bits.join('');
    $('#drillSelf').addEventListener('click', () => startGather('drill-self'));
    $('#drillHeirs').addEventListener('click', () => startGather('drill-heirs'));
  }

  /* ---------------- vault ---------------- */

  function renderVault() {
    const p = Store.plan();
    const s = Store.settings();
    const q = Store.quiz();
    const bits = [];

    bits.push('<p class="label">Understanding</p><div class="rows stagger">');
    bits.push(rowButton('vQuiz', 'The comprehension check',
      q.passed ? 'Passed ' + Store.ago(q.at) : 'Five questions. Wrong answers get a gentler explanation.',
      q.passed ? 'passed' : ''));
    bits.push(rowButton('vThreat', 'What this protects', 'And, at the same length, what it does not', ''));
    bits.push(rowButton('vFormat', 'Check the arithmetic', 'Run the sharing maths here and now', ''));
    bits.push('</div>');

    bits.push('<p class="label">Papers</p><div class="rows stagger">');
    bits.push(rowButton('vLetter', 'Heirs and the letter',
      Store.letter() ? 'Updated ' + Store.ago(Store.letterAt()) : 'Not written yet', ''));
    bits.push(rowButton('vEstate', 'The estate document',
      p ? 'Who holds what, with no card words in it' : 'Available once you have a plan', ''));
    bits.push('</div>');

    if (p) {
      bits.push('<p class="label">The phrase</p><div class="rows stagger">');
      bits.push(rowButton('vRebuild', 'Rebuild the phrase',
        'Gather ' + Content.word(p.m) + ' cards and read the phrase back', ''));
      bits.push(rowButton('vRotate', 'Issue a new set of cards', 'Retires every card now in circulation', ''));
      bits.push('</div>');
    }

    bits.push('<p class="label">Settings</p><div class="rows stagger">');
    bits.push(rowButton('vHaptic', 'Haptics', 'A short pulse when a ceremony completes', s.haptics ? 'on' : 'off'));
    bits.push(rowButton('vConceal', 'Open cards covered', 'Words stay hidden until you ask for them',
      s.conceal ? 'on' : 'off'));
    bits.push('</div>');

    bits.push('<p class="label">This device</p><div class="rows stagger">');
    bits.push(rowButton('vExport', 'Export the record', 'Names, dates and fingerprints, as JSON', ''));
    bits.push(rowButton('vErase', 'Erase everything', 'Cards already handed out keep working', ''));
    bits.push('</div>');

    bits.push('<p class="colophon">Keyfob. Backup and inheritance for a recovery phrase you ' +
      'already hold.<br>No account, no network, no purchase, no wallet.</p>');

    $('#vaultBody').innerHTML = bits.join('');

    $('#vQuiz').addEventListener('click', () => startQuiz('full'));
    $('#vThreat').addEventListener('click', () => { renderThreat(); show('threat'); });
    $('#vFormat').addEventListener('click', runSelfTest);
    $('#vLetter').addEventListener('click', () => { renderLetter(); show('letter'); });
    $('#vEstate').addEventListener('click', () => {
      if (!Store.plan()) { toast('Build a plan first'); return; }
      const text = estateDocument();
      confirmSheet('The estate document',
        'It names your guardians, the card each one holds and the steps to follow, and it contains no ' +
        'card words, so it is safe beside your will. Read it once before you file it.',
        'Save and share', () => { closeSheet(); shareText('Keyfob estate document', text); });
    });
    if (p) {
      $('#vRebuild').addEventListener('click', () => {
        confirmSheet('Rebuild the phrase',
          'The finished phrase appears on this screen. Anyone who can see it can spend whatever it ' +
          'controls. Do this alone, and close the screen when you are done.',
          'I am alone', () => { closeSheet(); startGather('rebuild'); });
      });
      $('#vRotate').addEventListener('click', askRotate);
    }
    $('#vHaptic').addEventListener('click', () => { Store.settings({ haptics: !s.haptics }); haptic('tap'); renderVault(); });
    $('#vConceal').addEventListener('click', () => { Store.settings({ conceal: !s.conceal }); renderVault(); });
    $('#vExport').addEventListener('click', () => {
      saveText('keyfob-record-' + new Date().toISOString().slice(0, 10) + '.json', Store.exportJson());
    });
    $('#vErase').addEventListener('click', () => {
      confirmSheet('Erase everything',
        'Every name, date and fingerprint on this phone goes. The cards you handed out are unaffected ' +
        'and still rebuild your phrase, because they never depended on this app.',
        'Erase it all', () => { closeSheet(); Store.erase(); toast('Erased'); location.reload(); });
    });
  }

  function runSelfTest() {
    const row = $('#vFormat');
    const mid = row && row.querySelector('.row-mid');
    if (mid) mid.innerHTML = '<p class="row-k">Check the arithmetic</p>' +
      '<p class="busy" style="margin:4px 0 0"><i></i>Splitting and rebuilding, on this phone</p>';
    if (row) row.disabled = true;
    setTimeout(() => {
      const r = Shamir.selfTest(120);
      renderVault();
      if (r.ok) {
        haptic('good');
        confirmSheet('The arithmetic holds',
          'Keyfob just split ' + r.rounds + ' random secrets at random thresholds, rebuilt each one from ' +
          r.combos + ' different combinations of cards, confirmed that one card short of the threshold ' +
          'never lands on the answer, and read every card back through the word format. All of it on ' +
          'this phone, just now.',
          'Good', closeSheet, true);
      } else {
        confirmSheet('Something is wrong', 'The check failed at: ' + r.where +
          '. Do not trust cards issued by this copy of the app.', 'Understood', closeSheet, true);
      }
    }, 60);
  }

  /* ---------------- threat model ---------------- */

  function renderThreat() {
    const bits = [];
    Content.THREAT.forEach(sec => {
      bits.push('<h2 class="h2">' + esc(sec.h) + '</h2>');
      (sec.p || []).forEach(t => bits.push('<p class="body">' + esc(t) + '</p>'));
      if (sec.list) {
        bits.push('<dl class="deflist">');
        sec.list.forEach(pair => bits.push('<dt>' + esc(pair[0]) + '</dt><dd>' + esc(pair[1]) + '</dd>'));
        bits.push('</dl>');
      }
      if (sec.after) bits.push('<p class="body" style="margin-top:16px">' + esc(sec.after) + '</p>');
    });
    bits.push('<hr class="rule"><h2 class="h2">How a card is put together</h2>');
    Content.FORMAT.forEach(t => bits.push('<p class="body">' + esc(t) + '</p>'));
    bits.push('<p class="help">The estate document carries a full description of the format, so a ' +
      'programmer could rebuild your phrase from the cards without this app ever existing.</p>');
    $('#threatBody').innerHTML = bits.join('');
  }

  /* ---------------- heirs and the letter ---------------- */

  function renderLetter() {
    const hs = Store.heirs();
    $('#letterSub').textContent = hs.length
      ? Content.word(hs.length) + (hs.length === 1 ? ' heir named' : ' heirs named') : 'Nobody named yet';
    const bits = [];
    bits.push('<p class="lead">Heirs hold no cards. What they need is a name to call, a document to ' +
      'follow, and a letter that sounds like you.</p>');

    bits.push('<div class="field"><label for="ownName">Your name, for the document</label>' +
      '<input type="text" id="ownName" value="' + esc(Store.owner()) + '" placeholder="Ruth Adeyemi"></div>');

    bits.push('<p class="label">Heirs</p>');
    if (hs.length) {
      bits.push('<div class="rows">');
      hs.forEach(h => bits.push('<div class="row"><div class="row-mid"><p class="row-k">' + esc(h.name) +
        '</p><p class="row-v">' + esc(h.relation || 'no relation noted') + '</p></div>' +
        '<button class="btn ghost small" data-drop="' + esc(h.id) + '" type="button">Remove</button></div>'));
      bits.push('</div>');
    } else {
      bits.push('<p class="empty">Nobody yet.</p>');
    }
    bits.push('<div class="field" style="margin-top:14px"><label for="heirName">Add an heir</label>' +
      '<input type="text" id="heirName" placeholder="Name"></div>' +
      '<div class="field"><input type="text" id="heirRel" placeholder="Daughter, business partner, executor"></div>' +
      '<p class="err" id="heirErr" hidden></p>' +
      '<button class="btn ghost" id="heirAdd" type="button">Add</button>');

    bits.push('<hr class="rule"><p class="label">The letter</p>');
    bits.push('<p class="body">It is released by nothing and guarded by nothing. It sits in this app ' +
      'in plain text until you put it somewhere: printed with the estate document, or with your will. ' +
      'Keyfob will not pretend to hold it for you until the day.</p>');
    bits.push('<textarea id="letterText" placeholder="What you would want them to read first.">' +
      esc(Store.letter()) + '</textarea>');
    bits.push('<div class="btnrow"><button class="btn" id="letterSave" type="button">Save the letter</button>' +
      '<button class="btn ghost" id="letterDoc" type="button">Build the estate document</button></div>');
    bits.push('<p class="help">The estate document gathers your name, the holders, the threshold, the ' +
      'steps and this letter into one page you can print.</p>');

    $('#letterBody').innerHTML = bits.join('');
    $('#ownName').addEventListener('change', e => Store.owner(e.target.value.trim()));
    $('#heirAdd').addEventListener('click', () => {
      const n = $('#heirName').value.trim();
      const err = m => {
        const e = $('#heirErr');
        e.innerHTML = Icons.svg('warn') + '<span>' + esc(m) + '</span>';
        e.hidden = false;
        $('#heirName').focus();
      };
      if (!n) { err('A name first. This is who your family calls.'); return; }
      if (Store.heirs().some(h => h.name.toLowerCase() === n.toLowerCase())) {
        err(n + ' is already named. Two heirs with one name would read as one person.');
        return;
      }
      Store.addHeir(n, $('#heirRel').value.trim());
      haptic('tap'); renderLetter();
    });
    $$('#letterBody [data-drop]').forEach(b =>
      b.addEventListener('click', () => { Store.removeHeir(b.dataset.drop); renderLetter(); }));
    $('#letterSave').addEventListener('click', () => {
      Store.letter($('#letterText').value);
      haptic('tap'); toast('Letter saved on this phone'); renderLetter();
    });
    $('#letterDoc').addEventListener('click', () => {
      Store.letter($('#letterText').value);
      if (!Store.plan()) {
        const e = $('#heirErr');
        e.innerHTML = Icons.svg('warn') + '<span>The document lists who holds which card, so it ' +
          'needs a plan first.</span>';
        e.hidden = false;
        return;
      }
      shareText('Keyfob estate document', estateDocument());
    });
  }

  /* ---------------- the estate document ---------------- */

  function estateDocument() {
    const p = Store.plan();
    const owner = Store.owner() || 'the person who set this up';
    const L = [];
    const line = s => L.push(s == null ? '' : s);
    line('KEYFOB ESTATE DOCUMENT');
    line('Prepared by ' + owner + ' on ' + Store.longDate(Date.now()) + '.');
    line('');
    line('Keep this with your will. It contains no card words. Anyone who reads it learns who to');
    line('call and nothing they could use on their own.');
    line('');
    line('THE SHORT VERSION');
    line('There is a cryptocurrency recovery phrase. It is not written down anywhere as one piece.');
    line('It was split into ' + p.n + ' cards. Any ' + p.m + ' of them rebuild it. Fewer than ' + p.m + ' rebuild nothing at all.');
    line('The phrase fingerprint is ' + String(p.fp).toUpperCase() + ', which confirms a rebuilt phrase is the right one.');
    line('');
    line('WHO HOLDS THE CARDS');
    p.guardians.forEach(g => {
      line('  Card ' + g.cardNo + '  ' + pad(g.name, 26) + ' label ' + g.cardId +
        (g.note ? '   (' + g.note + ')' : '') +
        (g.health === 'lost' ? '   [MARKED LOST]' : ''));
    });
    line('');
    if (Store.heirs().length) {
      line('WHO THIS IS FOR');
      Store.heirs().forEach(h => line('  ' + pad(h.name, 26) + (h.relation || '')));
      line('');
    }
    line('WHAT TO DO');
    line('1. Contact the holders above until ' + p.m + ' of them have their cards in front of them.');
    line('   A card is a list of ' + p.cardWords + ' ordinary English words.');
    line('2. Install Keyfob from Google Play on a phone you trust. Package com.mohdshayan.keyfob.');
    line('   It is free, it has no account, and it cannot reach the internet.');
    line('3. In Keyfob choose Vault, then Rebuild the phrase, and type the ' + p.m + ' cards in.');
    line('4. The phrase appears on that screen. It is rebuilt on the device and sent nowhere.');
    line('5. Anyone who can read the phrase can spend whatever it controls. Choose the room carefully.');
    line('');
    line('IF KEYFOB NO LONGER EXISTS');
    line('The cards are plain Shamir secret sharing and can be rebuilt by any competent programmer.');
    line('Each card decodes as follows. Take the ' + p.cardWords + ' words and replace each with its zero based');
    line('index in the standard BIP-39 English word list. Write each index as 11 bits, join them in');
    line('order, and read the result as bytes, discarding the leftover bits at the end.');
    line('  byte 0      the card number, which is the x coordinate of this point');
    line('  byte 1      the length of the secret in bytes, here ' + p.elen);
    line('  byte 2      high nibble is the threshold minus one, low nibble is the card count minus one');
    line('  bytes 3..   the share itself, ' + p.elen + ' bytes');
    line('  last 2      the first two bytes of the SHA-256 of everything before them');
    line('Treat each share byte as a point (x, y) in GF(2^8) modulo the polynomial 0x11B, the one AES');
    line('uses. Lagrange interpolate the ' + p.m + ' points at x = 0, byte by byte. The result is the entropy');
    line('behind the phrase: ' + p.elen + ' bytes, which converts back to the ' + p.wordCount + ' word phrase by the standard');
    line('BIP-39 rule, appending the first ' + (p.elen * 8 / 32) + ' bits of its SHA-256 as a checksum and reading 11 bits');
    line('per word.');
    line('');
    if (Store.letter()) {
      line('A LETTER');
      line('');
      String(Store.letter()).split('\n').forEach(l => line(l));
      line('');
    }
    line('Written by Keyfob. The app never held the phrase and never held a card.');
    return L.join('\n');
  }
  function pad(s, n) {
    s = String(s);
    return s.length >= n ? s : s + new Array(n - s.length + 1).join(' ');
  }

  /* ---------------- comprehension check ---------------- */

  let quiz = null;   // { list, i, answered, mode, after }
  function shuffled(q) {
    const a = q.a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return { q: q.q, a: a, why: q.why };
  }
  function startQuiz(mode, after) {
    const list = (mode === 'short' ? pickTwo() : Content.QUIZ.slice()).map(shuffled);
    quiz = { list: list, i: 0, answered: false, mode: mode, after: after || null };
    renderQuiz();
    show('quiz');
  }
  function pickTwo() {
    const pool = Content.QUIZ.slice();
    const out = [];
    while (out.length < 2 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  function renderQuiz() {
    const q = quiz.list[quiz.i];
    $('#quizSub').textContent = 'Question ' + (quiz.i + 1) + ' of ' + quiz.list.length;
    const bits = [];
    bits.push('<p class="h1">' + esc(q.q) + '</p>');
    q.a.forEach((opt, i) => {
      bits.push('<button class="opt" data-i="' + i + '" type="button">' +
        '<span class="opt-t">' + esc(opt.t) + '</span></button>');
    });
    bits.push('<div id="quizWhy"></div>');
    $('#quizBody').innerHTML = bits.join('');
    $$('#quizBody .opt').forEach(b => b.addEventListener('click', () => answer(parseInt(b.dataset.i, 10))));
  }
  function answer(i) {
    if (quiz.answered) return;
    const q = quiz.list[quiz.i];
    const right = !!q.a[i].ok;
    quiz.answered = true;
    $$('#quizBody .opt').forEach((b, k) => {
      b.disabled = true;
      if (q.a[k].ok) { b.classList.add('right'); b.insertAdjacentHTML('afterbegin', Icons.svg('tick')); }
      else if (k === i) { b.classList.add('wrong'); b.insertAdjacentHTML('afterbegin', Icons.svg('cross')); }
    });
    haptic(right ? 'good' : 'bad');
    const why = $('#quizWhy');
    why.innerHTML = '<div class="panel ' + (right ? 'brass' : 'alert') + '"><div class="panel-h">' +
      Icons.svg(right ? 'check2' : 'warn') +
      '<p class="body" style="margin:0">' + (right ? '' : '<strong>Not quite.</strong> ') +
      esc(q.why) + '</p></div></div>' +
      '<button class="btn wide" id="quizNext" type="button">' +
      (!right ? 'Answer it again' : quiz.i + 1 < quiz.list.length ? 'Next question' : 'Done') + '</button>';
    $('#quizNext').addEventListener('click', () => {
      if (!right) {
        quiz.list[quiz.i] = shuffled(quiz.list[quiz.i]);
        quiz.answered = false; renderQuiz();
        return;
      }
      if (quiz.i + 1 < quiz.list.length) { quiz.i++; quiz.answered = false; renderQuiz(); return; }
      if (quiz.mode === 'full') { Store.quiz(true); toast('Comprehension check complete'); }
      const after = quiz.after;
      quiz = null;
      if (after) after(); else { renderVault(); show('vault'); }
    });
  }

  /* ---------------- building the plan ---------------- */

  let build = null;
  /* build = { mode, step, grid, wordCount, entropy, m, n, people[], quizDone } */

  function startBuild(mode, seedEntropy) {
    const old = Store.plan();
    build = {
      mode: mode,
      step: seedEntropy ? 2 : 0,
      wordCount: old && mode === 'rotate' ? old.wordCount : 12,
      entropy: seedEntropy || null,
      practice: !!(old && mode === 'rotate' && seedEntropy && old.practice),
      m: old ? old.m : 3,
      n: old ? old.n : 5,
      people: old ? old.guardians.map(g => ({ name: g.name, note: g.note || '' })) : [],
      grid: null
    };
    if (seedEntropy) build.wordCount = Bip39.toPhrase(seedEntropy).length;
    renderBuild();
    show('build');
  }

  const BUILD_STEPS = ['Before you start', 'Your recovery phrase', 'The shape of the plan',
                       'Who holds a card', 'One last check'];

  function renderBuild() {
    const b = build;
    // a step of the ceremony is a screen: the toast the last one raised does not follow it
    hideToast();
    $('#buildTitle').textContent = b.mode === 'rotate' ? 'New set of cards' : 'Build the plan';
    $('#buildStep').textContent = 'Step ' + (b.step + 1) + ' of ' + BUILD_STEPS.length;
    $('#buildBarFill').style.width = Math.round(((b.step) / (BUILD_STEPS.length - 1)) * 100) + '%';
    const body = $('#buildBody'), foot = $('#buildFoot');
    body.innerHTML = ''; foot.innerHTML = '';
    ({ 0: stepBefore, 1: stepPhrase, 2: stepShape, 3: stepPeople, 4: stepCheck })[b.step](body, foot);
    body.scrollTop = 0;
  }

  function footButtons(foot, primary, onPrimary, ghost, onGhost, disabled) {
    foot.innerHTML = (ghost ? '<button class="btn ghost" id="fGhost" type="button">' + esc(ghost) + '</button>' : '') +
      '<button class="btn" id="fGo" type="button"' + (disabled ? ' disabled' : '') + '>' + esc(primary) + '</button>';
    $('#fGo').addEventListener('click', () => { if (!$('#fGo').disabled) onPrimary(); });
    if (ghost) $('#fGhost').addEventListener('click', onGhost);
  }

  function stepBefore(body, foot) {
    body.innerHTML =
      '<p class="h1">' + (build.mode === 'rotate' ? 'A new set retires the old one.' : 'Three things before you type anything.') + '</p>' +
      (build.mode === 'rotate'
        ? '<p class="lead">Every card in circulation stops working the moment you finish. The people ' +
          'holding them will need the new ones, so do this when you can reach them.</p>'
        : '') +
      '<div class="panel"><p class="h3">Be alone.</p><p class="body">Your phrase will be on this ' +
      'screen. Not in a cafe, not on a video call, not with the television on behind you.</p></div>' +
      '<div class="panel"><p class="h3">Have a pen.</p><p class="body">The cards Keyfob makes are ' +
      'meant to be written out by hand. They exist on the card screen and nowhere else, not even ' +
      'here, once you leave it.</p></div>' +
      '<div class="panel"><p class="h3">Trust this phone.</p><p class="body">Keyfob cannot see past ' +
      'itself. If something else on this device is reading the screen or the keyboard, no app can ' +
      'save you from it. Keyfob itself has no way to send anything anywhere: there is no internet ' +
      'permission in its manifest.</p></div>' +
      '<p class="help">If you would rather rehearse first, the next step can generate a practice ' +
      'phrase instead of asking for yours.</p>';
    footButtons(foot, 'I am ready', () => { build.step = 1; renderBuild(); });
  }

  function stepPhrase(body, foot) {
    body.innerHTML =
      '<p class="h1">Type your recovery phrase.</p>' +
      '<p class="lead">Each word completes from the standard list, and the phrase carries its own ' +
      'checksum, so a wrong word is caught here rather than in ten years.</p>' +
      '<div class="btnrow" id="lenRow"></div>' +
      '<div id="gridHost"></div>' +
      '<div class="panel" id="phraseState"><p class="body">Waiting for ' +
      Content.word(build.wordCount) + ' words.</p></div>' +
      '<div class="btnrow stack">' +
      '<button class="btn ghost" id="practiceBtn" type="button">Use a practice phrase instead</button>' +
      '<button class="btn ghost" id="clearBtn" type="button">Clear the grid</button></div>' +
      '<p class="help">A practice phrase is generated on this phone so you can run the whole ' +
      'ceremony without your real one. Never put money behind a phrase a phone made for you.</p>';

    $('#lenRow').innerHTML = [12, 15, 18, 21, 24].map(n =>
      '<button class="btn ' + (n === build.wordCount ? '' : 'ghost') + ' small" data-len="' + n + '" type="button">' +
      n + ' words</button>').join('');
    $$('#lenRow [data-len]').forEach(b => b.addEventListener('click', () => {
      // keep what is already typed: on a 24 word phrase, losing it to a mistap is brutal
      build.carry = build.grid ? build.grid.words() : null;
      build.wordCount = parseInt(b.dataset.len, 10);
      build.practice = false;
      renderBuild();
    }));

    build.grid = WordGrid.create($('#gridHost'), { count: build.wordCount, onChange: checkPhrase });
    if (build.entropy && Bip39.toPhrase(build.entropy).length === build.wordCount) {
      build.grid.setWords(Bip39.toPhrase(build.entropy));
    } else if (build.carry && build.carry.some(Boolean)) {
      build.grid.setWords(build.carry.slice(0, build.wordCount));
    }
    build.carry = null;
    $('#practiceBtn').addEventListener('click', () => {
      const ent = Shamir.randomBytes(build.wordCount === 12 ? 16 : build.wordCount === 15 ? 20 :
        build.wordCount === 18 ? 24 : build.wordCount === 21 ? 28 : 32);
      build.practice = true;
      build.grid.setWords(Bip39.toPhrase(ent));
      haptic('tap');
      toast('A practice phrase, made here, just now');
    });
    $('#clearBtn').addEventListener('click', () => { build.practice = false; build.carry = null; build.grid.clear(); });
    footButtons(foot, 'Continue', () => { build.step = 2; renderBuild(); },
      'Back', () => { build.step = 0; renderBuild(); }, true);
    checkPhrase(build.grid.words());
  }

  function checkPhrase(words) {
    const filled = words.filter(Boolean).length;
    const panel = $('#phraseState');
    const go = $('#fGo');
    if (!panel) return;
    if (filled < words.length) {
      panel.className = 'panel';
      panel.innerHTML = '<p class="body">' + Content.word(words.length - filled) +
        (words.length - filled === 1 ? ' word' : ' words') + ' still to go.</p>';
      if (go) go.disabled = true;
      build.entropy = null;
      return;
    }
    const r = Bip39.toEntropy(words);
    if (!r.ok) {
      panel.className = 'panel alert';
      panel.innerHTML = '<p class="body">' + esc(r.error) + '</p>' +
        (r.checksum ? '<p class="help">Checksums catch most single mistakes. Read the phrase back ' +
          'off your paper one word at a time.</p>' : '');
      if (go) go.disabled = true;
      build.entropy = null;
      return;
    }
    build.entropy = r.entropy;
    panel.className = 'panel brass';
    panel.innerHTML = '<p class="body">The checksum holds. Fingerprint <span class="fp">' +
      esc(fpDisplay(Sha256.fingerprint(r.entropy, 4))) + '</span>' +
      (build.practice ? ', from the practice phrase this app just generated' : '') + '.</p>';
    if (go) go.disabled = false;
  }

  function stepShape(body, foot) {
    const b = build;
    const note = Content.shapeNote(b.m, b.n);
    body.innerHTML =
      '<p class="h1">How many cards, and how many to rebuild.</p>' +
      '<p class="lead">Three of five is the shape most people should choose. Two spare cards, and no ' +
      'pair of holders can act without you.</p>' +
      '<div class="mark-wrap">' + KeyMark.svg({ n: b.n, label: b.n + ' shards' }) +
      '<p class="mark-cap">' + esc(Content.word(b.m)) + ' of ' + esc(Content.word(b.n)) +
      ' rebuild it</p></div>' +
      '<p class="label">Cards in total</p>' +
      stepperHtml('n', b.n, 3, 8) +
      '<p class="label">Cards needed to rebuild</p>' +
      stepperHtml('m', b.m, 2, b.n) +
      '<div class="panel brass"><p class="body">' +
      Content.shapeLines(b.m, b.n).map(esc).join('<br>') + '</p></div>' +
      '<div class="panel' + (note.level === 'good' ? '' : note.level === 'risky' ? ' alert' : '') + '">' +
      '<p class="body">' + esc(note.text) + '</p></div>' +
      '<p class="label">Choosing holders</p><ul class="note-list">' +
      Content.GUARDIAN_TIPS.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>';
    wireStepper('n', v => {
      build.n = Math.max(3, Math.min(8, v));
      if (build.m > build.n) build.m = build.n;
      build.people = build.people.slice(0, build.n);
      renderBuild();
    });
    wireStepper('m', v => { build.m = Math.max(2, Math.min(build.n, v)); renderBuild(); });
    footButtons(foot, 'Continue', () => { build.step = 3; renderBuild(); },
      'Back', () => { build.step = 1; renderBuild(); });
  }
  function stepperHtml(id, val, min, max) {
    return '<div class="stepper"><button type="button" id="st-' + id + '-down"' +
      (val <= min ? ' disabled' : '') + ' aria-label="fewer">' + Icons.svg('minus') + '</button>' +
      '<span class="val" id="st-' + id + '-val">' + val + '</span>' +
      '<button type="button" id="st-' + id + '-up"' + (val >= max ? ' disabled' : '') +
      ' aria-label="more">' + Icons.svg('plus') + '</button></div>';
  }
  function wireStepper(id, fn) {
    const cur = () => parseInt($('#st-' + id + '-val').textContent, 10);
    $('#st-' + id + '-down').addEventListener('click', () => { haptic('tap'); fn(cur() - 1); });
    $('#st-' + id + '-up').addEventListener('click', () => { haptic('tap'); fn(cur() + 1); });
  }

  function stepPeople(body, foot) {
    const b = build;
    while (b.people.length < b.n) b.people.push({ name: '', note: '' });
    b.people = b.people.slice(0, b.n);
    const bits = ['<p class="h1">Who holds a card.</p>',
      '<p class="lead">A person, a bank box, a fireproof tin at your sister’s house. Anything ' +
      'that can be found later and is not where you are.</p>'];
    b.people.forEach((p, i) => {
      bits.push('<div class="field"><label for="pn' + i + '">Card ' + (i + 1) + '</label>' +
        '<input type="text" id="pn' + i + '" value="' + esc(p.name) + '" placeholder="Name"></div>' +
        '<div class="field" style="margin-top:-8px"><input type="text" id="pw' + i + '" value="' +
        esc(p.note) + '" placeholder="Where it will live"></div>' +
        '<p class="err" id="pe' + i + '" hidden></p>');
    });
    bits.push('<p class="help">You can rename a holder later. Changing who holds a card means ' +
      'issuing a new set, because Keyfob cannot make a second copy of one card.</p>');
    body.innerHTML = bits.join('');
    b.people.forEach((p, i) => {
      $('#pn' + i).addEventListener('input', e => { p.name = e.target.value; refreshPeople(); });
      $('#pw' + i).addEventListener('input', e => { p.note = e.target.value; });
    });
    footButtons(foot, 'Continue', () => { build.step = 4; renderBuild(); },
      'Back', () => { build.step = 2; renderBuild(); }, true);
    refreshPeople();
  }
  function refreshPeople() {
    const go = $('#fGo');
    if (go) go.disabled = !build.people.every(p => p.name.trim());
    // two cards to one name is legal and almost always a mistake, so it is said
    // next to the field that caused it rather than at the foot of a long form
    const seen = {};
    build.people.forEach((p, i) => {
      const cell = $('#pe' + i);
      if (!cell) return;
      const k = p.name.trim().toLowerCase();
      if (k && seen[k]) {
        cell.innerHTML = Icons.svg('warn') + '<span>Card ' + (seen[k]) + ' is already going to ' +
          esc(p.name.trim()) + '. Your family is told to ring the holders by name, so give each ' +
          'card a name of its own, such as ' + esc(p.name.trim()) + ' at home.</span>';
        cell.hidden = false;
      } else {
        cell.hidden = true;
      }
      if (k && !seen[k]) seen[k] = i + 1;
    });
  }

  function stepCheck(body, foot) {
    const b = build;
    if (!b.quizList) b.quizList = pickTwo().map(shuffled);
    if (!b.quizAns) b.quizAns = [];
    const bits = [];
    bits.push('<p class="h1">Read this back to yourself.</p>');
    bits.push('<div class="panel brass"><p class="body">' +
      Content.shapeLines(b.m, b.n).map(esc).join('<br>') + '</p></div>');
    bits.push('<div class="rows">');
    b.people.forEach((p, i) => bits.push(rowStatic(p.name.trim() || 'Unnamed', 'card ' + (i + 1), p.note)));
    bits.push('</div>');
    bits.push('<p class="label">Two questions</p>');
    bits.push('<p class="body">Not a formality. If either answer surprises you, go back and change ' +
      'the plan rather than the answer.</p>');
    b.quizList.forEach((q, qi) => {
      bits.push('<p class="h3">' + esc(q.q) + '</p>');
      q.a.forEach((opt, ai) => {
        const chosen = b.quizAns[qi];
        let cls = 'opt';
        if (chosen !== undefined) {
          if (opt.ok) cls += ' right';
          else if (chosen === ai) cls += ' wrong';
        }
        const mark = chosen === undefined ? '' : opt.ok ? Icons.svg('tick') : (chosen === ai ? Icons.svg('cross') : '');
        bits.push('<button class="' + cls + '" data-q="' + qi + '" data-a="' + ai + '" type="button"' +
          (chosen !== undefined ? ' disabled' : '') + '>' + mark +
          '<span class="opt-t">' + esc(opt.t) + '</span></button>');
      });
      if (b.quizAns[qi] !== undefined) {
        const wasRight = !!q.a[b.quizAns[qi]].ok;
        bits.push('<div class="panel' + (wasRight ? ' brass' : ' alert') + '"><div class="panel-h">' +
          Icons.svg(wasRight ? 'check2' : 'warn') + '<p class="body" style="margin:0">' +
          (wasRight ? '' : '<strong>Not quite.</strong> ') + esc(q.why) + '</p></div>' +
          (wasRight ? '' : '<button class="btn ghost small" data-retry="' + qi +
            '" type="button" style="margin-top:10px">Answer it again</button>') + '</div>');
      }
    });
    body.innerHTML = bits.join('');
    $$('#buildBody .opt').forEach(btn => btn.addEventListener('click', () => {
      const qi = parseInt(btn.dataset.q, 10), ai = parseInt(btn.dataset.a, 10);
      if (build.quizAns[qi] !== undefined) return;
      build.quizAns[qi] = ai;
      haptic(build.quizList[qi].a[ai].ok ? 'good' : 'bad');
      renderBuild();
    }));
    $$('#buildBody [data-retry]').forEach(btn => btn.addEventListener('click', () => {
      const qi = parseInt(btn.dataset.retry, 10);
      build.quizList[qi] = shuffled(build.quizList[qi]);
      delete build.quizAns[qi];
      renderBuild();
    }));
    const passed = b.quizList.every((q, i) => b.quizAns[i] !== undefined && q.a[b.quizAns[i]].ok);
    footButtons(foot, 'Issue the cards', issueCards, 'Back', () => { build.step = 3; renderBuild(); }, !passed);
  }

  /* ---------------- issuing ---------------- */

  let issued = null;   // { cards: [{ g, words }], idx }

  function issueCards() {
    const b = build;
    // the second half of a double tap arrives after the ceremony has already ended
    if (!b || issued) return;
    const ent = b.entropy;
    if (!ent) { toast('The phrase is not complete'); return; }
    const shares = Shamir.split(ent, b.m, b.n);
    const now = Date.now();
    const old = Store.plan();
    const fp = Sha256.fingerprint(ent, 4);
    // A practice plan stays a practice plan when it is rotated: the warning it carries
    // is the only thing standing between a rehearsal and somebody's savings.
    const practice = !!b.practice || !!(old && old.practice && old.fp === fp);
    const plan = {
      created: (old && old.created) || now,
      rotated: now,
      m: b.m, n: b.n,
      wordCount: b.wordCount,
      elen: ent.length,
      cardWords: Shamir.wordCount(ent.length),
      fp: fp,
      practice: practice,
      guardians: shares.map((s, i) => ({
        id: 'g' + now.toString(36) + i,
        name: b.people[i].name.trim(),
        note: b.people[i].note.trim(),
        cardNo: s.x,
        cardId: Shamir.cardId(s, b.m, b.n),
        held: false,
        health: 'unsure',
        confirmedAt: 0
      }))
    };
    Store.savePlan(plan);
    issued = {
      idx: 0,
      cards: shares.map((s, i) => ({ g: plan.guardians[i], words: Shamir.toCard(s, b.m, b.n) }))
    };
    build = null;
    haptic('seal');
    renderCards();
    show('cards');
  }

  function renderCards() {
    const p = Store.plan();
    const c = issued.cards[issued.idx];
    $('#cardsTitle').textContent = 'Card ' + c.g.cardNo + ' of ' + p.n;
    $('#cardsSub').textContent = 'For ' + c.g.name;
    const conceal = Store.settings().conceal && !issued.revealed;
    const bits = [];

    if (issued.idx === 0) {
      bits.push(panel('alert', 'warn', 'These cards exist on this screen and nowhere else',
        'Keyfob did not save them and cannot make them again. Write each one out before you move on.'));
    }

    bits.push('<div class="mark-wrap">' +
      KeyMark.svg({ n: p.n, numbers: true, sheen: false,
        states: p.guardians.map(x => x.id === c.g.id ? 'ok' : 'faint'),
        label: 'shard ' + c.g.cardNo + ' of ' + p.n }) +
      '<p class="mark-cap">Shard ' + c.g.cardNo + ' of ' + p.n + '</p></div>');
    bits.push('<div class="card-sheet">');
    bits.push('<div class="card-head">' +
      '<div class="card-head-mid"><p class="card-name">' + esc(c.g.name) + '</p></div>' +
      '<span class="card-no">' + esc(c.g.cardId) + '</span></div>');
    bits.push('<p class="card-meta">Card ' + c.g.cardNo + ' of ' + p.n + '. Any ' + p.m +
      ' cards rebuild the phrase. This one alone rebuilds nothing.</p>');
    if (conceal) {
      bits.push('<div class="card-hidden">' + Icons.svg('lock') +
        '<p>' + p.cardWords + ' words, covered until you ask.</p>' +
        '<button class="btn" id="cardReveal" type="button">Show the words</button></div>');
    } else {
      bits.push('<div class="card-words">' + c.words.map((w, i) =>
        '<b><i>' + (i + 1) + '</i><span>' + esc(w) + '</span></b>').join('') + '</div>');
    }
    bits.push('<p class="card-meta" style="margin:0">' + esc(Content.CARD_NOTE) + '</p>');
    bits.push('</div>');

    bits.push('<div class="btnrow stack">' +
      '<button class="btn ' + (c.g.held ? '' : 'ghost') + '" id="cardHeld" type="button">' +
      (c.g.held ? 'Marked as handed over' : 'Mark as handed over') + '</button>' +
      '<button class="btn ghost" id="cardSave" type="button">Save this card as a text file</button></div>');
    bits.push('<p class="help">A saved card is a file on your phone, which is a worse hiding place ' +
      'than a drawer. Use it to print, then delete it.</p>');

    bits.push('<p class="label">The rest of the set</p><div class="rows stagger">');
    issued.cards.forEach((cc, i) => bits.push(rowStatic(
      'Card ' + cc.g.cardNo + '. ' + cc.g.name,
      i === issued.idx ? 'on screen' : (cc.g.held ? 'handed over' : 'waiting'), '')));
    bits.push('</div>');

    $('#cardsBody').innerHTML = bits.join('');
    if (conceal) $('#cardReveal').addEventListener('click', () => { issued.revealed = true; renderCards(); });
    $('#cardHeld').addEventListener('click', () => {
      Store.setGuardian(c.g.id, { held: !c.g.held, health: !c.g.held ? 'ok' : 'unsure',
        confirmedAt: !c.g.held ? Date.now() : 0 });
      haptic('tap'); renderCards();
    });
    $('#cardSave').addEventListener('click', () => {
      saveText('keyfob-card-' + c.g.cardNo + '-' + c.g.cardId + '.txt', cardText(c));
    });

    const last = issued.idx === issued.cards.length - 1;
    $('#cardsFoot').innerHTML =
      (issued.idx > 0 ? '<button class="btn ghost" id="cardPrev" type="button">Back</button>' : '') +
      '<button class="btn" id="cardNext" type="button">' +
      (last ? 'Finish and clear the cards' : 'Next card') + '</button>';
    if (issued.idx > 0) $('#cardPrev').addEventListener('click', () => {
      issued.idx--; issued.revealed = false; renderCards(); $('#cardsBody').scrollTop = 0;
    });
    $('#cardNext').addEventListener('click', () => {
      if (!last) { issued.idx++; issued.revealed = false; renderCards(); $('#cardsBody').scrollTop = 0; return; }
      finishCards();
    });
  }

  function cardText(c) {
    const p = Store.plan();
    return [
      'KEYFOB GUARDIAN CARD',
      'Card ' + c.g.cardNo + ' of ' + p.n + '. Label ' + c.g.cardId + '.',
      'Held by ' + c.g.name + '.',
      '',
      c.words.map((w, i) => String(i + 1).padStart(2, ' ') + '  ' + w).join('\n'),
      '',
      'Any ' + p.m + ' cards of this set rebuild a recovery phrase. This card alone rebuilds nothing,',
      'and cannot be used to guess at the rest. Keep it somewhere it will survive ten years.',
      'Do not photograph it. Do not put it in a message. Do not keep it beside another card.',
      '',
      'To use it: install Keyfob from Google Play, open Vault, choose Rebuild the phrase, and enter',
      'this card alongside ' + (p.m - 1) + ' more from the same set.'
    ].join('\n');
  }

  function finishCards() {
    confirmSheet('Clear the cards',
      'The words leave this phone now. Everything you have not written down or handed over is gone, ' +
      'and Keyfob cannot make these cards again. That is the whole point, and it is worth reading twice.',
      'They are all written down', () => {
        closeSheet();
        issued = null;
        haptic('seal');
        toast('Cards cleared. The plan is live.');
        go('circle');
      });
  }

  /* ---------------- gathering cards ---------------- */

  let gather = null;
  /* gather = { mode, need, entries:[{cardId,name,share}], grid, started, tick, result } */

  function startGather(mode) {
    const p = Store.plan();
    gather = { mode: mode, need: p.m, entries: [], grid: null, started: Date.now(), result: null };
    renderGather();
    show('gather');
    gather.tick = setInterval(paintGatherTime, 1000);
  }
  function stopGather() {
    if (gather && gather.tick) clearInterval(gather.tick);
    gather = null;
  }
  function clearGatherTick() { if (gather && gather.tick) { clearInterval(gather.tick); gather.tick = 0; } }
  function paintGatherTime() {
    if (!gather || gather.result) return;
    const s = Math.round((Date.now() - gather.started) / 1000);
    $('#gatherSub').textContent = gather.entries.length + ' of ' + gather.need + ' cards · ' + fmtSecs(s);
  }

  function renderGather() {
    const p = Store.plan();
    const g = gather;
    $('#gatherTitle').textContent = g.mode === 'rebuild' ? 'Rebuild the phrase' :
      g.mode === 'drill-heirs' ? 'Inheritance drill' : 'Recovery drill';
    paintGatherTime();

    if (g.result) { renderGatherResult(); return; }

    const bits = [];
    if (g.mode === 'drill-heirs') {
      bits.push('<div class="panel"><p class="body">You are standing in for the people who will do ' +
        'this without you. Work only from the estate document. If you catch yourself helping from ' +
        'memory, that is the finding.</p></div>');
    } else if (g.mode === 'rebuild') {
      bits.push('<div class="panel alert"><p class="body">The finished phrase will appear on this ' +
        'screen. Close it as soon as you have what you need.</p></div>');
    } else {
      bits.push('<div class="panel"><p class="body">Collect the cards the way you would on the real ' +
        'day: ring the people holding them. The phrase is never shown in a drill, only checked.</p></div>');
    }

    const held = {};
    g.entries.forEach(e => { held[e.cardNo] = 1; });
    bits.push('<div class="mark-wrap">' +
      KeyMark.svg({ n: p.n, numbers: true,
        states: p.guardians.map(x => held[x.cardNo] ? 'ok' : 'faint'),
        label: g.entries.length + ' of ' + g.need + ' shards in hand' }) +
      '<p class="mark-cap">' + g.entries.length + ' of ' + g.need + ' in hand</p></div>');
    bits.push('<p class="h1">' + (g.entries.length >= g.need
      ? 'Enough cards. Rebuild it.'
      : cap(Content.word(g.need - g.entries.length)) +
        (g.need - g.entries.length === 1 ? ' more card.' : ' more cards.')) + '</p>');

    if (g.entries.length) {
      bits.push('<div class="rows stagger">');
      g.entries.forEach((e, i) => bits.push(
        '<div class="row"><span class="dot ok">' + esc(String(e.cardNo)) + '</span>' +
        '<div class="row-mid"><p class="row-k">' + esc(e.name) + '</p>' +
        '<p class="row-v">card ' + esc(e.cardId) + ', read correctly</p></div>' +
        '<button class="btn ghost small" data-drop="' + i + '" type="button">Remove</button></div>'));
      bits.push('</div>');
    }

    if (g.entries.length < g.need) {
      bits.push('<p class="label">Type a card</p>');
      bits.push('<div id="gGridHost"></div>');
      bits.push('<div class="panel" id="gState"><p class="body">' + p.cardWords +
        ' words, in the order they are written on the card.</p></div>');
      bits.push('<div class="btnrow"><button class="btn" id="gAdd" type="button" disabled>Add this card</button>' +
        '<button class="btn ghost" id="gClear" type="button">Clear</button></div>');
    }

    $('#gatherBody').innerHTML = bits.join('');
    $$('#gatherBody [data-drop]').forEach(b => b.addEventListener('click', () => {
      gather.entries.splice(parseInt(b.dataset.drop, 10), 1);
      renderGather();
    }));

    if (g.entries.length < g.need) {
      g.grid = WordGrid.create($('#gGridHost'), { count: p.cardWords, onChange: checkCard });
      $('#gAdd').addEventListener('click', addCard);
      $('#gClear').addEventListener('click', () => g.grid.clear());
      checkCard(g.grid.words());
    }

    $('#gatherFoot').hidden = false;
    $('#gatherFoot').innerHTML = '<button class="btn" id="gGo" type="button"' +
      (g.entries.length >= g.need ? '' : ' disabled') + '>' +
      (g.mode === 'rebuild' ? 'Rebuild the phrase' : 'Rebuild and check') + '</button>';
    $('#gGo').addEventListener('click', doRebuild);
  }

  function checkCard(words) {
    const panel = $('#gState'), add = $('#gAdd');
    if (!panel || !add) return;
    const filled = words.filter(Boolean).length;
    if (filled < words.length) {
      panel.className = 'panel';
      panel.innerHTML = '<p class="body">' + Content.word(words.length - filled) +
        (words.length - filled === 1 ? ' word' : ' words') + ' still to go.</p>';
      add.disabled = true;
      return;
    }
    const r = Shamir.fromCard(words);
    if (!r.ok) {
      panel.className = 'panel alert';
      panel.innerHTML = '<p class="body">' + esc(r.error) + '</p>';
      add.disabled = true;
      return;
    }
    const known = Store.cardById(r.id);
    if (gather.entries.some(e => e.cardNo === r.share.x)) {
      panel.className = 'panel alert';
      panel.innerHTML = '<p class="body">That is card ' + r.share.x + ' again. You need cards with ' +
        'different numbers on them.</p>';
      add.disabled = true;
      return;
    }
    panel.className = 'panel brass';
    panel.innerHTML = '<p class="body">Card ' + r.share.x + ' of ' + r.n + ', label ' + esc(r.id) +
      (known ? ', held by ' + esc(known.name) : ', which is not from the set on this phone') +
      '. Threshold ' + r.m + '.</p>';
    add.disabled = false;
  }

  function addCard() {
    if (!gather || !gather.grid || gather.result) return;
    const words = gather.grid.words();
    const r = Shamir.fromCard(words);
    if (!r.ok) return;
    // a second tap must never put the same point in twice: combine would refuse it
    if (gather.entries.some(e => e.cardNo === r.share.x)) return;
    if (gather.entries.length >= gather.need) return;
    const known = Store.cardById(r.id);
    gather.entries.push({ cardId: r.id, cardNo: r.share.x, share: r.share, m: r.m,
                          name: known ? known.name : 'Card ' + r.share.x });
    haptic('tap');
    renderGather();
    paintGatherTime();
  }

  function doRebuild() {
    const p = Store.plan();
    const g = gather;
    if (!g || g.result || g.entries.length < g.need) return;
    const seconds = (Date.now() - g.started) / 1000;
    let entropy = null, err = null;
    try { entropy = Shamir.combine(g.entries.map(e => e.share)); }
    catch (e) { err = e.message; }
    const fpOk = entropy && Sha256.fingerprint(entropy, 4) === p.fp;
    g.result = { ok: !!fpOk, err: err, seconds: seconds,
                 phrase: fpOk ? Bip39.toPhrase(entropy) : null,
                 entropy: fpOk ? entropy : null };
    clearGatherTick();
    if (g.mode !== 'rebuild') {
      Store.addDrill({ kind: g.mode === 'drill-heirs' ? 'heirs' : 'self',
                       gathered: g.entries.length, seconds: seconds, passed: !!fpOk });
    }
    haptic(fpOk ? 'seal' : 'bad');
    renderGather();
  }

  function renderGatherResult() {
    const p = Store.plan();
    const g = gather, r = g.result;
    $('#gatherSub').textContent = r.ok ? 'Rebuilt in ' + fmtSecs(r.seconds) : 'Did not rebuild';
    const bits = [];

    if (r.ok) {
      bits.push('<div class="mark-wrap">' +
        KeyMark.svg({ intact: true, label: 'the key, whole again' }) +
        '<p class="mark-cap">Whole again, for a moment</p></div>');
    }

    if (!r.ok) {
      bits.push('<div class="panel alert"><div class="panel-h">' + Icons.svg('warn') +
        '<p class="h3">That did not rebuild your phrase.</p></div>' +
        '<p class="body">' + esc(r.err ||
          'The cards decoded cleanly and produced a phrase, but not the one this plan was built ' +
          'around. That means at least one card belongs to a different set, most likely an older ' +
          'one that a rotation retired.') + '</p></div>');
      bits.push('<div class="mark-wrap">' +
        KeyMark.svg({ n: p.n, numbers: true, sheen: false,
          states: p.guardians.map(x => g.entries.some(e => e.cardNo === x.cardNo) ? 'lost' : 'faint'),
          label: 'the cards brought did not fit together' }) +
        '<p class="mark-cap">These did not fit together</p></div>');
      bits.push('<p class="body">Nothing is broken yet. Check the label printed on each card against ' +
        'the circle, and try again with cards from the current set.</p>');
      bits.push('<div class="rows">');
      g.entries.forEach(e => bits.push(rowStatic('Card ' + e.cardNo, e.cardId,
        Store.cardById(e.cardId) ? 'in the current set' : 'not in the current set')));
      bits.push('</div>');
    } else if (g.mode === 'rebuild') {
      bits.push('<div class="panel brass"><div class="panel-h">' + Icons.svg('check2') +
        '<p class="h3">Your phrase, rebuilt on this phone.</p></div>' +
        '<p class="body">It was not sent anywhere and it is not being saved. Leaving this screen ' +
        'drops it, and so does putting the app in the background.</p></div>');
      bits.push('<div class="card-sheet">' + (r.covered
        ? '<div class="card-hidden">' + Icons.svg('lock') +
          '<p>Covered while the app was in the background.</p>' +
          '<button class="btn" id="rShow" type="button">Show the phrase again</button></div>'
        : '<div class="card-words">' + r.phrase.map((w, i) =>
            '<b><i>' + (i + 1) + '</i><span>' + esc(w) + '</span></b>').join('') + '</div>') +
        '<p class="card-meta" style="margin:0">Fingerprint <span class="fp">' +
        esc(fpDisplay(p.fp)) + '</span>, which matches the plan.</p></div>');
      bits.push('<div class="btnrow stack">' +
        '<button class="btn ghost" id="rRotate" type="button">Issue a new set from this phrase</button>' +
        '<button class="btn" id="rDone" type="button">Done, clear the screen</button></div>');
    } else {
      const fast = r.seconds < 300;
      bits.push('<div class="panel brass"><div class="panel-h">' + Icons.svg('check2') +
        '<p class="h3">The plan works.</p></div>' +
        '<p class="body">' + cap(Content.word(g.entries.length)) + ' cards rebuilt a phrase whose ' +
        'fingerprint matches this plan exactly. The phrase itself was never shown and is already ' +
        'gone.</p></div>');
      bits.push('<div class="rows">');
      bits.push(rowStatic('Time taken', fmtSecs(r.seconds), ''));
      bits.push(rowStatic('Cards gathered', Content.word(g.entries.length) + ' of ' + Content.word(p.n), ''));
      bits.push(rowStatic('Kind', g.mode === 'drill-heirs' ? 'Inheritance' : 'Recovery', ''));
      bits.push('</div>');
      bits.push('<p class="body" style="margin-top:18px">' + (fast
        ? 'Quick, because you had the cards to hand. The honest version of this drill involves ' +
          'actually phoning the people who hold them, and it takes days.'
        : 'That is a realistic number. Write it down somewhere you will see it next year, and notice ' +
          'if it gets worse.') + '</p>');
      bits.push('<button class="btn wide" id="rDone" type="button">Done</button>');
    }

    $('#gatherBody').innerHTML = bits.join('');
    $('#gatherFoot').innerHTML = '';
    $('#gatherFoot').hidden = true;
    const show2 = $('#rShow');
    if (show2) show2.addEventListener('click', () => { g.result.covered = false; renderGatherResult(); });
    const done = $('#rDone');
    if (done) done.addEventListener('click', () => {
      const mode = g.mode;
      stopGather();
      if (mode === 'rebuild') { renderVault(); show('vault'); }
      else go('drill');
    });
    const rot = $('#rRotate');
    if (rot) rot.addEventListener('click', () => {
      const ent = g.result.entropy;
      stopGather();
      startBuild('rotate', ent);
    });
  }

  /* ---------------- back ---------------- */

  function back() {
    if (!$('#sheet').hidden) { closeSheet(); return true; }
    if (view === 'onboard') return true;
    if (view === 'build') {
      if (build && build.step > 0) { build.step--; renderBuild(); return true; }
      confirmSheet('Leave the ceremony',
        'Nothing has been issued yet, and nothing you typed is kept.',
        'Leave', () => { closeSheet(); build = null; go('plan'); });
      return true;
    }
    if (view === 'cards') { finishCards(); return true; }
    if (view === 'gather') {
      if (gather && gather.result) { const m = gather.mode; stopGather(); if (m === 'rebuild') { renderVault(); show('vault'); } else go('drill'); return true; }
      confirmSheet('Leave the drill', 'Nothing is recorded and the cards you typed are dropped.',
        'Leave', () => { closeSheet(); const m = gather.mode; stopGather(); if (m === 'rebuild') { renderVault(); show('vault'); } else go('drill'); });
      return true;
    }
    if (view === 'guardian') { go('circle'); return true; }
    if (view === 'letter') { go(tab === 'circle' ? 'circle' : 'vault'); return true; }
    if (view === 'quiz') { quiz = null; go('vault'); return true; }
    if (view === 'threat') { go(tab); return true; }
    if (view !== 'plan') { go('plan'); return true; }
    return false;
  }

  /* Nothing secret may sit on screen behind the app switcher, and nothing may keep
     ticking while the app is not in front of anyone. */
  function onPause() {
    // a word grid is either a recovery phrase or a guardian card, and either one is
    // worth more than the picture the app switcher is about to take of it
    document.body.classList.add('is-covered');
    if (view === 'cards' && issued) { issued.revealed = false; renderCards(); }
    if (gather) {
      if (gather.tick) { clearInterval(gather.tick); gather.tick = 0; }
      if (gather.result && gather.result.phrase && !gather.result.covered) {
        gather.result.covered = true;
        if (view === 'gather') renderGatherResult();
      }
    }
  }
  function onResume() {
    document.body.classList.remove('is-covered');
    if (view === 'cards' && issued) renderCards();
    if (view === 'plan') renderPlan();
    // the clock reads from the moment the drill started, so it never lost the time
    if (view === 'gather' && gather && !gather.result && !gather.tick) {
      gather.tick = setInterval(paintGatherTime, 1000);
      paintGatherTime();
    }
  }

  /* ---------------- init ---------------- */

  function init() {
    $$('.tab').forEach(b => {
      b.innerHTML = Icons.svg(b.dataset.view) + '<span>' + esc(b.textContent.trim()) + '</span>';
      b.addEventListener('click', () => { haptic('tap'); go(b.dataset.view); });
    });
    // the bar buttons, and the invisible twin that keeps the title centred
    $$('.bar .icon').forEach(b => {
      b.innerHTML = Icons.svg('back') + '<span>' + esc(b.textContent.trim()) + '</span>';
    });
    $('#obNext').addEventListener('click', obNext);
    $('#sheetGo').addEventListener('click', () => { const f = sheetGo; if (f) f(); });
    $('#sheetNo').addEventListener('click', closeSheet);
    $('#sheet').addEventListener('click', e => { if (e.target === $('#sheet')) closeSheet(); });
    $('#buildBack').addEventListener('click', back);
    $('#cardsBack').addEventListener('click', back);
    $('#gatherBack').addEventListener('click', back);
    $('#gdnBack').addEventListener('click', back);
    $('#letterBack').addEventListener('click', back);
    $('#quizBack').addEventListener('click', back);
    $('#threatBack').addEventListener('click', back);

    if (!Store.onboarded()) { onboard(); show('onboard'); }
    else go('plan');
  }

  document.addEventListener('DOMContentLoaded', init);

  return { go: go, back: back, onPause: onPause, onResume: onResume,
           toast: toast, startBuild: startBuild, startGather: startGather,
           startQuiz: startQuiz, renderThreat: renderThreat, renderLetter: renderLetter,
           show: show, openGuardian: openGuardian };
})();

window.App = App;
