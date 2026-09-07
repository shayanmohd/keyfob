/* Keyfob. Every word the app says that is longer than a button label.

   Kept in one file on purpose: the writing is the security control. A plan you
   cannot explain to your sister is a plan that fails on the day she needs it. */
const Content = (function () {
  'use strict';

  const INTRO = [
    { mark: 'whole',
      line: 'Your recovery phrase has one copy, and it is on paper.',
      sub: 'One fire, one flood, one house move, one careless afternoon, and it is gone. ' +
           'Most people who lose crypto lose it exactly this way, and they lose it quietly, ' +
           'years before they find out.' },
    { mark: 'split',
      line: 'Keyfob cuts it into pieces that mean nothing alone.',
      sub: 'Five cards, any three of which rebuild the phrase. Two of them together are ' +
           'worthless. Not hard to crack: worthless. That is arithmetic, not a promise.' },
    { mark: 'held',
      line: 'Then you hand them to people, and rehearse.',
      sub: 'Your brother, a safe deposit box, a friend in another city. Once a year you run ' +
           'a drill and find out whether the plan still works while it still does not matter.' }
  ];

  /* ---------- the shape of the plan ---------- */

  /** Plain sentences describing what an m of n split actually means. */
  function shapeLines(m, n) {
    const out = [];
    out.push('Any ' + word(m) + ' of your ' + word(n) + ' cards rebuild your phrase.');
    if (m > 2) out.push('Any ' + word(m - 1) + ' of them together rebuild nothing at all.');
    else out.push('A single card on its own rebuilds nothing at all.');
    if (n - m === 0) out.push('Lose one card and the phrase can never be rebuilt.');
    else out.push('You can lose ' + word(n - m) + (n - m === 1 ? ' card' : ' cards') +
                  ' and still rebuild. One loss beyond that ends it.');
    return out;
  }

  /** An honest opinion about a chosen shape. Level is 'good', 'thin' or 'risky'. */
  function shapeNote(m, n) {
    if (n - m === 0) {
      return { level: 'risky', text: 'Every card is load bearing. Lose one and your phrase is ' +
        'unrecoverable through Keyfob. Add a card so the plan can survive one loss.' };
    }
    if (m === 2 && n >= 4) {
      return { level: 'thin', text: 'Two cards is a low bar. Any two of the ' + word(n) +
        ' people you choose could rebuild your phrase between them, without you.' };
    }
    if (n - m === 1 && n >= 5) {
      return { level: 'thin', text: 'One spare card across ' + word(n) +
        ' holders is tight over ten years. People move, phones die, boxes get cleared out.' };
    }
    if (m >= 3 && n - m >= 2) {
      return { level: 'good', text: 'A sturdy shape. Two cards can go missing without ' +
        'costing you the phrase, and no pair of holders can act behind your back.' };
    }
    return { level: 'good', text: 'A workable shape. Keep at least one card somewhere ' +
      'that is not a person, such as a bank box.' };
  }

  const WORDS_N = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  function word(n) { return WORDS_N[n] || String(n); }

  /* ---------- guardian guidance ---------- */

  const GUARDIAN_TIPS = [
    'Choose people who do not all live in the same house, the same city, or the same weather.',
    'Choose at least one person your family would still call after a divorce or a falling out.',
    'A bank deposit box or a fireproof box at a second address counts as a holder. Give it a name.',
    'Avoid a set where the threshold could gather over one dinner without you.'
  ];

  const CARD_NOTE =
    'Write these words down by hand, in order, and keep the paper somewhere it will survive ' +
    'ten years. Do not photograph them. Do not email them. This card is useless on its own, ' +
    'and dangerous in a pile with the others.';

  /* ---------- the comprehension check ---------- */

  const QUIZ = [
    {
      q: 'Your phone falls in a river. What has happened to your recovery phrase?',
      a: [
        { t: 'Nothing. Keyfob never held it, and your cards still work.', ok: true },
        { t: 'It is gone, unless Keyfob has a backup of it.' },
        { t: 'Keyfob restores it when you sign in on a new phone.' }
      ],
      why: 'Keyfob never stores your phrase. It keeps a four byte fingerprint, which is enough ' +
           'to recognise the phrase and useless for rebuilding it. Your plan lives on the cards, ' +
           'in other people’s hands, not in this app.'
    },
    {
      q: 'Someone steals one guardian card from a drawer. In a three of five plan, what can they do with it?',
      a: [
        { t: 'Nothing without two more cards.', ok: true },
        { t: 'Rebuild about a third of the phrase.' },
        { t: 'Guess the rest, given enough computing power.' },
        { t: 'Nothing, but only until computers get faster.' }
      ],
      why: 'Below the threshold there is no partial answer and nothing to grind at. Every ' +
           'possible phrase stays exactly as likely as it was before the card was stolen. ' +
           'That property does not weaken with time or hardware.'
    },
    {
      q: 'A guardian loses their card. Can Keyfob print them a new one?',
      a: [
        { t: 'No. You issue a fresh set to everyone and the old cards stop working.', ok: true },
        { t: 'Yes, from the fingerprint it stored.' },
        { t: 'Yes, if the other guardians approve it.' }
      ],
      why: 'To make one matching card, Keyfob would have to remember your phrase and the ' +
           'random numbers it used. It keeps neither. Replacing a card is a rotation: gather ' +
           'the threshold or re-enter your phrase, issue a new set, retire the old one.'
    },
    {
      q: 'Three of your five guardians are your three brothers, and all three live in your parents’ house. Why is that weaker than it looks?',
      a: [
        { t: 'One house fire, or one family argument, reaches the threshold in one place.', ok: true },
        { t: 'Relatives are not allowed to be guardians.' },
        { t: 'Cards held by family members expire sooner.' }
      ],
      why: 'The threshold is only as strong as the hardest set of cards to gather. Spread the ' +
           'cards across places that do not burn down together and people who do not decide together.'
    },
    {
      q: 'What is safe to keep in the same envelope as your will?',
      a: [
        { t: 'The estate document, which names who holds which card and holds no card words.', ok: true },
        { t: 'One guardian card, as a head start for your family.' },
        { t: 'Your recovery phrase, sealed.' }
      ],
      why: 'The estate document is written so that reading it gives an attacker nothing and ' +
           'gives your family everything they need: who to call, in what order, and what to do ' +
           'when the cards are in front of them.'
    }
  ];

  /* ---------- the threat model ---------- */

  const THREAT = [
    { h: 'What Keyfob is for',
      p: ['You already hold a recovery phrase. Keyfob turns that single piece of paper into a ' +
          'set of cards, spread across people and places, so that losing any one of them is a ' +
          'shrug rather than a catastrophe. It also writes down the plan, so somebody other than ' +
          'you can carry it out.',
          'It is not a wallet. It never sees an address, a balance or a transaction, and it ' +
          'cannot move anything. It cannot even reach the network to try.'] },

    { h: 'What it defends against',
      list: [
        ['Losing the paper.', 'Any single card can be lost, burned or thrown out with the ' +
          'recycling without costing you anything, so long as the threshold still stands.'],
        ['One place going wrong.', 'A fire at your house, a flood in the basement, a landlord ' +
          'clearing a flat. Cards in different places do not fail at the same time.'],
        ['One person going wrong.', 'A guardian who is careless, dishonest, or simply not ' +
          'speaking to you any more holds something that is worthless on its own.'],
        ['A curious guardian.', 'Below the threshold a card is not a head start. It is nothing. ' +
          'There is no partial phrase to work from and no brute force worth running.'],
        ['Dying without a plan.', 'The estate document names the holders, the threshold and the ' +
          'steps, in language your family can follow on the worst week of their lives.'],
        ['Forgetting how it works.', 'The drill makes you prove the plan still works, once a ' +
          'year, while it does not yet matter.']
      ] },

    { h: 'What it does not defend against',
      list: [
        ['A phone that is already compromised.', 'You type your phrase into this app. If ' +
          'something else on the device is watching the keyboard or the screen, Keyfob cannot ' +
          'help you. Build your plan on a phone you trust, offline, in a room by yourself.'],
        ['Coercion.', 'Someone who can make you gather the cards gets the phrase. No threshold ' +
          'scheme fixes that. If this is a real risk for you, you need a different plan than any ' +
          'app can give you.'],
        ['Guardians colluding at the threshold.', 'Three people who can reach each other and ' +
          'agree can rebuild your phrase without you. Choose holders who are not all in one ' +
          'circle, and keep the threshold above the size of any circle they share.'],
        ['A guardian who photographs their card.', 'A card in a cloud backup is a card an ' +
          'attacker can collect quietly. The card text says so. Say it again out loud when you ' +
          'hand it over.'],
        ['A phrase that was already exposed.', 'If your phrase has ever been typed into a ' +
          'website, stored in a password manager or photographed, splitting it now does not ' +
          'unring that bell. Move to a new phrase first, then plan.'],
        ['Anything on the chain.', 'Keyfob has no opinion about what your phrase controls, ' +
          'and no way to find out.']
      ] },

    { h: 'What Keyfob keeps on this device',
      list: [
        ['A four byte fingerprint of your phrase.', 'A one way hash, truncated. It can tell you ' +
          '"yes, that is the phrase you planned for" and it cannot be turned back into anything.'],
        ['A six character label for each card.', 'Also a truncated hash, so the app can tell you ' +
          'whose card you have just typed in.'],
        ['Names, notes and dates.', 'The names you gave your guardians and heirs, your threshold, ' +
          'when you issued cards, when you last ran a drill.'],
        ['Your letter to your heirs.', 'Stored in plain text in this app’s private storage, ' +
          'because nothing here can encrypt it in a way you could reliably decrypt later.']
      ],
      after: 'It never keeps your recovery phrase, and it never keeps a card. Those exist only ' +
             'while the screen showing them is open, and only in memory.' },

    { h: 'What Keyfob cannot do to you',
      p: ['There is no account, no server and no internet permission in the manifest. Android ' +
          'will not open a socket for this app, so nothing you type can leave the phone, whatever ' +
          'anyone claims. There are no ads, no analytics, no crash reporter and no advertising ID.',
          'There is nothing to buy. Every part of the app is in front of you.'] }
  ];

  /* ---------- the card format, explained ---------- */

  const FORMAT = [
    'Each card is a list of words from the same standard list your recovery phrase uses, so a ' +
    'guardian copies out one familiar kind of thing.',
    'The words carry the share itself, the card number, the threshold, and a checksum. If a word ' +
    'is mistyped or two words are swapped, the checksum catches it before anything is built on top.',
    'The mathematics is Shamir secret sharing in the field of 256 elements, byte by byte, the ' +
    'same idea behind SLIP-39 hardware wallet backups. The card layout is Keyfob’s own, so ' +
    'cards issued here are read here.'
  ];

  return { INTRO: INTRO, QUIZ: QUIZ, THREAT: THREAT, FORMAT: FORMAT,
           GUARDIAN_TIPS: GUARDIAN_TIPS, CARD_NOTE: CARD_NOTE,
           shapeLines: shapeLines, shapeNote: shapeNote, word: word };
})();
