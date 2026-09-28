


(function () {
    "use strict";
    var theme = "dark";
    try {
        var stored = localStorage.getItem("dq-theme");
        if (stored === "light" || stored === "dark") theme = stored;
    } catch (_) {  }
    document.documentElement.setAttribute("data-theme", theme);
    document.addEventListener("DOMContentLoaded", function () {
        if (document.body) document.body.setAttribute("data-theme", theme);
    });
})();
