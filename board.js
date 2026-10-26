/* Garbo — board.js  ·  the creative board
   ---------------------------------------------------------------------------
   build.py writes window.GARBO_ITEMS from the image pull. This lays it out and
   lets it be edited: archive and restore plates, drag them into a new order,
   select several (shift / ⌘-click) and move or archive them together.

   Layout. Rows mode justifies every row flush to both edges at one shared
   height, so the board reads as a single aligned block; only the last row is
   left at its natural width. Grid mode crops every plate to the same 4:5 cell.

   State. { order:[ids], archived:[ids], was:{id:index} } in localStorage, so
   the arrangement survives reloads; plates new to items.js are appended to the
   end of the board. "Save arrangement" writes it to a JSON file and "Load"
   reads one back, for moving it to another browser or keeping a copy.
   Nothing is ever deleted — archive is the only way off the board.
   Opened through serve.py, the state is also kept in board-save.json, which
   wins over the browser's copy — so the order doesn't depend on which address
   the page was opened from.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";

  var KEY = "garbo-board-v8", PREFS = "garbo-board-prefs";
  var VIEW = !!window.GARBO_VIEW;   // the public copy: look, don't touch
  var DISK = !VIEW && /^https?:$/.test(location.protocol);
  var SIZES = { rows: { s: 190, m: 300, l: 470 }, grid: { s: 150, m: 230, l: 360 } };

  var ALL = {};
  (window.GARBO_ITEMS || []).forEach(function (it) {
    var w = +it.w, h = +it.h;
    it.ar = w > 0 && h > 0 ? Math.min(6, Math.max(0.2, w / h)) : 1;
    ALL[it.id] = it;
  });

  /* ---------------- colour: the grade ----------------
     build.py reads each plate's dominant colour. The board is sequenced like a
     film's grade: blue hour → sea glass → moss → straw → amber → rust → ember
     → rose → violet. Colour runs round that path in 24° bands, each band
     snaking dark→light then light→dark so neighbours stay close in tone.
     Black & white is threaded through the colour at an even rhythm, and it
     flows the way the colour does: along a smooth tone curve that follows the
     colour around it, so dark stills sit among dark colour and pale among
     pale, and one silver plate leads gently into the next.
     Near-black and barely-tinted plates read their hue as noise, so they are
     woven by tone with the silver rather than scattered through the bands.
     The sequence carries no titles and no breaks: one floor of pictures. */
  function path(it) { return (230 - it.hue + 720) % 360; }
  function neutral(it) { return it.mono || it.hue == null || it.lum < 0.09 || it.sat < 0.05; }
  function colourOrder(ids) {
    var col = [], mono = [];
    ids.forEach(function (id) { (neutral(ALL[id]) ? mono : col).push(id); });
    col.sort(function (a, b) {
      var A = ALL[a], B = ALL[b], ba = Math.floor(path(A) / 24), bb = Math.floor(path(B) / 24);
      return ba - bb || (ba % 2 ? B.lum - A.lum : A.lum - B.lum);
    });
    if (!col.length || !mono.length) return col.concat(mono.sort(function (a, b) { return ALL[b].lum - ALL[a].lum; }));
    // even rhythm: slot k is silver when the running share of silver falls
    // behind its overall share
    var total = col.length + mono.length, share = mono.length / total, seq = [], ci = 0, placed = 0;
    for (var k = 0; k < total; k++) {
      var wantMono = placed < Math.round((k + 1) * share) && placed < mono.length;
      if (ci >= col.length) wantMono = true;
      seq.push(wantMono ? null : col[ci++]);
      if (wantMono) placed++;
    }
    // The silver follows a smooth tone curve, the way the colour flows along
    // its path: each slot's tone is a soft, wide average of the colour around
    // it (gaussian, about two rows either side), so neighbouring silver plates
    // step gently lighter or darker instead of jumping. Plates are then dealt
    // to slots by rank, darkest to darkest.
    var R = 12, slots = [];
    seq.forEach(function (id, k) {
      if (id !== null) return;
      var sum = 0, wsum = 0;
      for (var j = Math.max(0, k - R); j <= Math.min(total - 1, k + R); j++) {
        if (!seq[j]) continue;
        var w = Math.exp(-((j - k) * (j - k)) / (2 * 25));
        sum += ALL[seq[j]].lum * w; wsum += w;
      }
      slots.push({ k: k, lum: wsum ? sum / wsum : 0.5 });
    });
    // order slots by tone, and within equal tone by position, so the curve
    // never reverses on a tie
    slots.sort(function (a, b) { return (a.lum - b.lum) || (a.k - b.k); });
    mono.sort(function (a, b) { return ALL[a].lum - ALL[b].lum; });
    slots.forEach(function (sl, i) { seq[sl.k] = mono[i]; });
    return seq;
  }
  var sequence = colourOrder;

  var st = load();
  if (DISK) save();   // newcomers placed on load are written straight back
  var prefs = loadPrefs();
  var tab = "board";
  var sel = new Set(), lastSel = null;
  var history = [];
  var board = document.getElementById("board");

  /* ---------------- state ---------------- */

  function fromDisk() {
    // read once, before the first paint, so the board never flashes another order
    try {
      var x = new XMLHttpRequest();
      x.open("GET", VIEW ? "board-save.json?t=" + Date.now() : "api/board", false);
      x.send();
      if (x.status === 200) return JSON.parse(x.responseText);
    } catch (e) {}
    return null;
  }
  function load() {
    var s = DISK || VIEW ? fromDisk() : null;
    if (!s) try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s) {
      // the selects re-sequence the board; anything archived before carries over
      var old = null;
      ["garbo-board-v7", "garbo-board-v6", "garbo-board-v5", "garbo-board-v4", "garbo-board-v3"].some(function (k) {
        try { old = JSON.parse(localStorage.getItem(k)); } catch (e) {}
        return old && old.archived && old.archived.length;
      });
      var r = reconcile(null);
      if (old && old.archived) {
        r.archived = old.archived.filter(function (id) { return ALL[id]; });
        r.order = r.order.filter(function (id) { return r.archived.indexOf(id) < 0; });
      }
      return r;
    }
    return reconcile(s);
  }
  function reconcile(s) {
    var fresh = !(s && Array.isArray(s.order));
    s = fresh ? { order: [], archived: [], was: {} } : s;
    s.archived = s.archived || []; s.was = s.was || {};
    var seen = {};
    function keep(id) { if (ALL[id] && !seen[id]) { seen[id] = 1; return true; } return false; }
    s.order = s.order.filter(keep);
    s.archived = s.archived.filter(keep);
    // from the array, not Object.keys: ids like "100" are integer keys and would jump the queue
    var added = [];
    (window.GARBO_ITEMS || []).forEach(function (it) { if (!seen[it.id]) added.push(it.id); });
    if (fresh) { s.order = sequence(s.order.concat(added)); return s; }
    // Plates new to items.js join an existing arrangement where the colour
    // flow would put them: just after the plate they would follow in a full
    // re-sequence, so a hand-made order is kept and the newcomers still sit
    // among their own colour.
    if (added.length) {
      var ideal = sequence(s.order.concat(added)), isNew = {};
      added.forEach(function (id) { isNew[id] = 1; });
      ideal.forEach(function (id, i) {
        if (!isNew[id]) return;
        var j = i - 1;
        while (j >= 0 && isNew[ideal[j]] && s.order.indexOf(ideal[j]) < 0) j--;
        var at = j < 0 ? 0 : s.order.indexOf(ideal[j]) + 1;
        s.order.splice(at, 0, id);
      });
    }
    return s;
  }
  function save() {
    if (VIEW) return;
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    if (DISK) fetch("api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st), keepalive: true }).catch(function () {});
  }
  function loadPrefs() {
    // the public copy always opens small, whatever a viewer chose last time
    if (VIEW) return { view: "rows", size: "s" };
    var p = null;
    try { p = JSON.parse(localStorage.getItem(PREFS)); } catch (e) {}
    return p || { view: "rows", size: "m" };
  }
  function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) {} }

  function snapshot() {
    history.push(JSON.stringify(st));
    if (history.length > 60) history.shift();
    document.getElementById("undo").disabled = false;
  }
  function undo() {
    if (!history.length) return;
    st = JSON.parse(history.pop());
    document.getElementById("undo").disabled = !history.length;
    sel.clear(); save(); render(true); hideToast();
  }

  function list() { return tab === "board" ? st.order : st.archived; }

  function archive(ids) {
    snapshot();
    ids.forEach(function (id) {
      var i = st.order.indexOf(id);
      if (i < 0) return;
      st.was[id] = i;
      st.order.splice(i, 1);
      st.archived.unshift(id);
    });
    save();
  }
  function restore(ids) {
    snapshot();
    // back to where each one was, earliest first so the positions still line up
    ids.slice().sort(function (a, b) { return (st.was[a] || 0) - (st.was[b] || 0); }).forEach(function (id) {
      var i = st.archived.indexOf(id);
      if (i < 0) return;
      st.archived.splice(i, 1);
      var at = Math.min(st.was[id] == null ? st.order.length : st.was[id], st.order.length);
      st.order.splice(at, 0, id);
      delete st.was[id];
    });
    save();
  }
  /* ---------------- sending a plate further down ----------------
     Dragging a plate a long way down a board of this length means holding the
     mouse against the edge and waiting, so this does the travelling: it looks
     at everything below the plate and drops it at the gap where it sits best.

     "Best" is the board's own grade, not a new idea — the same hue-along-the-
     path and tone that colourOrder sequences by — so a plate sent down lands
     among its own colour rather than somewhere arbitrary. The cost of putting
     x between p and n is the classic insertion cost, how much worse that seam
     reads than p against n alone.

     It will not stop one plate further on: a jump shorter than MIN_JUMP reads
     as nothing having happened, and the point of the button is distance. Press
     it again to keep going; each press starts from where the plate now is, so
     it walks down the board rather than circling one spot.

     It also will not go as far as it likes. The grade is a loop — the board
     ends in violet, which sits next to the blue it opens on — so the best fit
     for a blue-grey plate is often the very last slot, and a press from plate
     111 sent one to plate 578. A move you cannot find again is not a move, so
     each press searches a window of the next WINDOW plates and takes the best
     seam in there. Several presses walk it down; one never teleports it. */
  var MIN_JUMP = 10, WINDOW = 70;

  function hueGap(a, b) {
    var d = Math.abs(path(a) - path(b)) % 360;
    return (d > 180 ? 360 - d : d) / 180;
  }
  function apart(a, b) {
    if (!a || !b) return 0;
    var dl = Math.abs((a.lum || 0) - (b.lum || 0));
    if (neutral(a) !== neutral(b)) return 0.55 + dl;     // silver against colour is the loud seam
    if (neutral(a)) return dl * 1.6;                      // silver reads purely as tone
    return hueGap(a, b) * 0.75 + dl * 0.75;
  }
  // how much worse the board reads with x opened into the seam p|n
  function seamCost(x, p, n) {
    return apart(x, p) + apart(x, n) - apart(p, n);
  }

  /* Where should `ids` go, somewhere below where they are now?
     Returns the id to insert before, or null for the end of the board. */
  function fitBelow(ids) {
    var l = list();
    var rest = l.filter(function (id) { return ids.indexOf(id) < 0; });
    var lowest = 0;
    ids.forEach(function (id) { lowest = Math.max(lowest, l.indexOf(id)); });
    var head = ALL[ids[0]], tail = ALL[ids[ids.length - 1]];
    // a slot k means "before rest[k]"; k === rest.length is the end
    var from = Math.min(rest.length, lowest + MIN_JUMP - ids.length + 1);
    if (from >= rest.length) return null;
    var to = Math.min(rest.length, from + WINDOW);
    var best = null, bestCost = Infinity;
    for (var k = from; k <= to; k++) {
      var p = k > 0 ? ALL[rest[k - 1]] : null, n = k < rest.length ? ALL[rest[k]] : null;
      // The end of the board has only one neighbour, so an unguarded insertion
      // cost scores it on one seam while every interior slot pays for two — and
      // the end wins every time. It did: the second press sent the plate to
      // plate 580. A missing neighbour is read as a repeat of the one that is
      // there, so every slot is judged on the same two edges.
      if (!p) p = n; if (!n) n = p;
      var c = apart(head, p) + apart(tail, n) - apart(p, n);
      if (c < bestCost) { bestCost = c; best = k; }
    }
    return best >= rest.length ? null : rest[best];
  }

  function sendDown(ids) {
    if (!ids.length) return;
    var l = list(), before = fitBelow(ids);
    var was = l.indexOf(ids[0]);
    // already as far down as it goes: say so rather than reporting a move and
    // pushing a no-op onto the undo stack
    if (before == null && was >= l.length - ids.length) { toast("Already at the end of the board"); return; }
    if (!move(ids, before)) return;
    var now = list().indexOf(ids[0]);
    render(true);
    var t = board.querySelector('.tile[data-id="' + ids[0] + '"]');
    if (t) {
      scrollTo({ top: t.getBoundingClientRect().top + scrollY - innerHeight / 2 + t.offsetHeight / 2, behavior: "smooth" });
      t.classList.remove("landed"); void t.offsetWidth; t.classList.add("landed");
    }
    var n = now - was;
    toast(ids.length === 1
      ? (before == null ? "Sent to the end of the board" : "Sent down " + n + " places, to plate " + (now + 1))
      : ids.length + (before == null ? " sent to the end of the board" : " sent down to plate " + (now + 1)));
  }

  function move(ids, beforeId) {
    var l = list();
    var moving = l.filter(function (id) { return ids.indexOf(id) >= 0; });
    if (!moving.length || moving.indexOf(beforeId) >= 0) return false;
    snapshot();
    var rest = l.filter(function (id) { return ids.indexOf(id) < 0; });
    var at = beforeId == null ? rest.length : rest.indexOf(beforeId);
    if (at < 0) at = rest.length;
    rest.splice.apply(rest, [at, 0].concat(moving));
    if (tab === "board") st.order = rest; else st.archived = rest;
    save();
    return true;
  }

  /* ---------------- layout ---------------- */

  function width() { return board.clientWidth; }
  function gap() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 10; }

  // Greedy rows at the chosen height, each full row scaled to land exactly on
  // both edges. A last row that would have to blow up past 1.35x is left as is.
  // Every row the same height. A full row's plates are widened by the few
  // percent it takes to land flush on both edges, and cropped to fit, so the
  // board reads as one even floor. The last row keeps its natural widths
  // unless it is nearly full.
  function rows(ids, W, H, G) {
    var out = [], cur = [], span = 0;
    function close(last) {
      var natural = span * H + G * (cur.length - 1);
      var fill = !last || natural >= W * 0.72;
      out.push({ ids: cur, h: H, w: cur.map(function (id) {
        return fill ? ALL[id].ar / span * (W - G * (cur.length - 1)) : ALL[id].ar * H;
      }) });
      cur = []; span = 0;
    }
    ids.forEach(function (id) {
      cur.push(id); span += ALL[id].ar;
      if (span * H + G * (cur.length - 1) >= W) close(false);
    });
    if (cur.length) close(true);
    return out;
  }

  function tile(id, n) {
    var it = ALL[id];
    var fig = document.createElement("figure");
    fig.className = "tile" + (sel.has(id) ? " sel" : "");
    fig.style.margin = "0";
    fig.dataset.id = id;
    fig.draggable = !VIEW;

    var el;
    if (it.type === "video") {
      el = document.createElement("video");
      el.muted = true; el.loop = true; el.playsInline = true; el.preload = "none";
      el.setAttribute("muted", ""); el.setAttribute("playsinline", "");
      el.dataset.src = it.src;
    } else {
      el = document.createElement("img");
      el.loading = "lazy"; el.decoding = "async"; el.alt = "";
      el.draggable = false;
      el.src = it.src;
    }
    fig.appendChild(el);

    var tools = document.createElement("div");
    tools.className = "tools";
    tools.innerHTML = '<button class="chk" data-a="sel" aria-label="Select"></button><span class="acts">' +
      (tab === "board"
        ? '<button class="act" data-a="down" title="Send it further down the board, to the next place its colour sits">Down</button>'
        : "") +
      '<button class="act" data-a="' + (tab === "board" ? "archive" : "restore") + '">' +
      (tab === "board" ? "Archive" : "Restore") + "</button></span>";
    fig.appendChild(tools);
    var num = document.createElement("span");
    num.className = "num"; num.textContent = n;
    fig.appendChild(num);
    if (it.type === "video") { var m = document.createElement("span"); m.className = "moving"; fig.appendChild(m); }
    return fig;
  }

  var io = null;
  function observe() {
    if (io) io.disconnect();
    var els = board.querySelectorAll("img, video");
    function show(el) {
      if (el.tagName === "VIDEO") {
        if (!el.getAttribute("src")) {
          el.src = el.dataset.src;
          el.addEventListener("loadeddata", function () { el.classList.add("in"); }, { once: true });
        }
        el.play().catch(function () {});
      } else if (el.complete && el.naturalWidth) el.classList.add("in");
      else el.addEventListener("load", function () { el.classList.add("in"); }, { once: true });
    }
    if (!("IntersectionObserver" in window)) { [].forEach.call(els, show); return; }
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) show(e.target);
        else if (e.target.tagName === "VIDEO" && e.target.getAttribute("src")) e.target.pause();
      });
    }, { rootMargin: "400px 0px" });
    [].forEach.call(els, function (el) { io.observe(el); });
  }

  function render(keepScroll) {
    var y = scrollY;
    var ids = list(), W = width(), G = gap();
    var frag = document.createDocumentFragment(), n = 0, index = {};
    ids.forEach(function (id, i) { index[id] = i + 1; });
    board.className = prefs.view === "grid" ? "grid" : "";
    if (!ids.length) {
      board.innerHTML = tab === "archive"
        ? '<div class="quiet label"><div class="big">Nothing archived</div>Archive a plate from the board and it waits here.</div>'
        : '<div class="quiet label"><div class="big">The board is empty</div>Everything is in the archive.</div>';
    } else {
      [{ ids: ids }].forEach(function (r) {
        if (prefs.view === "grid") {
          var g = document.createElement("div");
          g.className = "cells";
          g.style.setProperty("--cell", SIZES.grid[prefs.size] + "px");
          r.ids.forEach(function (id) { g.appendChild(tile(id, index[id])); });
          frag.appendChild(g);
        } else {
          rows(r.ids, W, SIZES.rows[prefs.size], G).forEach(function (row) {
            var el = document.createElement("div");
            el.className = "row";
            el.style.height = row.h.toFixed(2) + "px";
            row.ids.forEach(function (id, k) {
              var t = tile(id, index[id]);
              t.style.width = row.w[k].toFixed(2) + "px";
              t.style.height = "100%";
              el.appendChild(t);
            });
            frag.appendChild(el);
          });
        }
        n += r.ids.length;
      });
      board.textContent = ""; board.appendChild(frag);
    }
    observe();
    var byId = {};
    [].forEach.call(board.querySelectorAll(".tile"), function (t) { byId[t.dataset.id] = t; });
    tiles = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    drawStrip();
    counts();
    selbar();
    if (keepScroll) scrollTo(0, y);
  }

  /* ---------------- the grade ----------------
     The ground takes a trace of the colour on screen: the strip window's
     middle plate, or the nearest colour plate to it. */
  function tint(c) { document.documentElement.style.setProperty("--tint", c || "#0a0a0b"); }
  function gradeAt(mid) {
    for (var d = 0; d < 12; d++) {
      var t = tiles[mid + d] || tiles[mid - d];
      var it = t && ALL[t.dataset.id];
      if (it && !it.mono) return tint(it.c);
    }
    tint("#77756f");
  }

  /* ---------------- the colour strip ----------------
     One swatch per plate, in board order, under the controls. Click to jump;
     the outlined window shows which part of the board is on screen. */
  var strip = document.getElementById("strip"), win = document.getElementById("stripWin");
  function drawStrip() {
    var ids = list();
    strip.querySelectorAll("i").forEach(function (x) { x.remove(); });
    var frag = document.createDocumentFragment();
    ids.forEach(function (id, i) {
      var s = document.createElement("i");
      s.style.background = ALL[id].c || "#222";
      s.dataset.i = i;
      frag.appendChild(s);
    });
    strip.insertBefore(frag, win);
    stripWindow();
  }
  var tiles = [];
  function stripWindow() {
    if (!tiles.length) { win.style.display = "none"; return; }
    var first = -1, last = -1, top = 150, bot = innerHeight;
    for (var i = 0; i < tiles.length; i++) {
      var r = tiles[i].getBoundingClientRect();
      if (r.bottom > top && r.top < bot) { if (first < 0) first = i; last = i; }
      else if (first >= 0) break;
    }
    if (first < 0) { win.style.display = "none"; return; }
    win.style.display = "block";
    win.style.left = (first / tiles.length * 100) + "%";
    win.style.width = Math.max(0.6, (last - first + 1) / tiles.length * 100) + "%";
    gradeAt(Math.floor((first + last) / 2));
  }
  strip.addEventListener("click", function (e) {
    var r = strip.getBoundingClientRect();
    var i = Math.min(tiles.length - 1, Math.floor((e.clientX - r.left) / r.width * tiles.length));
    var t = tiles[i];
    if (!t) return;
    var y = t.getBoundingClientRect().top + scrollY - innerHeight / 2 + t.offsetHeight / 2;
    scrollTo({ top: y, behavior: "smooth" });
    t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash");
  });
  var stripRaf = 0;
  addEventListener("scroll", function () {
    if (!stripRaf) stripRaf = requestAnimationFrame(function () { stripRaf = 0; stripWindow(); });
  }, { passive: true });

  function counts() {
    document.getElementById("nBoard").textContent = st.order.length;
    document.getElementById("nArch").textContent = st.archived.length;
  }

  /* ---------------- selection ---------------- */

  function toggle(id, range) {
    var l = list();
    if (range && lastSel != null && l.indexOf(lastSel) >= 0) {
      var a = l.indexOf(lastSel), b = l.indexOf(id);
      l.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (x) { sel.add(x); });
    } else if (sel.has(id)) sel.delete(id);
    else sel.add(id);
    lastSel = id;
    [].forEach.call(board.querySelectorAll(".tile"), function (t) { t.classList.toggle("sel", sel.has(t.dataset.id)); });
    selbar();
  }
  function selbar() {
    var bar = document.getElementById("selbar");
    bar.classList.toggle("on", sel.size > 0);
    if (sel.size) hideToast();
    document.getElementById("selCount").textContent = sel.size + " selected";
    document.getElementById("bulkMain").textContent = tab === "board" ? "Archive" : "Restore";
    document.getElementById("bulkMain").dataset.bulk = tab === "board" ? "archive" : "restore";
    document.getElementById("bulkDown").hidden = tab !== "board";
  }
  function selected() { return list().filter(function (id) { return sel.has(id); }); }

  /* ---------------- toast ---------------- */

  var tt;
  function toast(msg) {
    document.getElementById("toastMsg").textContent = msg;
    var t = document.getElementById("toast");
    t.classList.add("on");
    clearTimeout(tt); tt = setTimeout(hideToast, 5000);
  }
  function hideToast() { document.getElementById("toast").classList.remove("on"); }
  document.getElementById("toastUndo").addEventListener("click", undo);

  function doArchive(ids) {
    if (!ids.length) return;
    if (tab === "board") { archive(ids); toast(ids.length === 1 ? "Archived" : ids.length + " archived"); }
    else { restore(ids); toast(ids.length === 1 ? "Back on the board" : ids.length + " back on the board"); }
    ids.forEach(function (id) { sel.delete(id); });
    render(true);
  }

  /* ---------------- clicks ---------------- */

  board.addEventListener("click", function (e) {
    var t = e.target.closest(".tile");
    if (!t) return;
    var id = t.dataset.id, a = e.target.dataset.a;
    if (VIEW) { openLb(list().indexOf(id)); return; }
    if (a === "sel") { toggle(id, e.shiftKey); return; }
    if (a === "archive" || a === "restore") { doArchive([id]); return; }
    // a plate inside a selection takes the whole selection with it, the way
    // dragging one of them already does
    if (a === "down") { sendDown(sel.has(id) ? selected() : [id]); return; }
    if (e.shiftKey || e.metaKey || e.ctrlKey || sel.size) { toggle(id, e.shiftKey); return; }
    openLb(list().indexOf(id));
  });

  document.getElementById("selbar").addEventListener("click", function (e) {
    var b = e.target.dataset.bulk;
    if (!b) return;
    var ids = selected();
    if (b === "clear") { sel.clear(); render(true); return; }
    if (b === "archive" || b === "restore") { doArchive(ids); return; }
    if (b === "down") { sendDown(ids); return; }
    if (b === "start") { move(ids, list()[0]); }
    if (b === "end") { move(ids, null); }
    sel.clear(); render(true);
    toast(ids.length + " moved to the " + (b === "start" ? "start" : "end"));
  });

  /* ---------------- drag to reorder ---------------- */

  var drag = null, drop = document.getElementById("drop"), target = null;
  board.addEventListener("dragstart", function (e) {
    var t = e.target.closest(".tile");
    if (!t) return;
    var id = t.dataset.id;
    drag = sel.has(id) ? selected() : [id];
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch (err) {}
    requestAnimationFrame(function () {
      drag && drag.forEach(function (d) { var el = board.querySelector('[data-id="' + d + '"]'); if (el) el.classList.add("dragging"); });
    });
  });
  board.addEventListener("dragover", function (e) {
    if (!drag) return;
    e.preventDefault();
    var t = e.target.closest(".tile");
    if (!t) return;
    var r = t.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
    var G = gap();
    drop.style.display = "block";
    drop.style.left = (after ? r.right + G / 2 : r.left - G / 2) - 1 + "px";
    drop.style.top = r.top + "px";
    drop.style.height = r.height + "px";
    var l = list(), i = l.indexOf(t.dataset.id);
    target = after ? (l[i + 1] === undefined ? null : l[i + 1]) : t.dataset.id;
    // scroll while dragging near the edges
    if (e.clientY < 110) scrollBy(0, -18);
    else if (e.clientY > innerHeight - 70) scrollBy(0, 18);
  });
  function endDrag() {
    drop.style.display = "none";
    [].forEach.call(board.querySelectorAll(".dragging"), function (el) { el.classList.remove("dragging"); });
    drag = null;
  }
  board.addEventListener("drop", function (e) {
    e.preventDefault();
    if (!drag) return;
    var ids = drag;
    // dropping just past a plate that is itself moving: slide to the next one that isn't
    var l = list(), t = target;
    while (t != null && ids.indexOf(t) >= 0) { var i = l.indexOf(t); t = l[i + 1] === undefined ? null : l[i + 1]; }
    endDrag();
    if (move(ids, t)) { sel.clear(); render(true); }
  });
  board.addEventListener("dragend", endDrag);

  /* ---------------- controls ---------------- */

  document.getElementById("controls").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) {
      tab = b.dataset.tab; sel.clear();
      mark("[data-tab]", b); render(); scrollTo({ top: 0 });
    } else if (b.dataset.view) {
      prefs.view = b.dataset.view; savePrefs(); mark("[data-view]", b); render(true);
    } else if (b.dataset.size) {
      prefs.size = b.dataset.size; savePrefs(); mark("[data-size]", b); render(true);
    }
  });
  function mark(q, on) { [].forEach.call(document.querySelectorAll(q), function (x) { x.classList.toggle("on", x === on); }); }
  mark("[data-view]", document.querySelector('[data-view="' + prefs.view + '"]'));
  mark("[data-size]", document.querySelector('[data-size="' + prefs.size + '"]'));

  document.getElementById("undo").addEventListener("click", undo);

  document.getElementById("byColour").addEventListener("click", function () {
    snapshot();
    if (tab === "board") st.order = sequence(st.order); else st.archived = colourOrder(st.archived);
    save(); sel.clear(); render(); scrollTo({ top: 0 });
    toast("Arranged by colour");
  });

  document.getElementById("exportBtn").addEventListener("click", function () {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(st, null, 1)], { type: "application/json" }));
    a.download = "garbo-board-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    toast("Arrangement saved to Downloads");
  });
  document.getElementById("importIn").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (!f) return;
    f.text().then(function (txt) {
      snapshot();
      st = reconcile(JSON.parse(txt)); save(); sel.clear(); render();
      toast("Arrangement loaded");
    }).catch(function () { toast("Couldn't read that file"); });
    e.target.value = "";
  });

  document.getElementById("pdf").addEventListener("click", function () {
    var stills = st.order.map(function (id) { return ALL[id]; }).filter(function (it) { return it.type !== "video"; });
    if (window.Print && stills.length) window.Print.run(stills, "Garbo · Creative Board");
  });

  /* ---------------- viewer ---------------- */

  var lb = document.getElementById("lb"), lbi = lb.querySelector("img"), lbv = lb.querySelector("video");
  var at = 0;
  function showLb(i) {
    var l = list();
    if (!l.length) { closeLb(); return; }
    at = (i + l.length) % l.length;
    var it = ALL[l[at]], moving = it.type === "video";
    lbi.hidden = moving; lbv.hidden = !moving;
    if (moving) { lbi.removeAttribute("src"); lbv.src = it.src; lbv.play().catch(function () {}); }
    else { lbv.pause(); lbv.removeAttribute("src"); lbi.src = it.src; }
    document.getElementById("lbn").textContent = String(at + 1).padStart(2, "0") + " / " + l.length;
    document.getElementById("lbf").textContent = it.name || "";
    document.getElementById("lbAct").innerHTML = tab === "board" ? "Archive<kbd>A</kbd>" : "Restore<kbd>R</kbd>";
  }
  function openLb(i) { showLb(i); lb.classList.add("on"); document.body.style.overflow = "hidden"; }
  function closeLb() {
    lb.classList.remove("on"); document.body.style.overflow = "";
    lbi.removeAttribute("src"); lbv.pause(); lbv.removeAttribute("src");
  }
  function lbArchive() {
    var id = list()[at];
    if (!id) return;
    doArchive([id]);
    showLb(at); // the next plate slides into this position
  }
  lb.querySelector(".x").addEventListener("click", closeLb);
  lb.querySelector(".nav.p").addEventListener("click", function () { showLb(at - 1); });
  lb.querySelector(".nav.n").addEventListener("click", function () { showLb(at + 1); });
  lbi.addEventListener("click", closeLb);
  lbv.addEventListener("click", closeLb);
  document.getElementById("lbAct").addEventListener("click", lbArchive);

  var tx = 0, ty = 0;
  lb.addEventListener("touchstart", function (e) { var t = e.changedTouches[0]; tx = t.clientX; ty = t.clientY; }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) showLb(at + (dx < 0 ? 1 : -1));
  }, { passive: true });

  addEventListener("keydown", function (e) {
    if (VIEW && !lb.classList.contains("on")) return;
    if (VIEW && !/^(Escape|ArrowRight|ArrowLeft)$/.test(e.key)) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (lb.classList.contains("on")) {
      if (e.key === "Escape") closeLb();
      else if (e.key === "ArrowRight") showLb(at + 1);
      else if (e.key === "ArrowLeft") showLb(at - 1);
      else if ((e.key === "a" && tab === "board") || (e.key === "r" && tab === "archive")) lbArchive();
      return;
    }
    if (e.key === "Escape" && sel.size) { sel.clear(); render(true); }
    if ((e.key === "Backspace" || e.key === "Delete") && sel.size && tab === "board") { e.preventDefault(); doArchive(selected()); }
  });

  /* ---------------- scroll rule, resize ---------------- */

  var bar = document.getElementById("bar");
  addEventListener("scroll", function () {
    var h = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + "%";
  }, { passive: true });
  var lastW = 0, rt;
  addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (width() !== lastW) { lastW = width(); render(true); } }, 120);
  });

  if (!Object.keys(ALL).length) {
    board.innerHTML = '<div class="quiet label"><div class="big">No plates yet</div>Run build.py to pull the images in.</div>';
    return;
  }
  lastW = width();
  render();

  // index.html#<plate id> opens the board on that plate and outlines it, e.g.
  // index.html#a-1 for something just dropped into additions/
  function jumpTo() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    if (st.archived.indexOf(id) >= 0 && tab !== "archive") document.querySelector('[data-tab="archive"]').click();
    var t = board.querySelector('[data-id="' + id.replace(/"/g, "") + '"]');
    if (!t) return;
    scrollTo({ top: t.getBoundingClientRect().top + scrollY - innerHeight / 2 + t.offsetHeight / 2 });
    t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash");
  }
  jumpTo();
  addEventListener("hashchange", jumpTo);
})();
