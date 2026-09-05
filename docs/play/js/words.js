/* Keyfob. The word grid: the only place in the app where a secret is typed.

   Every slot completes from the standard list, so a guardian who cannot read
   their own handwriting still gets the word right, and a word that is not on the
   list can never be entered silently. */
const WordGrid = (function () {
  'use strict';

  function create(host, opts) {
    opts = opts || {};
    let count = opts.count || 12;
    let onChange = opts.onChange || function () {};

    host.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'wg';
    const sug = document.createElement('div');
    sug.className = 'wg-sug';
    sug.setAttribute('aria-label', 'Word suggestions');
    host.appendChild(grid);
    host.appendChild(sug);

    let inputs = [];

    function build() {
      grid.innerHTML = '';
      inputs = [];
      for (let i = 0; i < count; i++) {
        const cell = document.createElement('label');
        cell.className = 'wg-cell';
        const num = document.createElement('span');
        num.className = 'wg-num';
        num.textContent = i + 1;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'wg-in';
        inp.autocapitalize = 'none';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        inp.setAttribute('autocorrect', 'off');
        inp.setAttribute('inputmode', 'text');
        inp.setAttribute('aria-label', 'Word ' + (i + 1));
        inp.dataset.i = i;
        cell.appendChild(num);
        cell.appendChild(inp);
        grid.appendChild(cell);
        inputs.push(inp);
      }
      wire();
      paint();
    }

    function wire() {
      inputs.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          const v = inp.value.toLowerCase().replace(/[^a-z]/g, '');
          if (v !== inp.value) inp.value = v;
          suggest(i);
          paint();
          onChange(words());
        });
        inp.addEventListener('focus', () => { suggest(i); });
        inp.addEventListener('blur', () => {
          const v = inp.value.trim().toLowerCase();
          if (v && !Bip39.isWord(v)) {
            const m = Bip39.matches(v, 2);
            if (m.length === 1) { inp.value = m[0]; paint(); onChange(words()); }
          }
          setTimeout(() => { if (!host.contains(document.activeElement)) clearSug(); }, 120);
        });
        inp.addEventListener('keydown', e => {
          if (e.key === ' ' || e.key === 'Enter' || e.key === 'Tab') {
            const v = inp.value.trim().toLowerCase();
            const m = v ? Bip39.matches(v, 2) : [];
            if (m.length === 1) inp.value = m[0];
            if (e.key !== 'Tab') {
              e.preventDefault();
              paint(); onChange(words());
              if (i + 1 < inputs.length) inputs[i + 1].focus();
              else inp.blur();
            }
          } else if (e.key === 'Backspace' && !inp.value && i > 0) {
            e.preventDefault();
            inputs[i - 1].focus();
          }
        });
        inp.addEventListener('paste', e => {
          const text = (e.clipboardData || window.clipboardData).getData('text') || '';
          const ws = Bip39.normalise(text);
          if (ws.length < 2) return;
          e.preventDefault();
          for (let k = 0; k < ws.length && i + k < inputs.length; k++) inputs[i + k].value = ws[k];
          paint(); onChange(words());
          clearSug();
        });
      });
    }

    function clearSug() { sug.innerHTML = ''; sug.classList.remove('on'); }

    function suggest(i) {
      const v = inputs[i].value.trim().toLowerCase();
      sug.innerHTML = '';
      if (!v || Bip39.isWord(v)) { sug.classList.remove('on'); return; }
      const m = Bip39.matches(v, 5);
      if (!m.length) {
        const p = document.createElement('span');
        p.className = 'wg-none';
        p.textContent = 'No word on the standard list starts with "' + v + '".';
        sug.appendChild(p);
        sug.classList.add('on');
        return;
      }
      m.forEach(w => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'wg-chip';
        b.textContent = w;
        b.addEventListener('mousedown', e => e.preventDefault());
        b.addEventListener('click', () => {
          inputs[i].value = w;
          paint(); onChange(words());
          if (i + 1 < inputs.length) inputs[i + 1].focus(); else inputs[i].blur();
        });
        sug.appendChild(b);
      });
      sug.classList.add('on');
    }

    function paint() {
      inputs.forEach(inp => {
        const v = inp.value.trim().toLowerCase();
        inp.classList.toggle('bad', !!v && !Bip39.isWord(v));
        inp.classList.toggle('good', !!v && Bip39.isWord(v));
      });
    }

    const words = () => inputs.map(i => i.value.trim().toLowerCase());
    const filled = () => words().filter(Boolean).length;
    const allValid = () => words().every(w => Bip39.isWord(w));

    build();

    return {
      setCount(n) { if (n !== count) { count = n; build(); onChange(words()); } },
      count() { return count; },
      words: words,
      filled: filled,
      allValid: allValid,
      setWords(arr) {
        for (let i = 0; i < inputs.length; i++) inputs[i].value = arr[i] || '';
        paint(); clearSug(); onChange(words());
      },
      clear() { inputs.forEach(i => { i.value = ''; }); paint(); clearSug(); onChange(words()); },
      focusFirst() { const e = inputs.filter(i => !i.value)[0] || inputs[0]; if (e) e.focus(); },
      blur() { inputs.forEach(i => i.blur()); clearSug(); }
    };
  }

  return { create: create };
})();
