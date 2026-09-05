/* Keyfob. Everything the app remembers, in one localStorage record on this device.

   Read the DEFAULTS below and you have read the entire data model. Note what is
   not in it: no recovery phrase, no share, no card. Those exist only in memory,
   only while the screen showing them is open. */
const Store = (function () {
  'use strict';
  const KEY = 'keyfob.v1';

  const DEFAULTS = {
    v: 1,
    onboarded: false,
    plan: null,          // see newPlan()
    owner: '',           // your name, for the estate document
    heirs: [],           // { id, name, relation }
    letter: '',
    letterAt: 0,
    drills: [],          // { at, kind, gathered, seconds, passed }
    quiz: { passed: false, at: 0 },
    settings: { haptics: true, conceal: true }
  };

  /* plan = {
       created, rotated,        epoch ms
       m, n,                    threshold and card count
       wordCount,               12 / 15 / 18 / 21 / 24
       elen,                    secret length in bytes
       cardWords,               words on each card
       fp,                      4 byte fingerprint of the phrase, hex
       practice,                true if built from a phrase Keyfob generated
       guardians: [ { id, name, note, cardNo, cardId, held, health } ]
     }
     health is 'ok', 'unsure' or 'lost'; held is true once you mark a card handed over. */

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const d = JSON.parse(raw);
      return {
        v: 1,
        onboarded: !!d.onboarded,
        plan: d.plan || null,
        owner: typeof d.owner === 'string' ? d.owner : '',
        heirs: Array.isArray(d.heirs) ? d.heirs : [],
        letter: typeof d.letter === 'string' ? d.letter : '',
        letterAt: d.letterAt || 0,
        drills: Array.isArray(d.drills) ? d.drills : [],
        quiz: Object.assign({ passed: false, at: 0 }, d.quiz || {}),
        settings: Object.assign({}, DEFAULTS.settings, d.settings || {})
      };
    } catch (e) { return clone(DEFAULTS); }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  /* ---------- dates ---------- */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
  const DAY = 86400000;
  function longDate(ts) {
    if (!ts) return 'never';
    const d = new Date(ts);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function shortDate(ts) {
    if (!ts) return 'never';
    const d = new Date(ts);
    return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
  }
  /** "4 months ago", "yesterday", "today". */
  function ago(ts) {
    if (!ts) return 'never';
    const days = Math.floor((Date.now() - ts) / DAY);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 31) return days + ' days ago';
    const months = Math.round(days / 30.4);
    if (months < 24) return months + (months === 1 ? ' month ago' : ' months ago');
    return Math.round(days / 365) + ' years ago';
  }
  /** Months until a yearly obligation, negative when overdue. */
  const monthsLeft = ts => 12 - Math.floor((Date.now() - (ts || 0)) / DAY / 30.4);

  /* ---------- the plan ---------- */
  const plan = () => db.plan;
  const hasPlan = () => !!db.plan;

  function savePlan(p) { db.plan = p; if (!db.onboarded) db.onboarded = true; save(); }

  function guardian(id) {
    const p = db.plan;
    if (!p) return null;
    for (const g of p.guardians) if (g.id === id) return g;
    return null;
  }
  function setGuardian(id, patch) {
    const g = guardian(id);
    if (g) { Object.assign(g, patch); save(); }
    return g;
  }
  function cardById(cardId) {
    const p = db.plan;
    if (!p) return null;
    for (const g of p.guardians) if (g.cardId === cardId) return g;
    return null;
  }

  /** How the plan is doing, as facts rather than a score. */
  function health() {
    const p = db.plan;
    if (!p) return null;
    let ok = 0, unsure = 0, lost = 0, undelivered = 0;
    for (const g of p.guardians) {
      if (!g.held) undelivered++;
      if (g.health === 'lost') lost++;
      else if (g.health === 'unsure') unsure++;
      else ok++;
    }
    const reachable = p.n - lost;
    return {
      ok: ok, unsure: unsure, lost: lost, undelivered: undelivered,
      reachable: reachable,
      spare: reachable - p.m,
      broken: reachable < p.m,
      rotationMonths: monthsLeft(p.rotated),
      drillMonths: monthsLeft(lastDrill() ? lastDrill().at : 0),
      everDrilled: !!lastDrill()
    };
  }

  /* ---------- heirs, letter, drills, quiz ---------- */
  function owner(v) { if (v !== undefined) { db.owner = String(v); save(); } return db.owner; }

  const heirs = () => db.heirs;
  function addHeir(name, relation) {
    db.heirs.push({ id: 'h' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
                    name: name, relation: relation || '' });
    save();
  }
  function removeHeir(id) { db.heirs = db.heirs.filter(h => h.id !== id); save(); }

  function letter(text) {
    if (text !== undefined) { db.letter = text; db.letterAt = Date.now(); save(); }
    return db.letter;
  }
  const letterAt = () => db.letterAt;

  function addDrill(d) {
    db.drills.unshift(Object.assign({ at: Date.now() }, d));
    db.drills = db.drills.slice(0, 40);
    save();
  }
  const drills = () => db.drills;
  function lastDrill() {
    for (const d of db.drills) if (d.passed) return d;
    return null;
  }

  function quiz(passed) {
    if (passed !== undefined) { db.quiz = { passed: !!passed, at: Date.now() }; save(); }
    return db.quiz;
  }

  function settings(patch) { if (patch) { Object.assign(db.settings, patch); save(); } return db.settings; }
  function onboarded(v) { if (v !== undefined) { db.onboarded = !!v; save(); } return db.onboarded; }

  /* ---------- export and erase ---------- */
  /** The whole record, which by construction contains no phrase and no card. */
  function exportJson() {
    return JSON.stringify({ app: 'keyfob', format: 1, exported: new Date().toISOString(), data: db }, null, 2);
  }
  function erase() { db = clone(DEFAULTS); try { localStorage.removeItem(KEY); } catch (e) {} }

  return { longDate: longDate, shortDate: shortDate, ago: ago, monthsLeft: monthsLeft,
           plan: plan, hasPlan: hasPlan, savePlan: savePlan, guardian: guardian,
           setGuardian: setGuardian, cardById: cardById, health: health,
           owner: owner, heirs: heirs, addHeir: addHeir, removeHeir: removeHeir,
           letter: letter, letterAt: letterAt,
           addDrill: addDrill, drills: drills, lastDrill: lastDrill,
           quiz: quiz, settings: settings, onboarded: onboarded,
           exportJson: exportJson, erase: erase };
})();
