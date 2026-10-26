/* Garbo — approach.js  ·  the approach board
   ---------------------------------------------------------------------------
   A reading page for rewriting scenes. Each scene opens with its number, title
   and the note on why it changes; under it, each suggested shot sits on one row
   with its words on the left and its pictures on the right.

   Editing. Every piece of text is typed into where it sits. Pictures drag
   between any two shots on the page, from the drawer (the whole creative board,
   the scene pulls, anything uploaded), or straight in from the desktop; each
   shot's tray justifies its row flush to both edges like the board does.

   State. The whole document — text, the order of every tray, uploads' sizes —
   starting from approach-scenes.js. Opened through serve.py (the .command
   launcher) it is written to approach-save.json on every change, with dropped
   images saved into uploads/ as real files, so the disk is the record. Opened
   straight from the file it falls back to the browser: localStorage, with
   uploads in IndexedDB. "Save" writes everything, uploads included, to one
   JSON file and "Load" reads it back.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";

  var KEY = "garbo-approach-v1", BOARD_KEY = "garbo-board-v8";
  var DB = "garbo-approach", STORE = "uploads";
  var VIEW = !!window.GARBO_VIEW;   // the public copy: look, don't touch
  var DISK = !VIEW && /^https?:$/.test(location.protocol);

  var ALL = {};
  function admit(it) {
    var w = +it.w, h = +it.h;
    it.ar = w > 0 && h > 0 ? Math.min(6, Math.max(0.2, w / h)) : 1;
    ALL[it.id] = it;
  }
  (window.GARBO_ITEMS || []).forEach(admit);
  (window.APPROACH_PLATES || []).forEach(function (it) { if (!ALL[it.id]) admit(it); });

  var CE = (function () {
    var d = document.createElement("div");
    try { d.contentEditable = "plaintext-only"; } catch (e) {}
    return d.contentEditable === "plaintext-only" ? "plaintext-only" : "true";
  })();

  var st = load();
  var history = [];
  var page = document.getElementById("page");
  var trays = {};          // tray key → element
  var drag = null;         // {id, from, i} while a picture is in the air
  var target = null;       // the tray the drawer adds to
  var dtab = "board";

  /* ---------------- state ---------------- */

  function fresh() {
    var d = JSON.parse(JSON.stringify(window.APPROACH_SCENES));
    d.scenes.forEach(function (s) {
      s.refs = s.refs || [];
      s.shots.forEach(function (sh, i) { sh.id = s.id + "-" + (i + 1); });
    });
    d.uploads = {};
    return d;
  }
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s || !Array.isArray(s.scenes)) s = fresh();
    s.uploads = s.uploads || {};
    Object.keys(s.uploads).forEach(function (id) {
      var u = s.uploads[id];
      admit({ id: id, src: u.src || "", w: u.w, h: u.h, type: u.type, name: u.name });
    });
    return s;
  }
  var saving = 0;
  function save() {
    if (VIEW) return;
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    if (DISK) toDisk();
  }
  /* ---------------- disk: approach-save.json through serve.py ---------------- */
  var diskT = 0, diskBusy = false, diskAgain = false;
  function status(msg, bad) {
    var e = document.getElementById("diskState");
    e.textContent = msg;
    e.style.color = bad ? "#e8a39b" : "";
  }
  function toDisk() {
    clearTimeout(diskT);
    status("Saving…");
    diskT = setTimeout(push, 400);
  }
  function push() {
    if (diskBusy) { diskAgain = true; return; }
    diskBusy = true;
    fetch("api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st) })
      .then(function (r) { if (!r.ok) throw 0; status("Saved to disk"); }, function () { throw 0; })
      .catch(function () { status("Not saved to disk — is the board server running?", true); })
      .then(function () { diskBusy = false; if (diskAgain) { diskAgain = false; push(); } });
  }
  window.addEventListener("pagehide", function () {
    if (DISK && diskT) navigator.sendBeacon("api/state", new Blob([JSON.stringify(st)], { type: "application/json" }));
  });
  function saveSoon() { clearTimeout(saving); saving = setTimeout(save, 250); }

  function snapshot() {
    history.push(JSON.stringify(st));
    if (history.length > 80) history.shift();
    document.getElementById("undo").disabled = false;
  }
  function undo() {
    if (!history.length) return;
    st = JSON.parse(history.pop());
    document.getElementById("undo").disabled = !history.length;
    save(); render(); hideToast();
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function scene(id) { return st.scenes.filter(function (s) { return s.id === id; })[0]; }
  function arr(key) {
    var p = key.split("/"), s = scene(p[0]);
    if (!s) return null;
    if (p[1] === "refs") return s.refs;
    var sh = s.shots.filter(function (x) { return x.id === p[1]; })[0];
    return sh ? sh.imgs : null;
  }
  function where(key) {
    var p = key.split("/"), s = scene(p[0]);
    if (!s) return "";
    if (p[1] === "refs") return "S" + s.num + " · More references";
    var i = s.shots.findIndex(function (x) { return x.id === p[1]; });
    return "S" + s.num + " · Suggested shot " + (i + 1) + (s.shots[i] && s.shots[i].title ? " — " + s.shots[i].title : "");
  }
  var START = fresh();
  function original(shotId) {
    var o = [];
    START.scenes.forEach(function (s) { s.shots.forEach(function (sh) { if (sh.id === shotId) o = sh.imgs; }); });
    return o;
  }
  // a shot's starting images that are no longer in it
  function missing(sh) {
    return original(sh.id).filter(function (id) { return sh.imgs.indexOf(id) < 0 && ALL[id]; });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function used() {
    var u = {};
    st.scenes.forEach(function (s) {
      s.refs.forEach(function (id) { u[id] = 1; });
      s.shots.forEach(function (sh) { sh.imgs.forEach(function (id) { u[id] = 1; }); });
    });
    return u;
  }

  /* ---------------- uploads: IndexedDB ---------------- */

  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { res(req && req.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function putBlob(id, blob) { return idb("readwrite", function (s) { return s.put(blob, id); }); }
  function getBlob(id) { return idb("readonly", function (s) { return s.get(id); }); }

  function wakeUploads() {
    var ids = Object.keys(st.uploads).filter(function (id) { return ALL[id] && !ALL[id].src && !st.uploads[id].src; });
    if (!ids.length) return;
    Promise.all(ids.map(function (id) {
      return getBlob(id).then(function (b) { if (b) ALL[id].src = URL.createObjectURL(b); }, function () {});
    })).then(function () { Object.keys(trays).forEach(function (k) { fillTray(k); }); });
  }

  function measure(file) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(file), video = /^video\//.test(file.type);
      var m = document.createElement(video ? "video" : "img");
      m[video ? "onloadedmetadata" : "onload"] = function () {
        res({ url: url, w: video ? m.videoWidth : m.naturalWidth, h: video ? m.videoHeight : m.naturalHeight, type: video ? "video" : "image" });
      };
      m.onerror = function () { URL.revokeObjectURL(url); res(null); };
      if (video) m.preload = "metadata";
      m.src = url;
    });
  }
  function upload(files, key, at) {
    if (VIEW) return;
    var list = [].filter.call(files, function (f) { return /^(image|video)\//.test(f.type) || /\.(jpe?g|png|gif|webp|avif|mp4|mov|m4v)$/i.test(f.name); });
    if (!list.length) return;
    Promise.all(list.map(measure)).then(function (ms) {
      var ids = [], bad = 0;
      snapshot();
      ms.forEach(function (m, k) {
        if (!m || !m.w) { bad++; return; }
        var id = "u-" + uid(), f = list[k];
        st.uploads[id] = { w: m.w, h: m.h, type: m.type, name: f.name };
        admit({ id: id, src: m.url, w: m.w, h: m.h, type: m.type, name: f.name });
        if (DISK) {
          // the file itself goes into uploads/; the board points at it from then on
          fetch("api/upload?id=" + id + "&name=" + encodeURIComponent(f.name), { method: "POST", body: f })
            .then(function (r) { return r.json(); })
            .then(function (j) { st.uploads[id].src = j.src; save(); })
            .catch(function () { status("Couldn't save " + f.name + " to disk", true); });
        } else {
          putBlob(id, f).catch(function () { toast("Couldn't store " + f.name + " — it will go on reload", false); });
        }
        ids.push(id);
      });
      var a = arr(key);
      if (a && ids.length) {
        a.splice.apply(a, [Math.min(at, a.length), 0].concat(ids));
        save(); fillTray(key, ids);
      }
      if (bad) toast(bad + (bad > 1 ? " files" : " file") + " couldn't be read here (try JPG or PNG)", false);
      if (drawerOpen()) drawThumbs();
    });
  }

  /* ---------------- the page ---------------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // text that is typed where it sits; single-line fields finish on return
  var typing = false;
  function field(tag, cls, get, set, ph, single) {
    var e = el(tag, cls);
    e.textContent = get() || "";
    if (VIEW) return e;
    e.contentEditable = CE;
    e.setAttribute("data-ph", ph);
    e.spellcheck = !single;
    e.addEventListener("focus", function () { typing = false; });
    e.addEventListener("input", function () {
      if (!typing) { snapshot(); typing = true; }
      set(e.innerText.replace(/\n+$/, ""));
      saveSoon();
    });
    e.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" || (single && ev.key === "Enter")) { ev.preventDefault(); e.blur(); }
    });
    e.addEventListener("blur", function () { if (!e.textContent.trim()) e.textContent = ""; });
    if (CE !== "plaintext-only") e.addEventListener("paste", function (ev) {
      ev.preventDefault();
      document.execCommand("insertText", false, (ev.clipboardData || window.clipboardData).getData("text/plain"));
    });
    return e;
  }

  function render() {
    var y = window.scrollY;
    trays = {};
    page.innerHTML = "";
    var t = document.getElementById("title"), it = document.getElementById("intro");
    t.replaceWith(field("h1", "", function () { return st.title; }, function (v) { st.title = v; }, "Title", true));
    document.querySelector(".intro h1").id = "title";
    it.replaceWith(field("p", "", function () { return st.intro; }, function (v) { st.intro = v; }, "A line on the approach"));
    document.querySelector(".intro p").id = "intro";

    st.scenes.forEach(function (s) { page.appendChild(sceneEl(s)); });
    var more = el("button", "addshot label", "+ Add scene");
    more.style.marginTop = "40px";
    more.onclick = function () {
      snapshot();
      var id = "s" + uid();
      st.scenes.push({ id: id, num: "", kind: "Flash fantasy", title: "", note: "", set: "", setNote: "", shots: [{ id: id + "-1", title: "", text: "", imgs: [] }], refs: [] });
      save(); render();
      var n = document.querySelector("#" + id + " .snum");
      n.scrollIntoView({ block: "center" }); n.focus();
    };
    page.appendChild(more);
    jumps();
    Object.keys(trays).forEach(function (k) { fillTray(k); });
    window.scrollTo(0, y);
    if (drawerOpen()) drawThumbs();
  }

  function sceneEl(s) {
    var sec = el("section", "scene");
    sec.id = s.id;

    var head = el("div", "grid scene-head");
    var l = el("div");
    var kind = field("div", "label", function () { return s.kind; }, function (v) { s.kind = v; }, "Kind", true);
    l.appendChild(kind);
    l.appendChild(field("span", "snum", function () { return s.num; }, function (v) { s.num = v; jumps(); }, "00", true));
    l.appendChild(field("h2", "stitle", function () { return s.title; }, function (v) { s.title = v; jumps(); }, "Scene title", true));
    var r = el("div", "note-wrap");
    r.appendChild(field("p", "note", function () { return s.note; }, function (v) { s.note = v; }, "Why this moment changes"));
    head.appendChild(l); head.appendChild(r);
    sec.appendChild(head);

    var set = el("div", "grid setline");
    var sl = el("div");
    sl.appendChild(field("span", "label setlabel", function () { return s.setLabel == null ? "Suggested flash fantasy" : s.setLabel; }, function (v) { s.setLabel = v; }, "Label", true));
    sl.appendChild(field("span", "label set", function () { return s.set; }, function (v) { s.set = v; }, "Theme", true));
    var sr = el("div");
    sr.appendChild(field("span", "label setnote", function () { return s.setNote; }, function (v) { s.setNote = v; }, "How to read the references"));
    set.appendChild(sl); set.appendChild(sr);
    sec.appendChild(set);

    s.shots.forEach(function (sh, i) { sec.appendChild(shotEl(s, sh, i)); });

    var addrow = el("div", "grid addrow");
    var add = el("button", "label", "+ Add suggested shot");
    add.onclick = function () {
      snapshot();
      var sh = { id: s.id + "-" + uid(), title: "", text: "", imgs: [] };
      s.shots.push(sh);
      save(); render();
      var h = document.querySelector('[data-shot="' + sh.id + '"] h3');
      h.scrollIntoView({ block: "center" }); h.focus();
    };
    addrow.appendChild(add);
    sec.appendChild(addrow);

    // the scene's selects not yet put against a shot: a place to park pictures
    var refs = el("div", "grid shot refs");
    var rl = el("div", "shot-text");
    var ri = el("div", "idx");
    ri.appendChild(el("span", "label", "Unplaced"));
    rl.appendChild(ri);
    rl.appendChild(el("h3", "", "More references"));
    rl.appendChild(el("p", "", "From this scene’s selects, or parked here. Drag onto any shot above."));
    rl.appendChild(adders(s.id + "/refs"));
    refs.appendChild(rl);
    refs.appendChild(trayEl(s.id + "/refs"));
    if (!s.refs.length) refs.classList.add("none");
    sec.appendChild(refs);
    return sec;
  }

  function shotEl(s, sh, i) {
    var row = el("div", "grid shot");
    row.setAttribute("data-shot", sh.id);
    var l = el("div", "shot-text");
    var idx = el("div", "idx label");
    var num = el("span", "", "Suggested shot " + (i + 1));
    if (sh.pick) num.appendChild(el("span", "pick", "Recommended"));
    idx.appendChild(num);
    if (sh.pick) row.classList.add("picked");
    var tools = el("span");
    tools.style.cssText = "display:flex;gap:14px";
    // the shot being put forward: marked, so it reads first among the options
    var pk = el("button", "label", sh.pick ? "Unmark" : "Recommend");
    pk.title = sh.pick ? "Stop marking this as the recommended shot" : "Mark this as the recommended shot";
    pk.onclick = function () {
      snapshot();
      sh.pick = !sh.pick;
      save(); render();
    };
    tools.appendChild(pk);
    var rs = el("button", "label restore", "Restore");
    rs.onclick = function () {
      var gone = missing(sh);
      if (!gone.length) return;
      snapshot();
      gone.forEach(function (id) { sh.imgs.push(id); });
      save(); fillTray(s.id + "/" + sh.id, gone);
      toast(gone.length + (gone.length > 1 ? " images restored" : " image restored"), true);
    };
    tools.appendChild(rs);
    function mover(label, d, title) {
      var b = el("button", "label", label);
      b.title = title;
      b.disabled = i + d < 0 || i + d >= s.shots.length;
      if (b.disabled) b.style.display = "none";
      b.onclick = function () {
        snapshot();
        s.shots.splice(i + d, 0, s.shots.splice(i, 1)[0]);
        save(); render();
      };
      return b;
    }
    tools.appendChild(mover("↑", -1, "Move shot up"));
    tools.appendChild(mover("↓", 1, "Move shot down"));
    var rm = el("button", "label", "Remove");
    rm.onclick = function () {
      snapshot();
      s.shots.splice(i, 1);
      save(); render();
      toast("Shot removed", true);
    };
    tools.appendChild(rm);

    l.appendChild(idx);
    l.appendChild(field("h3", "", function () { return sh.title; }, function (v) { sh.title = v; }, "Shot title", true));
    l.appendChild(field("p", "", function () { return sh.text; }, function (v) { sh.text = v; }, "What we see"));
    var ad = adders(s.id + "/" + sh.id);
    tools.style.cssText = "display:flex;gap:16px";
    ad.appendChild(tools);
    l.appendChild(ad);
    row.appendChild(l);
    row.appendChild(trayEl(s.id + "/" + sh.id));
    return row;
  }

  function adders(key) {
    var a = el("div", "add label");
    var b = el("button", "", "+ From board");
    b.onclick = function () { openDrawer(key); };
    var f = el("button", "", "+ Upload");
    f.onclick = function () { pick(key); };
    a.appendChild(b); a.appendChild(f);
    return a;
  }
  var picking = null;
  function pick(key) { picking = key; document.getElementById("fileIn").click(); }
  document.getElementById("fileIn").addEventListener("change", function (e) {
    if (picking && e.target.files.length) upload(e.target.files, picking, Infinity);
    e.target.value = "";
  });

  function trayEl(key) {
    var t = el("div", "tray");
    t.setAttribute("data-tray", key);
    trays[key] = t;
    return t;
  }

  function fillTray(key, landed) {
    var t = trays[key], ids = arr(key);
    if (!t || !ids) return;
    // Restore shows only while some of the shot's starting images are gone
    var p = key.split("/"), sc = scene(p[0]);
    var sh = sc && sc.shots.filter(function (x) { return x.id === p[1]; })[0];
    var rb = sh && document.querySelector('[data-shot="' + sh.id + '"] .restore');
    if (rb) {
      var n = missing(sh).length;
      rb.style.display = n ? "" : "none";
      rb.title = "Put back " + n + (n > 1 ? " original images" : " original image");
    }
    t.innerHTML = "";
    t.classList.toggle("empty", !ids.length);
    if (!ids.length) {
      var h = el("div", "hint label");
      h.appendChild(document.createTextNode("Drop images here"));
      h.appendChild(el("br"));
      var b = el("button", "", "From the board");
      b.onclick = function () { openDrawer(key); };
      var f = el("button", "", "Upload");
      f.onclick = function () { pick(key); };
      h.appendChild(b); h.appendChild(document.createTextNode("  ·  ")); h.appendChild(f);
      t.appendChild(h);
      return;
    }
    ids.forEach(function (id, i) {
      var it = ALL[id];
      if (!it) return;
      var tile = el("div", "tile");
      tile.draggable = !VIEW;
      tile.setAttribute("data-i", i);
      tile.style.aspectRatio = String(it.ar);
      if (it.src) tile.appendChild(media(it, true));
      var tools = el("div", "tools");
      var rm = el("button", "act", "Remove");
      rm.onclick = function (e) {
        e.stopPropagation();
        snapshot();
        arr(key).splice(i, 1);
        save(); fillTray(key);
        toast("Image removed", true);
        if (drawerOpen()) drawThumbs();
      };
      tools.appendChild(rm);
      tile.appendChild(tools);
      tile.addEventListener("click", function () { view(key, i); });
      tile.addEventListener("dragstart", function (e) {
        drag = { id: id, from: key, i: i };
        e.dataTransfer.effectAllowed = "copyMove";
        try { e.dataTransfer.setData("text/plain", id); } catch (x) {}
        requestAnimationFrame(function () { tile.classList.add("dragging"); });
      });
      tile.addEventListener("dragend", endDrag);
      if (landed && landed.indexOf(id) >= 0) tile.classList.add("landed");
      t.appendChild(tile);
    });
    layout(t);
  }

  function media(it, lazy) {
    var m;
    if (it.type === "video") {
      m = document.createElement("video");
      m.muted = true; m.loop = true; m.playsInline = true; m.autoplay = true;
      m.setAttribute("muted", ""); m.setAttribute("playsinline", "");
      m.preload = "metadata";
      m.addEventListener("loadeddata", function () { m.classList.add("in"); });
    } else {
      m = document.createElement("img");
      m.alt = "";
      m.decoding = "async";
      if (lazy) m.loading = "lazy";
      m.addEventListener("load", function () { m.classList.add("in"); });
    }
    m.src = it.src;
    return m;
  }

  /* Justified rows, balanced. If the pictures don't fill the tray's width at
     the target height they sit on one row at that height, flush left.
     Otherwise they are broken into rows so that every row, scaled to fill the
     width exactly, lands as near the target height as it can (the break points
     found by dynamic programming over the aspect ratios) — so no picture is
     left stranded on a last row, and none is blown up across a row alone. */
  function gapPx() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 8; }
  function breaks(ars, W, g, target) {
    var n = ars.length, cost = [0], from = [0];
    for (var i = 1; i <= n; i++) {
      cost[i] = Infinity;
      for (var x = i - 1, sum = 0; x >= 0; x--) {
        sum += ars[x];
        var h = (W - g * (i - x - 1)) / sum, d = (h - target) / target;
        if (h < target * 0.45) break;                       // too many on one row
        var c = cost[x] + d * d * (h > target ? 2.5 : 1);   // too tall reads worse than too short
        if (c < cost[i]) { cost[i] = c; from[i] = x; }
      }
    }
    var rows = [];
    for (var end = n; end > 0; end = from[end]) rows.unshift([from[end], end]);
    return rows;
  }
  function layout(t) {
    var tiles = [].slice.call(t.querySelectorAll(".tile"));
    if (!tiles.length) return;
    var W = t.clientWidth, g = gapPx();
    var target = Math.max(100, Math.min(170, W * 0.17));
    var ars = tiles.map(function (tile) { return parseFloat(tile.style.aspectRatio) || 1; });
    var total = ars.reduce(function (a, b) { return a + b; }, 0);
    var rows = total * target + g * (tiles.length - 1) <= W ? [[0, tiles.length]] : breaks(ars, W, g, target);
    rows.forEach(function (r) {
      var n = r[1] - r[0], sum = 0;
      for (var i = r[0]; i < r[1]; i++) sum += ars[i];
      var avail = W - g * (n - 1), h = Math.min(avail / sum, rows.length === 1 ? target : Infinity);
      var full = h * sum >= avail - 1, used = 0;
      for (i = r[0]; i < r[1]; i++) {
        var w = full && i === r[1] - 1 ? avail - used : Math.floor(h * ars[i]);
        used += w;
        tiles[i].style.width = w + "px";
        tiles[i].style.height = Math.round(h) + "px";
      }
    });
  }
  var raf = 0;
  new ResizeObserver(function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () { Object.keys(trays).forEach(function (k) { layout(trays[k]); }); });
  }).observe(page);

  /* ---------------- moving pictures ---------------- */

  var caret = document.getElementById("caret"), overTray = null;
  function dropAt(t, x, y) {
    var tiles = [].slice.call(t.querySelectorAll(".tile"));
    if (!tiles.length) return { i: 0 };
    var g = gapPx(), rects = tiles.map(function (e) { return e.getBoundingClientRect(); });
    var top = null, bd = Infinity;
    rects.forEach(function (r) {
      var d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (d < bd - 0.5) { bd = d; top = r.top; }
    });
    var row = [];
    rects.forEach(function (r, k) { if (Math.abs(r.top - top) < 2) row.push(k); });
    for (var n = 0; n < row.length; n++) {
      var r = rects[row[n]];
      if (x < r.left + r.width / 2) return { i: row[n], x: r.left - g / 2 - 1, top: r.top, h: r.height };
    }
    var k = row[row.length - 1], q = rects[k];
    return { i: k + 1, x: q.right + g / 2 - 1, top: q.top, h: q.height };
  }
  function hasFiles(e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
  function setOver(t) {
    if (overTray === t) return;
    if (overTray) overTray.classList.remove("over");
    overTray = t;
    if (t) t.classList.add("over");
  }
  function endDrag() {
    drag = null;
    caret.style.display = "none";
    setOver(null);
    document.querySelectorAll(".dragging").forEach(function (e) { e.classList.remove("dragging"); });
  }
  document.addEventListener("dragover", function (e) {
    var files = hasFiles(e);
    if (!drag && !files) return;
    e.preventDefault();   // also keeps a stray file from opening in the tab
    var t = e.target.closest && e.target.closest(".tray");
    if (!t) { caret.style.display = "none"; setOver(null); e.dataTransfer.dropEffect = "none"; return; }
    e.dataTransfer.dropEffect = drag && drag.from ? "move" : "copy";
    setOver(t);
    var at = dropAt(t, e.clientX, e.clientY);
    if (at.x == null) { caret.style.display = "none"; return; }
    caret.style.display = "block";
    caret.style.left = at.x + "px";
    caret.style.top = at.top + "px";
    caret.style.height = at.h + "px";
  });
  document.addEventListener("dragleave", function (e) {
    if (!e.relatedTarget) { caret.style.display = "none"; setOver(null); }
  });
  document.addEventListener("drop", function (e) {
    var t = e.target.closest && e.target.closest(".tray");
    if (!drag && !hasFiles(e)) return;
    e.preventDefault();
    if (!t) { endDrag(); return; }
    var key = t.getAttribute("data-tray"), at = dropAt(t, e.clientX, e.clientY).i;
    if (drag) place(drag, key, at);
    else upload(e.dataTransfer.files, key, at);
    endDrag();
  });

  function place(d, key, at) {
    var to = arr(key);
    if (!to) return;
    snapshot();
    if (d.from) {
      var from = arr(d.from);
      from.splice(d.i, 1);
      if (d.from === key && d.i < at) at--;
    }
    to.splice(Math.min(at, to.length), 0, d.id);
    save();
    if (d.from && d.from !== key) fillTray(d.from);
    fillTray(key, [d.id]);
    if (drawerOpen()) markUsed();
  }

  /* ---------------- scene jumps ---------------- */

  function jumps() {
    var g = document.getElementById("jumps");
    g.innerHTML = "";
    st.scenes.forEach(function (s) {
      var b = el("button", "jump", "S" + (s.num || "—"));
      b.setAttribute("data-to", s.id);
      if (s.title) b.appendChild(el("span", "n", s.title));
      b.onclick = function () {
        var sec = document.getElementById(s.id);
        window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - 40 });
      };
      g.appendChild(b);
    });
    spot();
  }
  function spot() {
    var cur = null, line = document.getElementById("controls").getBoundingClientRect().bottom + 120;
    document.querySelectorAll(".scene").forEach(function (s) { if (s.getBoundingClientRect().top < line) cur = s.id; });
    document.querySelectorAll(".jump").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-to") === cur); });
  }
  window.addEventListener("scroll", spot, { passive: true });

  /* ---------------- drawer ---------------- */

  var drawer = document.getElementById("drawer");
  function drawerOpen() { return drawer.classList.contains("on"); }
  function openDrawer(key) {
    target = key || null;
    drawer.classList.add("on");
    var tg = document.getElementById("dtarget");
    tg.innerHTML = "";
    if (target) {
      tg.appendChild(el("span", "label", "Adding to"));
      tg.appendChild(document.createTextNode(where(target)));
    }
    document.getElementById("dfoot").textContent = target ? "Click to add · or drag onto any shot" : "Drag onto any shot";
    drawThumbs();
  }
  function closeDrawer() { drawer.classList.remove("on"); target = null; }

  function boardOrder() {
    var b = null;
    try { b = JSON.parse(localStorage.getItem(BOARD_KEY)); } catch (e) {}
    var ids = b && Array.isArray(b.order) ? b.order.filter(function (id) { return ALL[id]; }) : [];
    var seen = {};
    ids.forEach(function (id) { seen[id] = 1; });
    (window.GARBO_ITEMS || []).forEach(function (it) {
      if (!seen[it.id] && !(b && b.archived && b.archived.indexOf(it.id) >= 0)) ids.push(it.id);
    });
    return ids;
  }
  function groups() {
    var F = window.APPROACH_FOLDERS || {}, pulls = [];
    st.scenes.forEach(function (s) {
      var f = F[s.id];
      if (!f) return;
      pulls.push({ label: "S" + s.num + " · " + s.title, ids: f.select.concat(f.pull) });
    });
    var ups = Object.keys(st.uploads).filter(function (id) { return ALL[id]; }).reverse();
    var g = [
      { key: "board", name: "Creative board", sets: [{ ids: boardOrder() }] },
      { key: "pulls", name: "Scene pulls", sets: pulls }
    ];
    if (ups.length) g.push({ key: "uploads", name: "Uploads", sets: [{ ids: ups }] });
    return g;
  }
  function drawThumbs() {
    var gs = groups(), tabs = document.getElementById("dtabs"), body = document.getElementById("dbody");
    if (!gs.some(function (g) { return g.key === dtab; })) dtab = "board";
    tabs.innerHTML = "";
    gs.forEach(function (g) {
      var n = 0;
      g.sets.forEach(function (s) { n += s.ids.length; });
      var b = el("button", g.key === dtab ? "on" : "", g.name);
      var c = el("span", "", " " + n);
      c.style.cssText = "color:var(--faint);letter-spacing:.1em";
      b.appendChild(c);
      b.onclick = function () { dtab = g.key; body.scrollTop = 0; drawThumbs(); };
      tabs.appendChild(b);
    });
    var top = body.scrollTop;
    body.innerHTML = "";
    var u = used();
    gs.filter(function (g) { return g.key === dtab; })[0].sets.forEach(function (s) {
      if (s.label) body.appendChild(el("h4", "label", s.label));
      var grid = el("div", "thumbs");
      s.ids.forEach(function (id) {
        var it = ALL[id];
        if (!it || !it.src) return;
        var th = el("div", "thumb" + (u[id] ? " used" : ""));
        th.setAttribute("data-id", id);
        th.title = it.name || id;
        th.draggable = true;
        var m = it.type === "video" ? document.createElement("video") : document.createElement("img");
        if (it.type === "video") { m.muted = true; m.preload = "metadata"; m.src = it.src + (/^blob:/.test(it.src) ? "" : "#t=0.6"); }
        else { m.loading = "lazy"; m.decoding = "async"; m.alt = ""; m.src = it.src; }
        th.appendChild(m);
        th.addEventListener("dragstart", function (e) {
          drag = { id: id, from: null };
          e.dataTransfer.effectAllowed = "copy";
          try { e.dataTransfer.setData("text/plain", id); } catch (x) {}
        });
        th.addEventListener("dragend", endDrag);
        th.addEventListener("click", function () {
          if (!target) { toast("Drag it onto a shot — or use “+ From board” on one", false); return; }
          place({ id: id, from: null }, target, Infinity);
          th.classList.remove("added"); void th.offsetWidth; th.classList.add("added");
        });
        grid.appendChild(th);
      });
      body.appendChild(grid);
    });
    body.scrollTop = top;
  }
  function markUsed() {
    var u = used();
    document.querySelectorAll(".thumb").forEach(function (t) { t.classList.toggle("used", !!u[t.getAttribute("data-id")]); });
  }
  document.getElementById("openDrawer").onclick = function () { drawerOpen() && !target ? closeDrawer() : openDrawer(null); };
  document.getElementById("closeDrawer").onclick = closeDrawer;

  /* ---------------- viewer ---------------- */

  var lb = document.getElementById("lb"), lbImg = lb.querySelector("img"), lbVid = lb.querySelector("video");
  var lbKey = null, lbI = 0;
  function view(key, i) {
    var ids = arr(key);
    if (!ids || !ids.length) return;
    lbKey = key; lbI = (i + ids.length) % ids.length;
    var it = ALL[ids[lbI]];
    if (it.type === "video") { lbImg.hidden = true; lbVid.hidden = false; lbVid.src = it.src; lbVid.play().catch(function () {}); }
    else { lbVid.hidden = true; lbVid.pause(); lbImg.hidden = false; lbImg.src = it.src; }
    document.getElementById("lbc").textContent = where(key);
    document.getElementById("lbn").textContent = (lbI + 1) + " / " + ids.length;
    document.getElementById("lbf").textContent = it.name || "";
    lb.classList.add("on");
  }
  function unview() { lb.classList.remove("on"); lbVid.pause(); lbVid.removeAttribute("src"); lbKey = null; }
  lb.querySelector(".x").onclick = unview;
  lb.querySelector(".nav.p").onclick = function () { view(lbKey, lbI - 1); };
  lb.querySelector(".nav.n").onclick = function () { view(lbKey, lbI + 1); };
  lb.addEventListener("click", function (e) { if (e.target === lb) unview(); });

  /* ---------------- toast ---------------- */

  var toastT = 0;
  function toast(msg, canUndo) {
    document.getElementById("toastMsg").textContent = msg;
    document.getElementById("toastUndo").style.display = canUndo ? "" : "none";
    document.getElementById("toast").classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(hideToast, 5000);
  }
  function hideToast() { document.getElementById("toast").classList.remove("on"); }
  document.getElementById("toastUndo").onclick = undo;
  document.getElementById("undo").onclick = undo;

  /* ---------------- keys ---------------- */

  document.addEventListener("keydown", function (e) {
    if (VIEW && !lb.classList.contains("on")) return;
    var inText = e.target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (lb.classList.contains("on")) {
      if (e.key === "Escape") unview();
      else if (e.key === "ArrowLeft") view(lbKey, lbI - 1);
      else if (e.key === "ArrowRight") view(lbKey, lbI + 1);
      return;
    }
    if (inText) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.key === "Escape" && drawerOpen()) closeDrawer();
  });

  /* ---------------- save, load, reset, print ---------------- */

  function dataURL(blob) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { res(null); };
      r.readAsDataURL(blob);
    });
  }
  document.getElementById("exportBtn").onclick = function () {
    var ids = Object.keys(st.uploads), files = {};
    Promise.all(ids.map(function (id) {
      return getBlob(id).then(function (b) { return b ? dataURL(b) : null; }, function () { return null; })
        .then(function (d) { if (d) files[id] = d; });
    })).then(function () {
      var blob = new Blob([JSON.stringify({ garboApproach: 1, doc: st, files: files })], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "garbo-approach-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast("Saved — keep the file to load it anywhere", false);
    });
  };
  document.getElementById("importIn").addEventListener("change", function (e) {
    var f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    f.text().then(function (txt) {
      var d = JSON.parse(txt);
      if (!d || !d.doc || !Array.isArray(d.doc.scenes)) throw new Error("not an approach file");
      var files = d.files || {};
      return Promise.all(Object.keys(files).map(function (id) {
        return fetch(files[id]).then(function (r) { return r.blob(); }).then(function (b) {
          ALL[id] = null;
          return putBlob(id, b).then(function () {
            var u = d.doc.uploads[id] || {};
            admit({ id: id, src: URL.createObjectURL(b), w: u.w, h: u.h, type: u.type, name: u.name });
          });
        });
      })).then(function () {
        snapshot();
        st = d.doc;
        st.uploads = st.uploads || {};
        Object.keys(st.uploads).forEach(function (id) {
          if (!ALL[id]) { var u = st.uploads[id]; admit({ id: id, src: "", w: u.w, h: u.h, type: u.type, name: u.name }); }
        });
        save(); render(); wakeUploads();
        toast("Loaded " + f.name, true);
      });
    }).catch(function () { toast("That file isn't an approach save", false); });
  });
  document.getElementById("reset").onclick = function () {
    snapshot();
    var ups = st.uploads;
    st = fresh();
    st.uploads = ups;   // uploads stay in the drawer
    save(); render();
    toast("Back to the original text and images", true);
  };
  document.getElementById("pdf").onclick = function () { window.print(); };

  function boot() {
    render();
    wakeUploads();
    status(DISK ? "Saved to disk" : "Saved in this browser only");
    // a link straight to a scene (approach.html#s71) lands on it once it exists
  var hash = location.hash.slice(1);
  if (hash && document.getElementById(hash)) {
    var sec = document.getElementById(hash);
    window.scrollTo(0, sec.getBoundingClientRect().top + window.scrollY - 40);
  }
  }
  // the file on disk is the record: it wins over whatever the browser kept;
  // the public copy reads the snapshot published beside it
  if (DISK || VIEW) {
    // never a cached copy: the public site must show the latest save
    fetch(VIEW ? "approach-save.json?t=" + Date.now() : "api/state", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && Array.isArray(d.scenes)) {
        st = d;
        st.uploads = st.uploads || {};
        Object.keys(st.uploads).forEach(function (id) {
          var u = st.uploads[id];
          admit({ id: id, src: u.src || "", w: u.w, h: u.h, type: u.type, name: u.name });
        });
        if (!VIEW) try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
      } else save();
    }, function () {}).then(boot);
  } else boot();
})();
