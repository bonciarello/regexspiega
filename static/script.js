/* ============================================================
   RegexSpiega — Logica frontend interattiva
   ============================================================ */

(function () {
  'use strict';

  /* --- DOM refs --- */
  const regexInput    = document.getElementById('regex-input');
  const textInput     = document.getElementById('text-input');
  const analyzeBtn    = document.getElementById('analyze-btn');
  const regexError    = document.getElementById('regex-error');
  const textError     = document.getElementById('text-error');
  const resultsPanel  = document.getElementById('results-panel');
  const errorPanel    = document.getElementById('error-panel');
  const errorMessage  = document.getElementById('error-message');
  const textDisplay   = document.getElementById('text-display');
  const matchesList   = document.getElementById('matches-list');
  const matchCount    = document.getElementById('match-count');
  const flagsActive   = document.getElementById('flags-active');
  const flagBtns      = document.querySelectorAll('.flag-btn');

  let currentResult = null;
  let activeMatchId  = null;

  /* --- Flag toggles --- */
  /** @type {Set<string>} */
  const activeFlags = new Set();

  flagBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const flag = btn.getAttribute('data-flag');
      if (activeFlags.has(flag)) {
        activeFlags.delete(flag);
        btn.setAttribute('aria-pressed', 'false');
      } else {
        activeFlags.add(flag);
        btn.setAttribute('aria-pressed', 'true');
      }
    });
  });

  /* --- Analyze --- */
  analyzeBtn.addEventListener('click', runAnalysis);

  /* Keyboard shortcut: Ctrl+Enter */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runAnalysis();
    }
  });

  function runAnalysis() {
    const pattern = regexInput.value.trim();
    const text    = textInput.value;

    // Reset
    clearErrors();
    errorPanel.hidden = true;
    resultsPanel.hidden = true;
    activeMatchId = null;

    // Validate
    if (!pattern) {
      showError(regexError, 'Inserisci un\'espressione regolare.');
      regexInput.focus();
      return;
    }

    if (!text) {
      // text vuoto è valido — potremmo non trovare nulla, ma non è un errore
    }

    const flags = Array.from(activeFlags);

    fetch('api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: pattern, text: text, flags: flags })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          showErrorPanel(data.message);
          return;
        }
        currentResult = data;
        renderResults(data);
      })
      .catch(function (err) {
        showErrorPanel('Impossibile contattare il server: ' + err.message);
      });
  }

  /* --- Error display --- */
  function clearErrors() {
    regexError.hidden = true;
    regexError.textContent = '';
    textError.hidden = true;
    textError.textContent = '';
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function showErrorPanel(msg) {
    errorMessage.textContent = msg;
    errorPanel.hidden = false;
    resultsPanel.hidden = true;
    currentResult = null;
  }

  /* --- Render results --- */
  function renderResults(data) {
    resultsPanel.hidden = false;

    // Stats
    matchCount.textContent = data.total_matches + ' match';
    if (data.total_matches !== 1) matchCount.textContent += 'es';

    if (data.flags && data.flags.length > 0) {
      flagsActive.textContent = 'Flag: ' + data.flags.join(', ');
      flagsActive.hidden = false;
    } else {
      flagsActive.hidden = true;
    }

    // Build highlighted text
    renderTextDisplay(data);

    // Build match cards
    renderMatchCards(data);
  }

  function renderTextDisplay(data) {
    textDisplay.innerHTML = '';

    if (!data.text) {
      textDisplay.textContent = '(testo vuoto)';
      return;
    }

    const text = data.text;
    const matches = data.matches;

    if (matches.length === 0) {
      textDisplay.textContent = text;
      return;
    }

    // Track per-character group assignment
    // charGroups[i] = array of group indices that cover position i
    const charGroups = new Array(text.length);
    for (let i = 0; i < text.length; i++) {
      charGroups[i] = [];
    }

    const matchSpans = []; // {start, end, matchIndex}

    matches.forEach(function (match, mIdx) {
      matchSpans.push({ start: match.start, end: match.end, matchIndex: mIdx });
      // Mark match cover on chars
      for (let i = match.start; i < match.end; i++) {
        charGroups[i].push(0); // 0 means "part of a match"
      }
      // Mark group cover on chars
      if (match.groups) {
        match.groups.forEach(function (g) {
          if (g.is_null) return;
          for (let i = g.start; i < g.end; i++) {
            charGroups[i].push(g.index);
          }
        });
      }
    });

    // Build character-by-character with spans
    let html = '';
    let i = 0;
    while (i < text.length) {
      // Find the longest span starting at i that belongs to a match
      let spanLen = 1;
      let matchIdx = -1;

      for (let m = 0; m < matchSpans.length; m++) {
        const ms = matchSpans[m];
        if (i >= ms.start && i < ms.end) {
          const len = ms.end - i;
          if (len > spanLen) {
            spanLen = len;
            matchIdx = m;
          }
        }
      }

      // Also check for group-only spans (characters inside a group but maybe not a whole match span)
      if (matchIdx === -1) {
        // Check if this character belongs to any group
        const grps = charGroups[i];
        if (grps.length > 0 && !grps.includes(0)) {
          // Belongs to a group but we didn't find a match span — find the group span
          let gSpan = 1;
          let gIdx = grps[0];
          for (let j = i + 1; j < text.length; j++) {
            if (charGroups[j].includes(gIdx)) {
              gSpan++;
            } else {
              break;
            }
          }
          html += wrapGroupSpan(text.substring(i, i + gSpan), gIdx);
          i += gSpan;
          continue;
        }
      }

      if (matchIdx >= 0) {
        const ms = matchSpans[matchIdx];
        const segText = text.substring(i, i + spanLen);
        html += wrapMatchSpan(segText, matchIdx);
        i += spanLen;
      } else {
        html += escHtml(text[i]);
        i++;
      }
    }

    textDisplay.innerHTML = html;

    // Attach click handlers to match spans
    textDisplay.querySelectorAll('mark.match-highlight').forEach(function (el) {
      el.addEventListener('click', function () {
        const mId = parseInt(el.getAttribute('data-match'), 10);
        highlightMatch(mId);
      });
    });

    // Attach click handlers to group spans
    textDisplay.querySelectorAll('.group-highlight').forEach(function (el) {
      el.addEventListener('click', function () {
        const mId = parseInt(el.getAttribute('data-match'), 10);
        highlightMatch(mId);
      });
    });
  }

  function wrapMatchSpan(text, matchIdx) {
    var safe = escHtml(text);
    return '<mark class="match-highlight" data-match="' + matchIdx + '" tabindex="0" role="button" aria-label="Match ' + (matchIdx + 1) + ': ' + safe + '">' + safe + '</mark>';
  }

  function wrapGroupSpan(text, groupIdx) {
    var safe = escHtml(text);
    var grpClass = 'grp-' + Math.min(groupIdx, 5);
    // We don't know the match index here directly, but it's clickable
    return '<span class="group-highlight ' + grpClass + '" role="button" tabindex="0" aria-label="Gruppo ' + groupIdx + ': ' + safe + '">' + safe + '</span>';
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* --- Render match cards --- */
  function renderMatchCards(data) {
    matchesList.innerHTML = '';

    if (data.matches.length === 0) {
      matchesList.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-sm);padding:var(--space-2) 0;">Nessun match trovato nel testo.</p>';
      return;
    }

    data.matches.forEach(function (match, idx) {
      var card = document.createElement('div');
      card.className = 'match-card';
      card.setAttribute('role', 'listitem');
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-match-id', idx);

      // Header
      var header = document.createElement('div');
      header.className = 'match-card-header';

      var step = document.createElement('span');
      step.className = 'match-step';
      step.textContent = 'Match #' + match.step;

      var pos = document.createElement('span');
      pos.className = 'match-position';
      pos.textContent = 'Posizione ' + match.start + '–' + (match.end - 1) + ' (' + match.length + ' caratteri)';

      var matched = document.createElement('span');
      matched.className = 'match-matched';
      matched.textContent = match.matched_text;

      header.appendChild(step);
      header.appendChild(pos);
      header.appendChild(matched);
      card.appendChild(header);

      // Body — groups
      var body = document.createElement('div');
      body.className = 'match-card-body';

      if (match.groups && match.groups.length > 0) {
        match.groups.forEach(function (g) {
          var row = document.createElement('div');
          row.className = 'group-row';

          var num = document.createElement('span');
          num.className = 'group-number grp-' + Math.min(g.index, 5);
          num.textContent = '$' + g.index;

          var val = document.createElement('span');
          val.className = 'group-value';
          val.textContent = g.is_null ? '(null)' : g.value;

          var gpos = document.createElement('span');
          gpos.className = 'group-pos';
          gpos.textContent = g.is_null ? '—' : ('[' + g.start + '–' + (g.end - 1) + ']');

          row.appendChild(num);
          row.appendChild(val);
          row.appendChild(gpos);
          body.appendChild(row);
        });
      }

      // Named groups
      if (match.named_groups) {
        Object.keys(match.named_groups).forEach(function (name) {
          var row = document.createElement('div');
          row.className = 'group-row';

          var num = document.createElement('span');
          num.className = 'group-number grp-1';
          num.textContent = name;

          var val = document.createElement('span');
          val.className = 'group-value';
          val.textContent = match.named_groups[name] || '(null)';

          row.appendChild(num);
          row.appendChild(val);
          body.appendChild(row);
        });
      }

      card.appendChild(body);

      // Click to highlight in text
      card.addEventListener('click', function () {
        highlightMatch(idx);
      });

      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          highlightMatch(idx);
        }
      });

      matchesList.appendChild(card);
    });
  }

  function highlightMatch(matchIdx) {
    // Remove previous active
    if (activeMatchId !== null) {
      var prevCards = matchesList.querySelectorAll('.match-card.active');
      prevCards.forEach(function (c) { c.classList.remove('active'); });

      var prevMarks = textDisplay.querySelectorAll('mark.match-highlight.active-match');
      prevMarks.forEach(function (m) { m.classList.remove('active-match'); });
    }

    activeMatchId = matchIdx;

    // Activate card
    var card = matchesList.querySelector('[data-match-id="' + matchIdx + '"]');
    if (card) {
      card.classList.add('active');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Activate mark in text
    var mark = textDisplay.querySelector('mark.match-highlight[data-match="' + matchIdx + '"]');
    if (mark) {
      mark.classList.add('active-match');
      mark.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
})();
