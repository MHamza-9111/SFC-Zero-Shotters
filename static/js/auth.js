/* ============================================================
   DineIQ Auth — real signup/login against /api/v1/auth/*.
   Handles validation, loading, errors, session redirect.
   ============================================================ */
(function () {
    "use strict";

    const form = document.getElementById("auth-form");
    if (!form) return;

    const errorNode = document.getElementById("auth-error");
    const submitButton = document.getElementById("auth-submit");
    const mode = document.body.dataset.authMode || "login";
    const endpoint = mode === "register" ? "/api/v1/auth/signup" : "/api/v1/auth/login";
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    /* ---------------- Theme toggle ---------------- */
    const themeBtn = document.getElementById("auth-theme-toggle");
    const themeIcon = document.getElementById("auth-theme-icon")?.querySelector("use");
    function paintTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        if (document.body) document.body.setAttribute("data-theme", theme);
        if (themeIcon) themeIcon.setAttribute("href", theme === "dark" ? "#i-sun" : "#i-moon");
        if (themeBtn) themeBtn.setAttribute("aria-pressed", String(theme === "light"));
    }
    paintTheme(document.documentElement.getAttribute("data-theme") || "dark");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const next = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
            try { localStorage.setItem("dq-theme", next); } catch (_) { /* keep in-memory theme */ }
            paintTheme(next);
        });
    }

    /* ---------------- Validation ---------------- */
    function showError(message) {
        if (errorNode) errorNode.textContent = message || "";
        if (message && errorNode) {
            errorNode.setAttribute("role", "alert");
        }
    }

    function validate(values) {
        if (mode === "register") {
            if (!values.first_name || values.first_name.length > 80) return "Enter your first name.";
            if (!values.last_name || values.last_name.length > 80) return "Enter your last name.";
            if (!values.brand || values.brand.length > 120) return "Enter your restaurant or brand name.";
            if (values.password.length < 12) return "Use a password of at least 12 characters.";
        }
        if (!values.email || !EMAIL_RE.test(values.email)) return "Enter a valid work email address.";
        if (!values.password) return "Enter your password.";
        return "";
    }

    /* ---------------- Safe redirect ---------------- */
    function safeNext() {
        const raw = document.body.dataset.next || "/";
        try {
            const url = new URL(raw, window.location.origin);
            if (url.origin !== window.location.origin) return "/";
            return url.pathname + url.search;
        } catch (_) {
            return "/";
        }
    }

    /* ---------------- Submit ---------------- */
    let submitting = false;
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submitting) return;
        showError("");

        const values = Object.fromEntries(new FormData(form).entries());
        Object.keys(values).forEach((k) => { values[k] = String(values[k] || "").trim(); });
        if (mode === "login") delete values.remember; // backend has no remember-me field

        const invalid = validate(values);
        if (invalid) {
            showError(invalid);
            return;
        }

        submitting = true;
        const label = submitButton ? submitButton.textContent : "";
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = mode === "register" ? "Creating account…" : "Signing in…";
        }
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(values),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = result.message || result.error ||
                    (response.status === 429 ? "Too many attempts — try again shortly."
                        : response.status >= 500 ? "The server could not complete the request."
                            : "Account request failed.");
                throw new Error(detail);
            }
            // Session cookie is set; move to the requested (same-origin) page.
            window.location.assign(safeNext());
        } catch (error) {
            showError(error.message || "Network error — check your connection and try again.");
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = label;
            }
            submitting = false;
        }
        // On success the page navigates away; the button stays disabled.
    });
})();
