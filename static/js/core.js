/* ============================================================
   DineIQ Dashboard — core: API client, formatters, UI kit, store
   ============================================================ */
(function () {
    "use strict";

    const DQ = window.DQ = {
        views: {},
        state: {
            meta: null,
            businessDate: null,      // 'YYYY-MM-DD' operating date
            minDate: null,
            maxDate: null,
            locationId: "all",
            theme: localStorage.getItem("dq-theme") || "dark",
        },
    };

    /* ---------------- API ---------------- */
    DQ.api = {
        async get(path, params) {
            const url = new URL(path, window.location.origin);
            if (params) {
                Object.entries(params).forEach(([k, v]) => {
                    if (v !== undefined && v !== null && v !== "" && v !== "all") {
                        url.searchParams.set(k, v);
                    }
                });
            }
            const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
            if (!res.ok) {
                let detail = `HTTP ${res.status}`;
                try {
                    const body = await res.json();
                    if (body && (body.message || body.error)) detail = body.message || body.error;
                } catch (_) { /* not JSON */ }
                const err = new Error(detail);
                err.status = res.status;
                throw err;
            }
            return res.json();
        },
        async post(path, payload) {
            const url = new URL(path, window.location.origin);
            const res = await fetch(url.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(payload || {}),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = new Error(body.message || body.error || `HTTP ${res.status}`);
                err.status = res.status;
                err.body = body;
                throw err;
            }
            return body;
        },
    };

    /* ---------------- Formatters ---------------- */
    const moneySymbol = "Rs.";
    DQ.fmt = {
        money(v, opts) {
            if (v === null || v === undefined || isNaN(v)) return "—";
            const o = opts || {};
            const digits = o.decimals !== undefined ? o.decimals : (Math.abs(v) >= 1000 ? 0 : 2);
            const n = Number(v).toLocaleString("en-PK", {
                minimumFractionDigits: digits, maximumFractionDigits: digits,
            });
            return `${moneySymbol} ${n}`;
        },
        money0(v) { return DQ.fmt.money(v, { decimals: 0 }); },
        money2(v) { return DQ.fmt.money(v, { decimals: 2 }); },
        moneyCompact(v) {
            if (v === null || v === undefined || isNaN(v)) return "—";
            const abs = Math.abs(v);
            let out;
            if (abs >= 1e7) out = (v / 1e6 / 10).toFixed(2) + "Cr";
            else if (abs >= 1e6) out = (v / 1e6).toFixed(1) + "M";
            else if (abs >= 1e5) out = (v / 1e5).toFixed(1) + "L";
            else if (abs >= 1e3) out = (v / 1e3).toFixed(0) + "K";
            else out = Math.round(v).toString();
            return `${moneySymbol} ${out}`;
        },
        axisMoney(v) {
            const abs = Math.abs(v);
            if (abs >= 1e6) return `${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
            if (abs >= 1e3) return `${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
            return Math.round(v).toString();
        },
        num(v) {
            if (v === null || v === undefined || isNaN(v)) return "—";
            return Number(v).toLocaleString("en-PK");
        },
        pct(v, digits) {
            if (v === null || v === undefined || isNaN(v)) return "—";
            const d = digits === undefined ? 1 : digits;
            return `${v >= 0 ? "" : ""}${Number(v).toFixed(d)}%`;
        },
        trend(v, suffix) {
            if (v === null || v === undefined || isNaN(v)) return { cls: "flat", text: "—", arrow: "" };
            const arrow = v > 0 ? "↑" : (v < 0 ? "↓" : "→");
            return {
                cls: v > 0 ? "up" : (v < 0 ? "down" : "flat"),
                arrow,
                text: `${arrow} ${Math.abs(v).toFixed(1)}%${suffix ? " " + suffix : ""}`,
            };
        },
        relTime(dateStr, timeStr, asOf) {
            if (!dateStr) return "—";
            const base = asOf ? new Date(asOf + "T23:59:00") : new Date();
            const t = timeStr && timeStr.length ? timeStr.slice(0, 5) : "12:00";
            const d = new Date(dateStr + "T" + t + ":00");
            const diffMs = base - d;
            const mins = Math.round(diffMs / 60000);
            if (mins < 1) return "just now";
            if (mins < 60) return mins + "m ago";
            const hrs = Math.round(mins / 60);
            if (hrs < 24) return hrs + "h ago";
            const days = Math.round(hrs / 24);
            if (days < 60) return days + "d ago";
            return dateStr;
        },
        dateLabel(dateStr) {
            if (!dateStr) return "—";
            const d = new Date(dateStr + "T12:00:00");
            return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        },
    };

    /* ---------------- HTML helpers ---------------- */
    DQ.esc = function (s) {
        return String(s === null || s === undefined ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    };

    DQ.icon = function (name, cls) {
        return `<svg class="${cls || ""}"><use href="#i-${name}"/></svg>`;
    };

    DQ.badge = function (text, kind) {
        return `<span class="badge badge-${kind || "gray"}">${DQ.esc(text)}</span>`;
    };

    DQ.statusBadge = function (status, isCompleted) {
        const s = String(status || "").toLowerCase();
        if (isCompleted === true || s === "completed") return DQ.badge("Completed", "green-solid");
        if (s === "cancelled") return DQ.badge("Cancelled", "red");
        return DQ.badge(status || "Unknown", "gray");
    };

    /* Category-derived color for dish thumbnails (deterministic). */
    const DISH_COLORS = ["#f43f5e", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ef4444", "#14b8a6"];
    DQ.dishColor = function (key) {
        const s = String(key || "");
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return DISH_COLORS[h % DISH_COLORS.length];
    };
    DQ.dishInitial = function (name) {
        const s = String(name || "?").replace(/^Menu Item\s*/i, "").trim();
        return s.slice(0, 2).toUpperCase() || "?";
    };

    /* ---------------- States ---------------- */
    DQ.skeleton = function (rows) {
        let out = "";
        for (let i = 0; i < (rows || 4); i++) out += `<div class="skeleton sk-line" style="width:${85 - i * 7}%"></div>`;
        return out;
    };
    DQ.skeletonBlocks = function (n) {
        let out = "";
        for (let i = 0; i < (n || 3); i++) out += `<div class="skeleton sk-block"></div>`;
        return out;
    };
    DQ.emptyState = function (title, sub, icon) {
        return `<div class="empty-state">
            <div class="empty-icon">${DQ.icon(icon || "doc")}</div>
            <div class="empty-title">${DQ.esc(title)}</div>
            <div>${DQ.esc(sub || "No data available in the loaded pipeline layer.")}</div>
        </div>`;
    };
    DQ.errorState = function (message) {
        return `<div class="empty-state error-state">
            <div class="empty-icon">${DQ.icon("x")}</div>
            <div class="empty-title">Could not load data</div>
            <div>${DQ.esc(message || "The analytics API did not respond.")}</div>
        </div>`;
    };

    /* Fill a container while loading */
    DQ.setLoading = function (el, rows) {
        if (el) el.innerHTML = DQ.skeleton(rows || 4);
    };

    /* ---------------- Pager ---------------- */
    DQ.renderPager = function (el, info, onGo) {
        if (!el) return;
        if (!info || info.total === 0) { el.innerHTML = ""; return; }
        el.innerHTML = `
            <span>${DQ.fmt.num(info.total)} result(s) · page ${info.page} / ${info.pages}</span>
            <span class="pager-btns">
                <button class="btn btn-ghost btn-sm" data-go="${info.page - 1}" ${info.page <= 1 ? "disabled" : ""}>Prev</button>
                <button class="btn btn-ghost btn-sm" data-go="${info.page + 1}" ${info.page >= info.pages ? "disabled" : ""}>Next</button>
            </span>`;
        el.querySelectorAll("[data-go]").forEach(btn => {
            btn.addEventListener("click", () => onGo(parseInt(btn.dataset.go, 10)));
        });
    };

    /* ---------------- Dropdown manager ---------------- */
    const openPanels = new Set();
    DQ.closeAllPanels = function (except) {
        openPanels.forEach(p => {
            if (p !== except) { p.hidden = true; openPanels.delete(p); }
        });
    };
    DQ.bindDropdown = function (btn, panel, align) {
        if (!btn || !panel) return;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const willOpen = panel.hidden;
            DQ.closeAllPanels(panel);
            panel.hidden = !willOpen;
            if (willOpen) {
                openPanels.add(panel);
                if (align === "right") {
                    const r = btn.getBoundingClientRect();
                    panel.style.top = (r.bottom + 8) + "px";
                    panel.style.right = Math.max(12, window.innerWidth - r.right) + "px";
                    panel.style.left = "auto";
                    panel.style.position = "fixed";
                }
            } else {
                openPanels.delete(panel);
            }
        });
        panel.addEventListener("click", e => e.stopPropagation());
    };
    document.addEventListener("click", () => DQ.closeAllPanels());
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            DQ.closeAllPanels();
            DQ.closeModal("modal-order");
            DQ.closeModal("modal-info");
        }
    });

    /* ---------------- Modals ---------------- */
    DQ.openModal = function (id) {
        const m = document.getElementById(id);
        if (m) { m.hidden = false; document.body.style.overflow = "hidden"; }
    };
    DQ.closeModal = function (id) {
        const m = document.getElementById(id);
        if (m) { m.hidden = true; document.body.style.overflow = ""; }
    };
    DQ.infoModal = function (title, html) {
        document.getElementById("info-modal-title").textContent = title;
        document.getElementById("info-modal-body").innerHTML = html;
        DQ.openModal("modal-info");
    };

    /* ---------------- Toasts ---------------- */
    DQ.toast = function (message, kind) {
        const wrap = document.getElementById("toast-wrap");
        const t = document.createElement("div");
        t.className = "toast" + (kind === "error" ? " error" : "");
        t.textContent = message;
        wrap.appendChild(t);
        setTimeout(() => t.remove(), 3800);
    };

    /* ---------------- Query params ---------------- */
    DQ.queryParam = function (name) {
        return new URLSearchParams(window.location.search).get(name);
    };

    /* ---------------- View registry ---------------- */
    DQ.registerView = function (name, init, refresh) {
        DQ.views[name] = { init, refresh, initialized: false };
    };
})();
