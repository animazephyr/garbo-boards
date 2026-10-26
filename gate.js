/* Garbo — gate.js  ·  the password screen on the public site (published copies only)
   A browser that has entered the password once is remembered. This keeps the
   site from casual eyes; GitHub Pages can't lock the files themselves. */
(function () {
  "use strict";
  var KEY = "garbo-pass", HASH = "4574121fc410b4265ac6642bd8e5d7cce812e35a528a195cecd27f05c1a9fa95";
  try { if (localStorage.getItem(KEY) === HASH) return; } catch (e) {}
  var css = document.createElement("style");
  css.textContent =
    "#gate{position:fixed;inset:0;z-index:1000;background:#0a0a0b;display:grid;place-items:center;font-family:Inter,-apple-system,Helvetica Neue,sans-serif;color:#eae7e1}" +
    "#gate form{display:flex;flex-direction:column;align-items:center;gap:18px;padding:24px}" +
    "#gate .t{font-size:13px;font-weight:500;letter-spacing:.26em;text-transform:uppercase}" +
    "#gate .s{font-size:9.5px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;color:rgba(234,231,225,.46)}" +
    "#gate input{width:240px;background:transparent;border:0;border-bottom:1px solid rgba(234,231,225,.3);color:#eae7e1;font:inherit;font-size:15px;letter-spacing:.2em;text-align:center;padding:8px 4px;outline:none}" +
    "#gate input:focus{border-bottom-color:#eae7e1}" +
    "#gate button{background:none;border:0;color:rgba(234,231,225,.7);font:inherit;font-size:9.5px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;cursor:pointer;padding:6px}" +
    "#gate button:hover{color:#fff}#gate .e{min-height:1em;font-size:10px;letter-spacing:.2em;color:#e8a39b;text-transform:uppercase}" +
    "html.gated body>*:not(#gate){visibility:hidden}";
  document.head.appendChild(css);
  document.documentElement.classList.add("gated");
  function show() {
    var g = document.createElement("div");
    g.id = "gate";
    g.innerHTML = '<form><div class="t">Greta Garbo</div><div class="s">Cara Stricker</div>' +
      '<input type="password" autocomplete="current-password" placeholder="Password" aria-label="Password">' +
      '<button type="submit">Enter</button><div class="e"></div></form>';
    document.body.appendChild(g);
    var f = g.querySelector("form"), i = g.querySelector("input"), err = g.querySelector(".e");
    i.focus();
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(i.value)).then(function (b) {
        var h = Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
        if (h === HASH) {
          try { localStorage.setItem(KEY, HASH); } catch (e) {}
          g.remove();
          document.documentElement.classList.remove("gated");
        } else { err.textContent = "Not quite"; i.select(); }
      });
    });
  }
  if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
})();
