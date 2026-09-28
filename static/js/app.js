/* ============================================================
   DineIQ Dashboard — App Shell, Themes, Animations & Interactions
   3D Tilt physics, Cursor aura, Scroll tracking, Shortcuts
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

    /* ---------------- Theme Engine ---------------- */
    function applyTheme(theme) {
        theme = theme === "light" ? "light" : "dark";
        DQ.state.theme = theme;
        document.documentElement.setAttribute("data-theme", theme);
        document.body.setAttribute("data-theme", theme);
        try { localStorage.setItem("dq-theme", theme); } catch (_) { /* Theme remains active. */ }
        
        const use = document.querySelector("#theme-icon use");
        if (use) use.setAttribute("href", theme === "dark" ? "#i-sun" : "#i-moon");
        
        const toggle = document.getElementById("theme-toggle");
        if (toggle) {
            toggle.setAttribute("aria-pressed", String(theme === "light"));
            toggle.title = `Switch to ${theme === "dark" ? "light" : "dark"} theme`;
        }
        
        document.querySelectorAll("#theme-segment button").forEach(b =>
            b.classList.toggle("active", b.dataset.theme === theme));
            
        // Re-render charts with new theme colors
        if (DQ.charts && DQ.charts.rerenderStored) {
            DQ.charts.rerenderStored();
        }
    }
    DQ.setTheme = applyTheme;

    const themeToggleBtn = document.getElementById("theme-toggle");
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", () => {
            const next = DQ.state.theme === "dark" ? "light" : "dark";
            applyTheme(next);
            DQ.toast(`Switched to ${next} theme`);
        });
    }

    /* ---------------- View Activation ---------------- */
    function activateView() {
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        const section = document.getElementById("view-" + current);
        if (section) {
            section.classList.add("active");
            const title = section.dataset.title || current;
            const titleEl = document.getElementById("page-title");
            if (titleEl) titleEl.textContent = title;
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

    /* ---------------- Sidebar Drawer (Mobile) ---------------- */
    const sidebar = document.getElementById("sidebar");
    const scrim = document.getElementById("sidebar-scrim");
    const menuToggle = document.getElementById("menu-toggle");
    const sidebarClose = document.getElementById("sidebar-close");
    let drawerReturnFocus = null;

    function openSidebar() {
        if (!sidebar) return;
        drawerReturnFocus = document.activeElement;
        sidebar.classList.add("open");
        if (scrim) scrim.hidden = false;
        if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
        if (sidebarClose) sidebarClose.focus();
    }
    function closeSidebar() {
        if (!sidebar) return;
        const wasOpen = sidebar.classList.contains("open");
        sidebar.classList.remove("open");
        if (scrim) scrim.hidden = true;
        if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
        if (!document.querySelector(".modal:not([hidden])")) document.body.style.overflow = "";
        if (wasOpen && drawerReturnFocus && typeof drawerReturnFocus.focus === "function") {
            drawerReturnFocus.focus();
        }
    }
    if (menuToggle) menuToggle.addEventListener("click", () => {
        if (sidebar && sidebar.classList.contains("open")) closeSidebar();
        else openSidebar();
    });
    if (scrim) scrim.addEventListener("click", closeSidebar);
    if (sidebarClose) sidebarClose.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sidebar && sidebar.classList.contains("open")) {
            e.preventDefault();
            closeSidebar();
        }
    });
    // Close the drawer when navigating on small screens.
    if (sidebar) sidebar.querySelectorAll(".nav-item").forEach(link =>
        link.addEventListener("click", () => { if (window.innerWidth <= 1080) closeSidebar(); }));

    /* ---------------- Branch Selector ---------------- */
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
        if (!list) return;
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
            const bName = document.getElementById("branch-name");
            const bChip = document.getElementById("branch-chip-name");
            if (bName) bName.textContent = branchLabel();
            if (bChip) bChip.textContent = branchLabel();
            if (branchMenu) branchMenu.hidden = true;
            DQ.toast(`Branch scope: ${branchLabel()}`);
            DQ.refreshView(current);
        }));
    }

    if (branchBtn && branchMenu) {
        branchBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const open = branchMenu.hidden;
            DQ.closeAllPanels(branchMenu);
            branchMenu.hidden = !open;
            branchBtn.setAttribute("aria-expanded", String(open));
            if (open) renderBranchList(document.getElementById("branch-search")?.value);
        });
    }
    if (branchChip && branchBtn) {
        branchChip.addEventListener("click", (e) => {
            e.stopPropagation();
            branchBtn.click();
            if (window.innerWidth <= 1080 && sidebar && scrim) {
                sidebar.classList.add("open");
                scrim.hidden = false;
            }
        });
    }
    const bSearch = document.getElementById("branch-search");
    if (bSearch) bSearch.addEventListener("input", (e) => renderBranchList(e.target.value));
    if (branchMenu) branchMenu.addEventListener("click", e => e.stopPropagation());

    /* ---------------- Notifications Panel ---------------- */
    const notifBtn = document.getElementById("notif-btn");
    const notifPanel = document.getElementById("notif-panel");
    if (notifBtn && notifPanel) {
        DQ.bindDropdown(notifBtn, notifPanel, "right");
    }

    async function loadAlerts() {
        const list = document.getElementById("notif-list");
        const count = document.getElementById("notif-count");
        if (!list) return;
        try {
            const r = await api.get("/api/v1/dashboard/alerts");
            const items = r.items || [];
            const meta = document.getElementById("notif-meta");
            if (meta) meta.textContent = items.length ? `${items.length} active` : "all clear";
            if (count) {
                count.textContent = items.length;
                count.hidden = !items.length;
            }
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

    /* ---------------- Global Search ---------------- */
    const searchInput = document.getElementById("global-search");
    const searchResults = document.getElementById("search-results");
    let searchTimer;

    if (searchInput && searchResults) {
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(runSearch, 260);
        });
        searchInput.addEventListener("focus", () => {
            if (searchResults.innerHTML.trim()) searchResults.hidden = false;
        });
    }

    async function runSearch() {
        if (!searchInput || !searchResults) return;
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

    /* ---------------- Command Palette (Ctrl+K) ---------------- */
    const cmdPalette = document.getElementById("command-palette");
    const cmdInput = document.getElementById("command-input");
    const cmdResults = document.getElementById("command-results");
    
    if (cmdPalette && cmdInput && cmdResults) {
        let focusedIndex = -1;
        const getItems = () => Array.from(cmdResults.querySelectorAll(".command-item:not([hidden])"));
        
        function openCommandPalette() {
            cmdPalette.hidden = false;
            cmdInput.value = "";
            getItems().forEach(item => item.hidden = false);
            focusedIndex = -1;
            updateFocus();
            setTimeout(() => cmdInput.focus(), 10);
        }
        
        function closeCommandPalette() {
            cmdPalette.hidden = true;
            cmdInput.blur();
        }
        
        function updateFocus() {
            const items = getItems();
            items.forEach((item, i) => {
                if (i === focusedIndex) {
                    item.classList.add("focused");
                    item.scrollIntoView({ block: "nearest" });
                } else {
                    item.classList.remove("focused");
                }
            });
        }
        
        // Keyboard Shortcuts
        document.addEventListener("keydown", (e) => {
            // Ctrl+K or Cmd+K
            if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                e.preventDefault();
                if (cmdPalette.hidden) openCommandPalette();
                else closeCommandPalette();
            }
            
            // Escape to close
            if (e.key === "Escape" && !cmdPalette.hidden) {
                e.preventDefault();
                closeCommandPalette();
            }
            
            // Navigation within palette
            if (!cmdPalette.hidden) {
                const items = getItems();
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusedIndex = (focusedIndex + 1) % items.length;
                    updateFocus();
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    focusedIndex = (focusedIndex - 1 + items.length) % items.length;
                    updateFocus();
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (focusedIndex >= 0 && items[focusedIndex]) {
                        items[focusedIndex].click();
                    }
                }
            }
        });
        
        // Filter commands on typing
        cmdInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = Array.from(cmdResults.querySelectorAll(".command-item"));
            let visibleCount = 0;
            
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(query)) {
                    item.hidden = false;
                    visibleCount++;
                } else {
                    item.hidden = true;
                }
            });
            
            // Reset focus to first visible item
            focusedIndex = visibleCount > 0 ? 0 : -1;
            updateFocus();
        });
        
        // Handle clicks on command items
        cmdResults.addEventListener("click", (e) => {
            const btn = e.target.closest(".command-item");
            if (btn && btn.dataset.nav) {
                closeCommandPalette();
                // Find and click the corresponding sidebar navigation item
                const navLink = document.querySelector(`.nav-item[data-view="${btn.dataset.nav}"]`);
                if (navLink) navLink.click();
            }
        });
        
        // Close on background click
        cmdPalette.addEventListener("click", (e) => {
            if (e.target === cmdPalette) closeCommandPalette();
        });
    }

    /* ---------------- System Status & Profile ---------------- */
    async function loadStatus() {
        try {
            const s = await api.get("/api/v1/status");
            const lbl = document.getElementById("sys-label");
            const dot = document.getElementById("sys-dot");
            const sub = document.getElementById("sys-sub");
            if (lbl) lbl.textContent = s.status === "OPERATIONAL" ? "Pipeline online" : "Pipeline degraded";
            if (dot && s.status !== "OPERATIONAL") dot.classList.add("danger");
            if (sub) sub.textContent = s.engine || "Operational";
        } catch (err) {
            const lbl = document.getElementById("sys-label");
            const dot = document.getElementById("sys-dot");
            const sub = document.getElementById("sys-sub");
            if (lbl) lbl.textContent = "API unreachable";
            if (dot) dot.classList.add("danger");
            if (sub) sub.textContent = err.message;
        }
    }

    /* ---------------- Modals & Auth ---------------- */
    document.querySelectorAll("[data-close]").forEach(btn =>
        btn.addEventListener("click", () => DQ.closeModal(btn.dataset.close)));
    document.querySelectorAll(".modal").forEach(m =>
        m.addEventListener("click", (e) => { if (e.target === m) DQ.closeModal(m.id); }));

    const signOutButton = document.getElementById("logout-button");
    if (signOutButton) {
        signOutButton.addEventListener("click", async () => {
            try { await api.post("/api/v1/auth/logout", {}); }
            finally { window.location.assign("/login"); }
        });
    }

    /* Account dropdown — real session data from /auth/me */
    const userMenuBtn = document.getElementById("user-menu-btn");
    const userMenu = document.getElementById("user-menu");
    if (userMenuBtn && userMenu) {
        DQ.bindDropdown(userMenuBtn, userMenu, "right");
        userMenu.addEventListener("click", () => { userMenu.hidden = true; });
    }

    function initialsOf(name) {
        return String(name || "")
            .split(/\s+/).filter(Boolean)
            .map(word => word[0]).join("")
            .slice(0, 2).toUpperCase() || "··";
    }

    async function loadSignedInUser() {
        try {
            const user = await api.get("/api/v1/auth/me");
            const initials = document.getElementById("user-initials");
            const name = document.getElementById("user-name");
            const meta = document.getElementById("user-meta");
            const teamLink = document.getElementById("user-team-link");
            if (initials) initials.textContent = initialsOf(user.name);
            if (name) name.textContent = user.name || "Signed in";
            if (meta) meta.textContent = `${user.email || ""}${user.role ? " · " + user.role : ""}`;
            if (teamLink) teamLink.hidden = user.role !== "Administrator";
            if (signOutButton) signOutButton.title = `${user.name} · ${user.role}`;
        } catch (_) {
            /* Running without auth requirement — menu stays generic. */
        }
    }

    /* ---------------- Precision interaction: no 3D/gravity transforms ---------------- */
    // Cards stay spatially stable while hover states use border/background emphasis.
    // This keeps dense analytical tables and charts readable and avoids perspective
    // motion that can make an intelligence dashboard feel like a game UI.

    /* ---------------- Scroll Progress Tracking ---------------- */
    const progressBar = document.getElementById("scroll-progress-bar");
    if (progressBar) {
        window.addEventListener("scroll", () => {
            const docH = document.documentElement.scrollHeight - window.innerHeight;
            const pct = docH > 0 ? (window.scrollY / docH) * 100 : 0;
            progressBar.style.width = `${Math.min(pct, 100)}%`;
        }, { passive: true });
    }

    /* ---------------- Ambient micro-interactions ---------------- */
    // Card spotlight: the radial highlight follows the pointer across each
    // surface. Delegated so it also covers dynamically rendered cards/tables.
    (function cardSpotlight() {
        let raf = null;
        document.addEventListener("mousemove", (e) => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = null;
                const card = e.target && e.target.closest && e.target.closest(".card, .kpi");
                if (!card) return;
                const r = card.getBoundingClientRect();
                card.style.setProperty("--mouse-x", (e.clientX - r.left) + "px");
                card.style.setProperty("--mouse-y", (e.clientY - r.top) + "px");
            });
        }, { passive: true });
    })();

    // Cursor aura: a soft, eased glow that trails the pointer. Pointer-fine and
    // motion-tolerant contexts only — never on touch or reduced-motion.
    (function cursorAura() {
        const aura = document.getElementById("cursor-aura");
        if (!aura) return;
        const fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
        const calm = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        if (!fine || !calm) { aura.style.display = "none"; return; }
        let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
        let ax = tx, ay = ty, running = false;
        document.addEventListener("mousemove", (e) => {
            tx = e.clientX; ty = e.clientY;
            if (!running) { running = true; requestAnimationFrame(loop); }
        }, { passive: true });
        function loop() {
            ax += (tx - ax) * 0.12;
            ay += (ty - ay) * 0.12;
            aura.style.left = ax + "px";
            aura.style.top = ay + "px";
            if (Math.abs(tx - ax) > 0.4 || Math.abs(ty - ay) > 0.4) {
                requestAnimationFrame(loop);
            } else {
                running = false;
            }
        }
    })();

    /* ---------------- Global Keyboard Shortcuts ---------------- */
    window.addEventListener("keydown", (e) => {
        // Ctrl+K or Cmd+K: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
        // 'D' key toggles theme when not in input/textarea
        if (e.key === "d" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
            const next = DQ.state.theme === "dark" ? "light" : "dark";
            applyTheme(next);
            DQ.toast(`Theme: ${next}`);
        }
    });

    /* ---------------- Refresh Button ---------------- */
    const refreshBtn = document.getElementById("refresh-dashboard");
    const pageLoadbar = document.getElementById("loadbar");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            refreshBtn.classList.add("spinning");
            refreshBtn.disabled = true;
            if (pageLoadbar) pageLoadbar.classList.add("on");
            DQ.refreshView(current);
            setTimeout(() => {
                refreshBtn.classList.remove("spinning");
                refreshBtn.disabled = false;
                if (pageLoadbar) pageLoadbar.classList.remove("on");
            }, 700);
        });
    }

    /* ---------------- Boot ---------------- */
    async function boot() {
        applyTheme(DQ.state.theme);

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
            const bName = document.getElementById("branch-name");
            const bChip = document.getElementById("branch-chip-name");
            if (bName) bName.textContent = branchLabel();
            if (bChip) bChip.textContent = branchLabel();
        } catch (err) {
            DQ.toast("Failed to load metadata: " + err.message, "error");
        }

        activateView();
        loadAlerts();
        loadStatus();
        loadSignedInUser();
    }

    boot();
})();
