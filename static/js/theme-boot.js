/* Pre-paint theme boot — runs before first paint to avoid a flash of the
   wrong theme. Kept tiny and dependency-free; the full theme engine lives in
   app.js / auth.js. */
(function () {
    "use strict";
    var theme = "dark";
    try {
        var stored = localStorage.getItem("dq-theme");
        if (stored === "light" || stored === "dark") theme = stored;
    } catch (_) { /* storage unavailable — keep default */ }
    document.documentElement.setAttribute("data-theme", theme);
    document.addEventListener("DOMContentLoaded", function () {
        if (document.body) document.body.setAttribute("data-theme", theme);
    });
})();
