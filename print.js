/* CARA WIP — print.js  ·  window.Print
   ---------------------------------------------------------------------------
   Prints the current board through the browser's own print pipeline: the plates
   go down at full resolution, the type stays vector, and no canvas or PDF
   library is involved. A3 landscape, @page margin 0, so it comes off the same
   press as the live site (common-hours-1990s), whose sheets build.py computes at
   build time.

   Why this file exists at all: the live site's order is fixed, so its two print
   sheets can be packed once in Python. Here plates are dragged, added and
   removed, so the same fit has to happen on demand, in the browser, against
   whatever order is on screen at the moment the button is hit.

     Print.sheets(items)      -> [[item,...], ...]   the page grouping
     Print.run(items, label)  -> builds the hidden sheets, waits for the images,
                                 calls window.print(), cleans up afterwards
     Print.plan(items)        -> the full geometry (widths, row heights, gaps);
                                 exposed so the fit can be asserted in a harness
     Print.LIMITS             -> the constants below, for the same reason

   items are the contract's shape, in display order: {id, src, w, h}. src is
   reused verbatim — plates/*.jpg or the blob: URL of an upload — so the print
   sheets cost no extra bytes: the browser has those bitmaps already.

   ---------------------------------------------------------------------------
   The fit, in one paragraph.

   A justified row of frames sharing a block of width W has one height for all
   of them: h = (W - gaps) / sum(aspect). So a sheet's total height is fixed the
   moment the rows' contents are fixed, and the only way to land it exactly on
   the page is to choose the block width. Feeding a target *height* to a packer
   cannot do it — the total is a step function of the target, flat between jumps
   of ~90mm on a 270mm sheet, because rows gain and lose whole plates. The width
   is the parameter the total varies smoothly and monotonically with, so that is
   the one to search; the slack left over at the sides is invisible on a black
   ground. (This is build.py's argument, and its dynamic-programming partition,
   ported. What is new here is choosing the sheet count, capping the row height,
   and centring a sheet that cannot be filled.)
   --------------------------------------------------------------------------- */
(function (global) {
  "use strict";

  /* ---------------- the page, in millimetres ---------------- */

  var PAGE_W = 420.0, PAGE_H = 297.0;   // A3 landscape
  var MARGIN = 10.0;                    // top and bottom; the sides fall out of the fit
  var GAP = 4.0;                        // column gap, and the smallest row gap
  var MAX_GAP = 2 * GAP;                // a row gap may stretch this far to swallow slack
  var LABEL_H = 7.0;                    // budgeted out of every sheet for the heading line
  var MAX_W = PAGE_W - 2 * MARGIN;      // 400mm — the widest block the page allows
  var MIN_W = 12.0;                     // floor for the width search
  var AVAIL = PAGE_H - 2 * MARGIN - LABEL_H;   // 270mm — what the rows have to hit

  // A justified row's height is set by how much aspect ratio it has to share out, so a
  // sheet of two or three portrait plates would otherwise run the full 270mm: frames
  // taller than a person's hand, and a grid of three that reads as a poster. Rows that
  // overshoot this are narrowed instead (the block gets thinner, nothing is cropped) and
  // the short block is then centred vertically rather than stretched.
  var MAX_ROW_H = 168.0;                // ~62% of the sheet

  // One sheet or two. 64 plates on a single A3 come out at rows ~35mm tall — the live
  // site's build.py calls that absurd and splits the board in two, where its rows land
  // at ~51mm. So take its own figure as the floor: pack for one sheet, and if the frames
  // that gives are shorter than this, pack for two instead. It is a measurement, not an
  // item count, so a page of wide landscape plates (which pack more per row) tips over
  // at a different count than a page of portraits, exactly as it should.
  var MIN_ROW_H = 50.0;

  var MAX_PER_ROW = 12;                 // more than this and a row is a filmstrip
  var MAX_ROWS = 10;                    // per sheet
  var STEPS = 22;                       // bisections of the width search
  var WAIT_MS = 8000;                   // longest wait for the print images

  var HOST_ID = "carawip-print";
  var CSS_ID = "carawip-print-css";

  /* ---------------- items ---------------- */

  // Uploads are measured by store.js, so w/h are always there in practice; a missing or
  // absurd pair is clamped rather than allowed to divide by zero. The rendered frame is
  // pinned to this same ratio (see .cfig aspect-ratio below), so the fit holds even when
  // the number is a guess.
  function aspect(it) {
    var w = it && +it.w, h = it && +it.h;
    if (!(w > 0) || !(h > 0)) return 1;
    return Math.min(8, Math.max(0.15, w / h));
  }

  // prefix sums of aspect ratio: a row's sum(aspect) is one subtraction
  function sums(list) {
    var s = [0], i;
    for (i = 0; i < list.length; i++) s.push(s[i] + aspect(list[i]));
    return s;
  }

  function rowH(S, i, j, w) {
    return (w - GAP * (j - i - 1)) / (S[j] - S[i]);
  }

  // Rows of one or two plates are ruinous on a full sheet (a pair of portraits justified
  // to 400mm is 270mm tall), so bigger boards are held to three a row. Small boards have
  // no choice: three plates cannot make two rows of three.
  function minPerRow(m) { return m <= 12 ? 1 : (m <= 24 ? 2 : 3); }
  function maxPerRow(m) { return Math.max(MAX_PER_ROW, Math.ceil(m / MAX_ROWS)); }

  /* ---------------- the partition ---------------- */

  /* Cut `list` into exactly `count` contiguous rows, as close to equal height as the
     order allows. The screen packer in grid.js is no good here: it fills greedily and
     then borrows from the row above, which can strip that row down to two plates — on
     screen such a row is simply narrowed, but a print sheet has to stay full width, so
     the row lengths have to be chosen for the sheet as a whole. This is the standard
     justified-layout dynamic program, scored against the height that would make every
     row equal. Returns [[i,j], ...] index pairs, or null if `count` rows cannot hold
     this many plates.

     That target is worth deriving rather than guessing at. If all `count` rows came out
     the same height h then each row's sum(aspect) is (w - its column gaps) / h, and
     those sums add up to the whole board's, so

         h = (count * w - GAP * (n - count)) / sum(aspect over everything)

     — the widths and every column gap on the sheet, over all the aspect ratio there is
     to share out. At the width that lands the sheet exactly on the page this equals the
     obvious (AVAIL - row gaps) / count, so nothing is lost in the normal case; but when
     a sheet is limited by the width of the paper instead, that obvious target is
     unreachable and scoring against it buys a tall row by paying for a squashed one (a
     row of four beside a row of twelve). Balance is the thing being asked for, so ask
     for balance at the width actually in hand. */
  function partition(S, count, w, minPer, maxPer) {
    var n = S.length - 1, i, j, k;
    if (count < 1 || n < count * minPer || n > count * maxPer) return null;
    var ideal = (count * w - GAP * (n - count)) / S[n];
    var best = [], back = [];
    for (k = 0; k <= count; k++) {
      var b = [], p = [];
      for (i = 0; i <= n; i++) { b.push(Infinity); p.push(-1); }
      best.push(b); back.push(p);
    }
    best[0][0] = 0;
    for (k = 1; k <= count; k++) {
      var from = Math.max(k * minPer, n - (count - k) * maxPer);
      var to = Math.min(n - (count - k) * minPer, k * maxPer);
      for (i = from; i <= to; i++) {
        var jlo = Math.max(0, i - maxPer), jhi = i - minPer;
        for (j = jlo; j <= jhi; j++) {
          if (best[k - 1][j] === Infinity) continue;
          var d = rowH(S, j, i, w) - ideal;
          var cost = best[k - 1][j] + d * d;
          if (cost < best[k][i]) { best[k][i] = cost; back[k][i] = j; }
        }
      }
    }
    if (best[count][n] === Infinity) return null;
    var rows = [], at = n;
    for (k = count; k > 0; k--) { j = back[k][at]; rows.push([j, at]); at = j; }
    return rows.reverse();
  }

  function measure(S, count, w, minPer, maxPer) {
    var rows = partition(S, count, w, minPer, maxPer);
    if (!rows) return null;
    var hs = [], sumH = 0, maxH = 0, minH = Infinity, r, h;
    for (r = 0; r < rows.length; r++) {
      h = rowH(S, rows[r][0], rows[r][1], w);
      hs.push(h); sumH += h;
      if (h > maxH) maxH = h;
      if (h < minH) minH = h;
    }
    return { rows: rows, hs: hs, sumH: sumH, maxH: maxH, minH: minH, width: w };
  }

  // Does this block sit inside the sheet at the tightest row gap, with no row over the
  // cap? Both conditions relax as the block narrows, so the set of widths that satisfy
  // them is an interval [MIN_W, x] — bisectable.
  function fitsPage(m) {
    return !!m &&
      m.sumH + GAP * (m.rows.length - 1) <= AVAIL + 1e-9 &&
      m.maxH <= MAX_ROW_H + 1e-9;
  }

  /* The widest block this sheet can take: the frames are as large as the page (or the
     row-height cap) allows. When the answer is MAX_W the sheet is width-limited and will
     come out short; otherwise it lands on AVAIL exactly. */
  function fitWidth(S, count, minPer, maxPer) {
    if (!partition(S, count, MIN_W, minPer, maxPer)) return null;
    if (fitsPage(measure(S, count, MAX_W, minPer, maxPer))) return MAX_W;
    var lo = MIN_W, hi = MAX_W, t, mid;
    for (t = 0; t < STEPS; t++) {
      mid = (lo + hi) / 2;
      if (fitsPage(measure(S, count, mid, minPer, maxPer))) lo = mid; else hi = mid;
    }
    return lo;
  }

  /* One sheet's finished geometry at a given block width. The row gap takes up whatever
     the rows leave over, up to MAX_GAP; past that the block is centred in the sheet
     rather than stretched — which is what happens on a board of three, where the cap
     holds the single row to 168mm of the 270 available. */
  function geometry(S, count, w, minPer, maxPer) {
    var m = measure(S, count, w, minPer, maxPer);
    if (!m) return null;
    var rows = m.rows.length, gap = GAP;
    if (rows > 1) {
      gap = (AVAIL - m.sumH) / (rows - 1);
      if (gap < GAP) gap = GAP;
      if (gap > MAX_GAP) gap = MAX_GAP;
    }
    var blockH = m.sumH + gap * (rows - 1);
    if (blockH > AVAIL + 0.01) return null;        // would spill off the sheet
    m.gap = gap;
    m.blockH = blockH;
    m.top = Math.max(0, (AVAIL - blockH) / 2);     // centred when short
    m.full = blockH >= AVAIL - 0.05;
    m.capped = m.maxH >= MAX_ROW_H - 0.01;
    m.widthLimited = w >= MAX_W - 0.01;
    return m;
  }

  /* ---------------- choosing between the fits ---------------- */

  /* What is being maximised is how much of the paper carries plates: the area of the
     block, width x height, on its emptiest sheet. It reads as the obvious thing to want
     and it also happens to be the only measure that settles all of these at once:

       · Row counts. Add a row and the block has to narrow by about the square of it to
         keep the same height, so among the row counts that fill the page the fewest rows
         always wins — the widest block, the largest frames. Take a row away past that
         and the block is already as wide as the paper, so the sheet can only get
         shorter. Area rises to the crossover and falls away either side of it, and the
         crossover is the fit worth having: full width and full height at once.
       · Filling the sheet. Coming up short costs area in exact proportion, so a sheet
         is left short only when the alternative covers less paper — a page of three
         plates, where filling the height would mean stacking them 1 + 2 and losing a
         third of the width to do it.
       · Lopsided splits across two sheets. Both sheets share one block width, so the
         crowded one's tiny frames would drag the emptiest-sheet area down.

     Areas within a couple of per cent of the page of each other are a coin toss on paper
     this size, so — and this is what keeps sheets full rather than merely wide — ties go
     to the sheet that fills its height exactly, then to the wider block, then to the
     tallest shortest row — which is what settles two sheets of five rows against one of
     five and one of six. */
  var AREA = MAX_W * AVAIL;

  /* One thing area cannot see, and the reason two sheets share a width in the first
     place: the frames have to be the same size on both. Two full sheets cover the same
     paper whether they hold five rows each or five and eight, so nothing said so far
     stops the pair whose shared block happens to be a millimetre wider — and half its
     frames would be two thirds the size of the other half's. So sheets whose rows are not
     within this much of each other are not eligible, whatever they cover. */
  var SCALE_TOL = 0.85;

  function uniform(sheets) {
    var lo = Infinity, hi = 0, i, mean;
    for (i = 0; i < sheets.length; i++) {
      mean = sheets[i].sumH / sheets[i].rows.length;
      if (mean < lo) lo = mean;
      if (mean > hi) hi = mean;
    }
    return hi <= 0 || lo / hi >= SCALE_TOL;
  }

  function score(cand) {
    if (cand.score) return cand.score;
    var minH = Infinity, fill = Infinity, i, s;
    for (i = 0; i < cand.sheets.length; i++) {
      s = cand.sheets[i];
      if (s.minH < minH) minH = s.minH;
      if (s.blockH / AVAIL < fill) fill = s.blockH / AVAIL;
    }
    cand.minH = minH;                    // shortest row anywhere: the frame-size floor
    cand.fill = fill;                    // and the emptiest sheet
    cand.score = [Math.round(50 * cand.width * fill * AVAIL / AREA), fill, cand.width, minH];
    return cand.score;
  }

  function better(a, b) {
    if (!b) return true;
    var x = score(a), y = score(b), i;
    for (i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  }

  function rowCounts(m, minPer, maxPer) {
    var lo = Math.max(1, Math.ceil(m / maxPer));
    var hi = Math.min(MAX_ROWS, Math.floor(m / minPer));
    var out = [], r;
    for (r = lo; r <= hi; r++) out.push(r);
    return out;
  }

  function onePage(items) {
    var S = sums(items), n = items.length;
    var minPer = minPerRow(n), maxPer = maxPerRow(n);
    var counts = rowCounts(n, minPer, maxPer), best = null, i, w, g;
    for (i = 0; i < counts.length; i++) {
      w = fitWidth(S, counts[i], minPer, maxPer);
      if (w === null) continue;
      g = geometry(S, counts[i], w, minPer, maxPer);
      if (!g) continue;
      var cand = { width: w, parts: [items], sheets: [g] };
      if (better(cand, best)) best = cand;
    }
    return best;
  }

  /* Two sheets share one block width — the narrower of the two fits, so the frames are
     the same scale throughout and the other sheet's row gap takes up the slack. Each
     sheet still chooses its own row count, and the split point is searched near the
     middle.

     Both sheets have to come out full, which is the reference's constraint and worth
     keeping: a board big enough to need two sheets is big enough to fill them, so a
     short one is not a fit, it is a mistake — and it is also the pair of sheets a
     narrower block would have filled. Requiring it does the work of balancing the split
     as well: the two halves can only fill at the same width if they carry about the same
     amount of aspect ratio per row. (Left to itself, maximising area on the emptiest
     sheet takes 27 plates and 37 over 32 and 32, to run both blocks out to the full width
     of the paper for a couple of per cent more coverage.) `strict` is dropped only if
     nothing at all fills, which needs a board of panoramas to provoke. */
  function twoPages(items, strict) {
    var n = items.length;
    if (n < 2) return null;
    var half = Math.floor(n / 2);
    var spread = Math.min(6, Math.max(1, Math.round(n * 0.12)));
    var from = Math.max(1, half - spread), to = Math.min(n - 1, half + spread);
    var best = null, split, side, i, j;
    for (split = from; split <= to; split++) {
      var parts = [items.slice(0, split), items.slice(split)];
      var S = [sums(parts[0]), sums(parts[1])];
      var lim = [], counts = [], fits = [];
      for (side = 0; side < 2; side++) {
        var m = parts[side].length;
        lim.push([minPerRow(m), maxPerRow(m)]);
        counts.push(rowCounts(m, lim[side][0], lim[side][1]));
        var f = {};
        for (i = 0; i < counts[side].length; i++) {
          f[counts[side][i]] = fitWidth(S[side], counts[side][i], lim[side][0], lim[side][1]);
        }
        fits.push(f);
      }
      for (i = 0; i < counts[0].length; i++) {
        for (j = 0; j < counts[1].length; j++) {
          var r0 = counts[0][i], r1 = counts[1][j];
          var w0 = fits[0][r0], w1 = fits[1][r1];
          if (w0 === null || w1 === null) continue;
          var w = Math.min(w0, w1);
          var g0 = geometry(S[0], r0, w, lim[0][0], lim[0][1]);
          var g1 = geometry(S[1], r1, w, lim[1][0], lim[1][1]);
          if (!g0 || !g1 || !uniform([g0, g1])) continue;
          if (strict && !(g0.full && g1.full)) continue;
          var cand = { width: w, parts: parts, sheets: [g0, g1] };
          if (better(cand, best)) best = cand;
        }
      }
    }
    return best;
  }

  /* ---------------- the plan ---------------- */

  /* One sheet or two, decided by measuring rather than counting: pack the board onto one
     sheet, and if the frames that gives are shorter than a legible row, pack it onto two
     instead and take that if it does better. Sixty four plates on one A3 come out at 35mm
     rows and go to two; thirty two fill a single sheet at 51mm and stay. */
  function plan(items) {
    var list = (items || []).filter(Boolean);
    if (!list.length) return null;
    var cand = onePage(list);
    if (cand) score(cand);
    if (!cand || cand.minH < MIN_ROW_H) {
      var two = twoPages(list, true) || twoPages(list, false);
      if (two) {
        score(two);
        if (!cand || two.minH > cand.minH) cand = two;
      }
    }
    if (!cand) return null;

    var out = { width: cand.width, avail: AVAIL, minRowH: cand.minH, fill: cand.fill, sheets: [] };
    for (var i = 0; i < cand.sheets.length; i++) {
      var g = cand.sheets[i], part = cand.parts[i], rows = [], r;
      for (r = 0; r < g.rows.length; r++) rows.push(part.slice(g.rows[r][0], g.rows[r][1]));
      out.sheets.push({
        items: part,
        rows: rows,
        rowH: g.hs,
        gap: g.gap,
        blockH: g.blockH,
        top: g.top,
        full: g.full,
        capped: g.capped,
        widthLimited: g.widthLimited
      });
    }
    return out;
  }

  function sheetsOf(items) {
    var p = plan(items);
    if (!p) return [];
    return p.sheets.map(function (s) { return s.items; });
  }

  /* ---------------- the sheets in the DOM ---------------- */

  /* Self-contained: the stylesheet is this file's, not app.css's, so dropping print.js
     into a page is the whole install. Everything is inside @media print except the one
     rule that keeps the container off the screen. */
  var CSS = [
    "#" + HOST_ID + "{display:none}",
    "@media print{",
    "@page{size:A3 landscape;margin:0}",
    /* the ink ground has to be asked for twice: once so the root paints it across the
       whole page box, once so the printer is told not to drop it */
    "html,body{margin:0!important;padding:0!important;background:#0a0a0b!important;",
    "-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}",
    /* the board, the header, the viewer, the drop drape: none of them are the print */
    "body>*{display:none!important}",
    "body>#" + HOST_ID + "{display:block!important}",
    "#" + HOST_ID + "{background:#0a0a0b;color:#eae7e1;",
    "-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    /* No bottom padding: the rows are cut to fill exactly (page - 2 x margin - label),
       so the margin is already in the fit, and leaving the padding off keeps the sheet
       box a clear 10mm short of the page — out of reach of any rounding that would
       otherwise spill a hairline onto a third sheet. */
    "#" + HOST_ID + " .csheet{padding:" + MARGIN + "mm 0 0;background:#0a0a0b}",
    "#" + HOST_ID + " .csheet+.csheet{break-before:page;page-break-before:always}",
    "#" + HOST_ID + " .chead{height:" + LABEL_H + "mm;margin:0 auto;overflow:hidden}",
    "#" + HOST_ID + " .clabel{display:block;font-family:\"Inter\",-apple-system,",
    "BlinkMacSystemFont,\"Helvetica Neue\",sans-serif;font-size:9.5px;font-weight:500;",
    "line-height:1.25;letter-spacing:.26em;text-transform:uppercase;",
    "color:rgba(234,231,225,.46);white-space:nowrap}",
    "#" + HOST_ID + " .cblock{margin:0 auto}",
    "#" + HOST_ID + " .crow{display:flex;gap:" + GAP + "mm;",
    "break-inside:avoid;page-break-inside:avoid}",
    "#" + HOST_ID + " .crow+.crow{margin-top:var(--crg," + GAP + "mm)}",
    /* flex-basis 0 with flex-grow set per aspect ratio (see build) is what justifies the
       row: every frame ends up (width - gaps) / sum(aspect) tall, which is the number the
       fit was computed from. aspect-ratio pins that box even if a plate's w/h was a guess
       or its bytes never arrive, so the sheet cannot drift off the fit; object-fit contain
       rather than cover, because nothing here is ever cropped. */
    "#" + HOST_ID + " .cfig{margin:0;flex:1 1 0;min-width:0;background:#111114}",
    "#" + HOST_ID + " .cfig img{display:block;width:100%;height:100%;",
    "object-fit:contain;opacity:1;filter:none;max-width:none}",
    "}"
  ].join("");

  function injectCSS() {
    if (typeof document === "undefined" || document.getElementById(CSS_ID)) return;
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function mm(v) { return (Math.round(v * 1000) / 1000) + "mm"; }

  function build(p, label) {
    var host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("aria-hidden", "true");
    for (var i = 0; i < p.sheets.length; i++) {
      var sh = p.sheets[i];
      var sec = document.createElement("section");
      sec.className = "csheet";

      // The heading is one line on the first sheet only, but its 7mm is budgeted out of
      // every sheet, so both blocks start at the same height on the page and the frames
      // stay one scale. It is set to the left edge of the block rather than the page
      // margin, so it hangs off the grid it belongs to.
      var head = document.createElement("div");
      head.className = "chead";
      head.style.width = mm(p.width);
      if (i === 0 && label) {
        var lab = document.createElement("span");
        lab.className = "clabel";
        lab.textContent = String(label);
        head.appendChild(lab);
      }
      sec.appendChild(head);

      var block = document.createElement("div");
      block.className = "cblock";
      block.style.width = mm(p.width);
      block.style.marginTop = mm(sh.top);
      block.style.setProperty("--crg", mm(sh.gap));
      for (var r = 0; r < sh.rows.length; r++) {
        var rowEl = document.createElement("div");
        rowEl.className = "crow";
        // Flex grow factors are what justify the row, and they are shares of the space
        // left over — but only if they add up to at least 1. Below that flexbox hands out
        // just that fraction of it and the row comes up short, which a single portrait
        // plate (0.74) or a row of two narrow ones (0.5 + 0.5) will do. Only the ratios
        // between them carry any meaning, so scale each row's up to sum to ten.
        var S = 0;
        for (var s0 = 0; s0 < sh.rows[r].length; s0++) S += aspect(sh.rows[r][s0]);
        for (var k = 0; k < sh.rows[r].length; k++) {
          var it = sh.rows[r][k], ar = aspect(it);
          var fig = document.createElement("figure");
          fig.className = "cfig";
          fig.style.flexGrow = String(10 * ar / S);
          fig.style.aspectRatio = String(ar);
          var img = document.createElement("img");
          // the same src the grid is already showing — plates/*.jpg or an upload's
          // blob: URL — so the bitmap is in memory and nothing downloads twice
          img.src = it.src;
          img.alt = "";
          img.decoding = "async";
          if (+it.w > 0) img.width = +it.w;
          if (+it.h > 0) img.height = +it.h;
          img.setAttribute("fetchpriority", "high");
          fig.appendChild(img);
          rowEl.appendChild(fig);
        }
        block.appendChild(rowEl);
      }
      sec.appendChild(block);
      host.appendChild(sec);
    }
    return host;
  }

  function remove() {
    if (typeof document === "undefined") return;
    var host = document.getElementById(HOST_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);
  }

  /* Printing early puts empty frames in the preview, so every image on the sheets is
     awaited — uploads are blob: URLs, which decode from memory but still have to be
     waited on like any other image. A plate that never arrives must not hold the dialog
     hostage either, hence the timeout. */
  function whenReady(root, done) {
    var imgs = [].slice.call(root.querySelectorAll("img"));
    var pending = imgs.filter(function (i) { return !i.complete; });
    var left = pending.length, fired = false, timer = null;
    function go() {
      if (fired) return;
      fired = true;
      if (timer) clearTimeout(timer);
      done();
    }
    function tick() { if (--left <= 0) go(); }
    timer = setTimeout(go, WAIT_MS);
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      left++;
      document.fonts.ready.then(tick, tick);
    }
    if (!left) { go(); return; }
    pending.forEach(function (i) {
      i.addEventListener("load", tick, { once: true });
      i.addEventListener("error", tick, { once: true });
    });
  }

  /* Resolves when the dialog has been handed the sheets, so a caller can hold a
     "preparing" note up for as long as that takes. */
  function run(items, label) {
    var done = function () {};
    var promise = typeof Promise === "function"
      ? new Promise(function (res) { done = res; })
      : undefined;
    var p = plan(items);
    if (!p) { done(); return promise; }    // nothing to print: no dialog, no blank sheet
    injectCSS();
    remove();                             // a previous run's sheets, if the dialog was cancelled
    var host = build(p, label);
    document.body.appendChild(host);
    whenReady(host, function () {
      try { global.print(); } catch (e) { /* a print dialog is never worth an exception */ }
      done();
    });
    return promise;
  }

  // The container is print-only, but leaving it in the DOM leaves a second copy of every
  // plate in memory, so it goes as soon as the dialog closes.
  if (global.addEventListener) global.addEventListener("afterprint", remove);
  if (global.matchMedia) {
    var mq = global.matchMedia("print");
    var off = function (e) { if (!e.matches) remove(); };
    if (mq.addEventListener) mq.addEventListener("change", off);
    else if (mq.addListener) mq.addListener(off);
  }

  global.Print = {
    sheets: sheetsOf,
    run: run,
    plan: plan,
    LIMITS: {
      PAGE_W: PAGE_W, PAGE_H: PAGE_H, MARGIN: MARGIN, GAP: GAP, MAX_GAP: MAX_GAP,
      LABEL_H: LABEL_H, AVAIL: AVAIL, MAX_W: MAX_W, MAX_ROW_H: MAX_ROW_H,
      MIN_ROW_H: MIN_ROW_H, MAX_PER_ROW: MAX_PER_ROW, MAX_ROWS: MAX_ROWS
    }
  };
})(typeof window !== "undefined" ? window : this);
