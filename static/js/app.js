/* ============================================================
   DineIQ Dashboard — app shell: theme, sidebar, header, routing
   ============================================================ */
(function () {
    "use strict";

    const DQ = window.DQ;
    const { api, esc, icon, fmt, setLoading } = DQ;

    const current = document.body.dataset.view || "overview";

    DQ.currentView = function () { return current; };

    DQ.refreshView = function (name) {
        const v = DQ.views[name || current];
        if (v && v.initialized && v.refresh) v.refresh();
    };

    /* ---------------- Theme ---------------- */
    function applyTheme(theme) {
        DQ.state.theme = theme;
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("dq-theme", theme);
        const use = document.querySelector("#theme-icon use");
        if (use) use.setAttribute("href", theme === "dark" ? "#i-sun" : "#i-moon");
        document.querySelectorAll("#theme-segment button").forEach(b =>
            b.classList.toggle("active", b.dataset.theme === theme));
        DQ.charts.rerenderStored();
    }
    DQ.setTheme = applyTheme;

    document.getElementById("theme-toggle").addEventListener("click", () => {
        applyTheme(DQ.state.theme === "dark" ? "light" : "dark");
        DQ.toast(DQ.state.theme === "dark" ? "DineIQ dark theme" : "Dinex light theme");
    });

    /* ---------------- View activation ---------------- */
    function activateView() {
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        const section = document.getElementById("view-" + current);
        if (section) {
            section.classList.add("active");
            const title = section.dataset.title || current;
            document.getElementById("page-title").textContent = title;
            document.title = `DineIQ — ${title}`;
        }
        document.querySelectorAll(".nav-item").forEach(a => {
            a.classList.toggle("active", a.dataset.view === current);
        });
        const v = DQ.views[current];
        if (v) {
            if (!v.initialized && v.init) { v.init(); v.initialized = true; }
            if (v.refresh) v.refresh();
        }
    }

    /* ---------------- Sidebar (mobile) ---------------- */
    const sidebar = document.getElementById("sidebar");
    const scrim = document.getElementById("sidebar-scrim");
    document.getElementById("menu-toggle").addEventListener("click", () => {
        sidebar.classList.add("open");
        scrim.hidden = false;
    });
    function closeSidebar() {
        sidebar.classList.remove("open");
        scrim.hidden = true;
    }
    scrim.addEventListener("click", closeSidebar);
    document.getElementById("sidebar-close").addEventListener("click", closeSidebar);

    /* ---------------- Branch selector ---------------- */
    const branchBtn = document.getElementById("branch-selector");
    const branchMenu = document.getElementById("branch-menu");
    const branchChip = document.getElementById("branch-chip");

    function branchLabel() {
        const meta = DQ.state.meta || {};
        if (DQ.state.locationId === "all") return "All Locations";
        const loc = (meta.locations || []).find(l => String(l.location_id) === String(DQ.state.locationId));
        return loc ? loc.city_area : `Area ${DQ.state.locationId}`;
    }

    function renderBranchList(filter) {
        const list = document.getElementById("branch-list");
        const meta = DQ.state.meta || {};
        const rows = [{ location_id: "all", city_area: "All Locations" }].concat(meta.locations || []);
        const f = (filter || "").toLowerCase();
        const filtered = rows.filter(r => !f || (r.city_area || "").toLowerCase().includes(f));
        list.innerHTML = filtered.map(r => `
            <button class="dropdown-item ${String(r.location_id) === String(DQ.state.locationId) ? "active" : ""}"
                    data-loc="${esc(r.location_id)}">
                ${icon("pin")}
                <span>${esc(r.city_area)}
                    ${r.orders ? `<span class="muted">· ${fmt.num(r.orders)} orders</span>` : ""}</span>
            </button>`).join("") || `<div class="empty-state">No matching areas</div>`;
        list.querySelectorAll("[data-loc]").forEach(btn => btn.addEventListener("click", () => {
            DQ.state.locationId = btn.dataset.loc;
            localStorage.setItem("dq-loc", DQ.state.locationId);
            document.getElementById("branch-name").textContent = branchLabel();
            document.getElementById("branch-chip-name").textContent = branchLabel();
            branchMenu.hidden = true;
            DQ.toast(`Branch filter: ${branchLabel()}`);
            DQ.refreshView(current);
        }));
    }

    branchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = branchMenu.hidden;
        DQ.closeAllPanels(branchMenu);
        branchMenu.hidden = !open;
        if (open) renderBranchList(document.getElementById("branch-search").value);
    });
    branchChip.addEventListener("click", (e) => {
        e.stopPropagation();
        branchBtn.click();
        if (window.innerWidth <= 1024) { sidebar.classList.add("open"); scrim.hidden = false; }
    });
    document.getElementById("branch-search").addEventListener("input", (e) => renderBranchList(e.target.value));
    branchMenu.addEventListener("click", e => e.stopPropagation());

    /* ---------------- Notifications ---------------- */
    DQ.bindDropdown(document.getElementById("notif-btn"), document.getElementById("notif-panel"), "right");

    async function loadAlerts() {
        const list = document.getElementById("notif-list");
        const count = document.getElementById("notif-count");
        try {
            const r = await api.get("/api/v1/dashboard/alerts");
            const items = r.items || [];
            document.getElementById("notif-meta").textContent = items.length ? `${items.length} active` : "all clear";
            count.textContent = items.length;
            count.hidden = !items.length;
            list.innerHTML = items.map(a => `
                <a class="dropdown-item" href="${esc(a.href)}" style="align-items:flex-start">
                    <span class="status-dot ${a.level === "danger" ? "danger" : a.level === "warn" ? "warn" : ""}" style="margin-top:5px"></span>
                    <span>
                        <span style="font-weight:700;display:block">${esc(a.title)}</span>
                        <span class="muted">${esc(a.body)}</span>
                    </span>
                </a>`).join("") || `<div class="empty-state">No active alerts</div>`;
        } catch (err) {
            list.innerHTML = `<div class="empty-state">Alerts unavailable</div>`;
        }
    }

    /* ---------------- Global search ---------------- */
    const searchInput = document.getElementById("global-search");
    const searchResults = document.getElementById("search-results");
    let searchTimer;

    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 280);
    });
    searchInput.addEventListener("focus", () => {
        if (searchResults.innerHTML.trim()) searchResults.hidden = false;
    });

    async function runSearch() {
        const q = searchInput.value.trim();
        if (!q) { searchResults.hidden = true; return; }
        try {
            const r = await api.get("/api/v1/dashboard/search", { q });
            const parts = [];
            if (r.orders && r.orders.length) {
                parts.push(`<div class="nav-group-label">Orders</div>` + r.orders.map(o =>
                    `<a class="dropdown-item" href="#" data-order="${esc(o.order_id)}">${icon("receipt")}
                        <span>#${esc(o.order_ref)} · ${esc(o.city_area)} · ${fmt.money0(o.total_amount)}</span></a>`).join(""));
            }
            if (r.dishes && r.dishes.length) {
                parts.push(`<div class="nav-group-label">Dishes</div>` + r.dishes.map(d =>
                    `<a class="dropdown-item" href="/menu">${icon("menu-book")}
                        <span>${esc(d.item_name)} · ${esc(d.category_name)}</span></a>`).join(""));
            }
            if (r.areas && r.areas.length) {
                parts.push(`<div class="nav-group-label">Areas</div>` + r.areas.map(a =>
                    `<a class="dropdown-item" href="/locations">${icon("pin")}
                        <span>${esc(a.city_area)} · ${fmt.money0(a.revenue)}</span></a>`).join(""));
            }
            if (r.customers && r.customers.length) {
                parts.push(`<div class="nav-group-label">Guests</div>` + r.customers.map(c =>
                    `<a class="dropdown-item" href="/customers">${icon("users")}
                        <span>#${esc(c.customer_id)} · ${fmt.num(c.total_orders)} orders</span></a>`).join(""));
            }
            searchResults.innerHTML = parts.join("") ||
                `<div class="empty-state">No matches for “${esc(q)}”</div>`;
            searchResults.hidden = false;
            searchResults.querySelectorAll("[data-order]").forEach(a =>
                a.addEventListener("click", (e) => {
                    e.preventDefault();
                    searchResults.hidden = true;
                    DQ.openOrder(a.dataset.order);
                }));
        } catch (err) {
            searchResults.innerHTML = `<div class="empty-state">Search unavailable</div>`;
            searchResults.hidden = false;
        }
    }

    /* ---------------- Profile + system card ---------------- */
    DQ.bindDropdown(document.getElementById("profile-btn"), document.getElementById("profile-menu"), "right");

    async function loadStatus() {
        try {
            const s = await api.get("/api/v1/status");
            document.getElementById("profile-api").textContent = `${s.status} · v${s.pipeline_version}`;
            document.getElementById("sys-label").textContent = "Pipeline online";
            document.getElementById("sys-sub").textContent = s.engine;
        } catch (err) {
            document.getElementById("sys-label").textContent = "API unreachable";
            document.getElementById("sys-dot").classList.add("danger");
            document.getElementById("sys-sub").textContent = err.message;
        }
    }

    /* ---------------- Modals: close buttons + New Order flow ---------------- */
    document.querySelectorAll("[data-close]").forEach(btn =>
        btn.addEventListener("click", () => DQ.closeModal(btn.dataset.close)));
    document.querySelectorAll(".modal").forEach(m =>
        m.addEventListener("click", (e) => { if (e.target === m) DQ.closeModal(m.id); }));

    document.getElementById("btn-new-order").addEventListener("click", () => {
        DQ.infoModal("New Order", `
            <p style="margin-bottom:12px">Order intake runs in the connected POS service — this platform owns the
            <strong>analytics and ML serving</strong> for new orders, not ticket creation.</p>
            <p style="margin-bottom:16px">Score a prospective order against the warm
            PySpark&nbsp;MLlib&nbsp;+&nbsp;Scikit-Learn ensemble (high-value classification, &lt;&nbsp;5&nbsp;s NFR):</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                <a class="btn btn-primary" href="/models" data-close="modal-info">Open Ensemble Scorer</a>
                <a class="btn btn-ghost" href="/orders" data-close="modal-info">Browse Orders</a>
            </div>`);
        document.querySelectorAll("#info-modal-body [data-close]").forEach(a =>
            a.addEventListener("click", () => DQ.closeModal("modal-info")));
    });

    /* ---------------- Boot ---------------- */
    async function boot() {
        applyTheme(DQ.state.theme);

        // skeleton page title while meta loads
        try {
            const meta = await api.get("/api/v1/dashboard/meta");
            DQ.state.meta = meta;
            DQ.state.minDate = meta.date_range.min;
            DQ.state.maxDate = meta.date_range.max;
            const savedLoc = localStorage.getItem("dq-loc");
            if (savedLoc && (savedLoc === "all" || (meta.locations || []).some(l => String(l.location_id) === savedLoc))) {
                DQ.state.locationId = savedLoc;
            }
            DQ.state.businessDate = meta.date_range.default;
            document.getElementById("branch-name").textContent = branchLabel();
            document.getElementById("branch-chip-name").textContent = branchLabel();
        } catch (err) {
            DQ.toast("Failed to load dashboard metadata: " + err.message, "error");
        }

        activateView();
        loadAlerts();
        loadStatus();
    }

    boot();
})();
