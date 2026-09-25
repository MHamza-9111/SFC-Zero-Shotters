/* ============================================================
   DineIQ Dashboard — Overview view
   ============================================================ */
(function () {
    "use strict";

    const DQ = window.DQ;
    const { api, fmt, esc, icon, badge, setLoading, emptyState, errorState } = DQ;

    const state = {
        revRange: "week",
        dishesRange: "all",
        recentSort: "recent",
    };

    function locParam() {
        return DQ.state.locationId === "all" ? undefined : DQ.state.locationId;
    }
    function dateParam() {
        return DQ.state.businessDate;
    }

    /* ---------------- KPI row ---------------- */
    function kpiCard({ label, value, trendPct, trendSuffix, support, hero, icon: ic, tint, format }) {
        const trend = fmt.trend(trendPct, trendSuffix);
        const val = format === "money" ? fmt.money0(value)
            : format === "fraction" ? value
            : fmt.num(value);
        return `<div class="kpi ${hero ? "hero" : ""}">
            <div class="kpi-label">${esc(label)}</div>
            ${ic ? `<div class="kpi-ic ${hero ? "" : "kpi-icon-tint " + (tint || "")}">${icon(ic)}</div>` : ""}
            <div class="kpi-value">${val}</div>
            <div class="kpi-support">
                ${trendPct !== null && trendPct !== undefined
                    ? `<span class="kpi-trend ${trend.cls}">${esc(trend.text)}</span>`
                    : ""}
                <span>${esc(support || "")}</span>
            </div>
        </div>`;
    }

    async function loadKpis() {
        const grid = document.getElementById("kpi-grid");
        setLoading(grid, 3);
        grid.innerHTML = Array.from({ length: 5 }).map(() =>
            `<div class="kpi"><div class="skeleton sk-line" style="width:50%"></div>
             <div class="skeleton" style="height:28px;width:70%;margin-top:10px"></div>
             <div class="skeleton sk-line" style="width:60%"></div></div>`).join("");
        try {
            const ov = await api.get("/api/v1/dashboard/overview", {
                location_id: locParam(), date: dateParam(),
            });
            DQ.state.businessDate = ov.as_of || DQ.state.businessDate;
            syncDateInputs();
            const k = ov.kpis || {};
            const loc = ov.location;
            grid.innerHTML = [
                kpiCard({
                    label: "Today's Revenue", value: k.revenue && k.revenue.value,
                    trendPct: k.revenue && k.revenue.trend_pct, trendSuffix: "vs yesterday",
                    support: k.revenue && k.revenue.support, hero: true, icon: "wallet", format: "money",
                }),
                kpiCard({
                    label: "Orders Today", value: k.orders && k.orders.value,
                    trendPct: k.orders && k.orders.trend_pct, trendSuffix: "vs yesterday",
                    support: k.orders && k.orders.support, icon: "receipt", tint: "blue", format: "number",
                }),
                kpiCard({
                    label: "Avg Order Value", value: k.aov && k.aov.value,
                    trendPct: k.aov && k.aov.trend_pct, trendSuffix: "per order",
                    support: k.aov && k.aov.support, icon: "trend", tint: "green", format: "money",
                }),
                kpiCard({
                    label: "Customers Today", value: k.customers && k.customers.value,
                    trendPct: k.customers && k.customers.trend_pct, trendSuffix: "vs yesterday",
                    support: k.customers && k.customers.support, icon: "users", tint: "purple", format: "number",
                }),
                kpiCard({
                    label: "Locations Active",
                    value: `${fmt.num(k.locations_active && k.locations_active.value)} / ${fmt.num(k.locations_active && k.locations_active.total)}`,
                    support: k.locations_active && k.locations_active.support,
                    icon: "pin", tint: "amber", format: "fraction",
                }),
            ].join("");

            // coverage note + scope labels
            const note = document.getElementById("coverage-note");
            if (note) note.textContent = ov.coverage_note || "";
            const foot = document.getElementById("foot-coverage");
            if (foot) foot.textContent = ov.coverage_note || "";

            renderPulse(ov);
            renderRecent(ov);
            renderPayments(ov);
            renderTx(ov);
            renderDishesLists(ov.top_dishes || []);
            renderAreas(ov.top_areas || []);
            renderCats(ov.category_mix || []);
        } catch (err) {
            grid.innerHTML = `<div style="grid-column:1/-1">${errorState(err.message)}</div>`;
        }
    }

    /* ---------------- Service pulse ---------------- */
    function renderPulse(ov) {
        const wrap = document.getElementById("pulse-grid");
        const sub = document.getElementById("pulse-sub");
        const pulse = ov.service_pulse || {};
        const channels = pulse.channels || [];
        const colors = ["green", "blue", "amber", "rose"];
        sub.textContent = `${fmt.num(pulse.orders)} order(s) · ${fmt.num(pulse.items_sold)} items sold`;

        if (!channels.length) {
            wrap.innerHTML = emptyState("No service activity", "No orders recorded for this business date.", "clock");
            return;
        }
        wrap.innerHTML = channels.slice(0, 4).map((c, i) => `
            <a class="pulse-tile" href="/orders?channel=${encodeURIComponent(c.name)}">
                <div class="pulse-label">${esc(c.name)}</div>
                <div class="pulse-value ${colors[i % colors.length]}">${fmt.num(c.orders)}</div>
                <div class="pulse-share">${c.share}% of today's orders</div>
            </a>`).join("");
    }

    /* ---------------- Quick access ---------------- */
    function renderQuick() {
        const tiles = [
            { label: "Orders", href: "/orders", ic: "receipt", cls: "rose" },
            { label: "Menu", href: "/menu", ic: "menu-book", cls: "blue" },
            { label: "Payments", href: "/payments", ic: "wallet", cls: "green" },
            { label: "Customers", href: "/customers", ic: "users", cls: "purple" },
            { label: "Locations", href: "/locations", ic: "pin", cls: "amber" },
            { label: "Reports", href: "/reports", ic: "chart", cls: "cyan" },
        ];
        document.getElementById("quick-grid").innerHTML = tiles.map(t => `
            <a class="quick-tile" href="${t.href}">
                <span class="quick-ic ${t.cls}">${icon(t.ic)}</span>
                <span>${esc(t.label)}</span>
            </a>`).join("");
    }

    /* ---------------- Recent orders ---------------- */
    function renderRecent(ov) {
        const list = document.getElementById("recent-orders");
        const sub = document.getElementById("recent-sub");
        let orders = ov.recent_orders || [];
        if (state.recentSort === "amount_desc") orders = [...orders].sort((a, b) => b.total_amount - a.total_amount);
        else if (state.recentSort === "amount_asc") orders = [...orders].sort((a, b) => a.total_amount - b.total_amount);
        sub.textContent = `${orders.length} order(s) shown`;

        if (!orders.length) {
            list.innerHTML = emptyState("No orders on this date", "Try another business date or clear the branch filter.", "receipt");
            return;
        }
        list.innerHTML = orders.map(o => `
            <button class="order-row" data-order="${o.order_id}">
                <span class="order-ic">${icon("receipt")}</span>
                <span class="order-main">
                    <span class="order-title">
                        <span class="order-ref">#${esc(o.order_ref)}</span>
                        <span class="order-chip">${esc(o.city_area || o.restaurant_name || "Venue")}</span>
                    </span>
                    <span class="order-sub">${esc(o.item_summary || [o.order_channel, o.restaurant_type].filter(Boolean).join(" · "))}</span>
                </span>
                <span class="order-side">
                    <span class="order-amount">${fmt.money2(o.total_amount)}</span>
                    ${DQ.statusBadge(o.order_status, o.is_completed)}
                    <span class="order-time">${fmt.relTime(o.order_date, o.order_time, DQ.state.businessDate)}</span>
                </span>
            </button>`).join("");
        list.querySelectorAll("[data-order]").forEach(btn =>
            btn.addEventListener("click", () => DQ.openOrder(btn.dataset.order)));
    }

    /* ---------------- Payment methods ---------------- */
    const PAY_ICONS = { "Cash": "cash", "Card": "card", "Online Wallet": "phone", "Unspecified": "wallet" };

    function renderPayments(ov) {
        const list = document.getElementById("pay-list");
        const totalEl = document.getElementById("pay-total");
        const scope = document.getElementById("payments-scope");
        const rows = ov.payment_methods || [];
        scope.textContent = fmt.dateLabel(DQ.state.businessDate);
        if (!rows.length) {
            list.innerHTML = emptyState("No settled payments", "Nothing collected on this business date.", "wallet");
            totalEl.textContent = "—";
            return;
        }
        list.innerHTML = rows.map(r => `
            <a class="pay-row clickable" href="/payments?method=${encodeURIComponent(r.method)}">
                <span class="pay-ic">${icon(PAY_ICONS[r.method] || "wallet")}</span>
                <span>
                    <span class="pay-name">${esc(r.method)}</span>
                    <span class="pay-meta pay-name" style="font-weight:500">${fmt.num(r.orders)} order(s) · ${r.share}%</span>
                    <span class="pay-bar"><span style="width:${Math.min(r.share, 100)}%"></span></span>
                </span>
                <span class="pay-right"><span class="pay-amount">${fmt.money2(r.total)}</span></span>
            </a>`).join("");
        const total = rows.reduce((a, r) => a + r.total, 0);
        totalEl.textContent = fmt.money2(total);
    }

    /* ---------------- Recent transactions ---------------- */
    function renderTx(ov) {
        const list = document.getElementById("tx-list");
        const sub = document.getElementById("tx-sub");
        const rows = ov.recent_transactions || [];
        sub.textContent = `Settlements on ${fmt.dateLabel(DQ.state.businessDate)}`;
        if (!rows.length) {
            list.innerHTML = emptyState("No transactions", "Payments appear here as orders settle.", "cash");
            return;
        }
        list.innerHTML = rows.map(t => `
            <a class="tx-row" href="/payments?method=${encodeURIComponent(t.method)}">
                <span class="pay-ic">${icon(PAY_ICONS[t.method] || "wallet")}</span>
                <span>
                    <span class="tx-type">${esc(t.type)}</span><br>
                    <span class="tx-sub">Order #${esc(t.order_ref)}</span>
                </span>
                <span class="tx-amount">${fmt.money2(t.amount)}</span>
                <span class="tx-time">${esc(t.time || "")}</span>
                ${t.status === "Paid" ? badge("Paid", "green-solid") : badge(t.status, "red")}
            </a>`).join("");
    }

    /* ---------------- Top dishes / areas / categories ---------------- */
    function renderDishesLists(dishes) {
        const list = document.getElementById("dish-list");
        if (!dishes.length) {
            list.innerHTML = emptyState("No dish sales", "No menu item sales recorded for this range.", "menu-book");
            return;
        }
        list.innerHTML = dishes.slice(0, 5).map(d => `
            <a class="dish-row" href="/menu">
                <span class="dish-rank">#${d.rank}</span>
                <span class="dish-thumb" style="background:${DQ.dishColor(d.menu_item_id || d.item_name)}">${esc(DQ.dishInitial(d.item_name))}</span>
                <span>
                    <span class="dish-name">${esc(d.item_name)}</span><br>
                    <span class="dish-sub">${fmt.num(d.units)} units · ${esc(d.category_name)}</span>
                </span>
                <span class="dish-right"><span class="dish-amount">${fmt.money0(d.revenue)}</span><br>
                    <span class="dish-units">${fmt.num(d.orders)} orders</span></span>
            </a>`).join("");
    }

    function renderAreas(areas) {
        const list = document.getElementById("area-list");
        if (!areas.length) {
            list.innerHTML = emptyState("No area data", "Location ranking is unavailable.", "pin");
            return;
        }
        list.innerHTML = areas.map(a => `
            <a class="area-row" href="/locations">
                <span class="area-rank">#${a.rank}</span>
                <span>
                    <span class="area-name">${esc(a.city_area)}</span><br>
                    <span class="area-sub">${fmt.num(a.orders)} orders · AOV ${fmt.money0(a.avg_order_value)}</span>
                </span>
                <span class="area-amount">${fmt.money0(a.revenue)}</span>
            </a>`).join("");
    }

    function renderCats(cats) {
        const list = document.getElementById("cat-list");
        if (!cats.length) {
            list.innerHTML = emptyState("No category mix", "Category revenue share is unavailable.", "menu-book");
            return;
        }
        list.innerHTML = cats.map(c => `
            <div class="cat-row">
                <div class="cat-top">
                    <span class="cat-name">${esc(c.name)}</span>
                    <span class="cat-share">${c.share !== null ? c.share + "%" : ""} · ${fmt.money0(c.revenue)}</span>
                </div>
                <div class="cat-bar"><span style="width:${Math.min(c.share || 0, 100)}%"></span></div>
            </div>`).join("");
    }

    /* ---------------- Revenue chart ---------------- */
    async function loadRevenue() {
        const wrap = document.getElementById("rev-chart");
        const totalEl = document.getElementById("rev-total");
        const trendEl = document.getElementById("rev-trend");
        const subEl = document.getElementById("rev-sub");
        const srcEl = document.getElementById("rev-source");
        wrap.innerHTML = DQ.skeletonBlocks(2);
        totalEl.textContent = "—";
        trendEl.textContent = "";
        try {
            const s = await api.get("/api/v1/dashboard/revenue-series", {
                range: state.revRange, location_id: locParam(), date: dateParam(),
            });
            totalEl.textContent = fmt.money0(s.total);
            const t = fmt.trend(s.trend_pct);
            trendEl.className = "rev-trend " + t.cls;
            trendEl.textContent = s.trend_pct === null || s.trend_pct === undefined
                ? "no comparison period"
                : `${t.text} vs previous ${state.revRange === "today" ? "day" : "period"}`;
            subEl.textContent = state.revRange === "today"
                ? "Hourly breakdown"
                : state.revRange === "year"
                    ? "Monthly breakdown (population aggregate)"
                    : `Daily breakdown · ${fmt.num(s.orders)} orders`;
            srcEl.textContent = s.source ? `Source: ${s.source}` : "";
            DQ.charts.areaLine(wrap, s.points, {
                aria: `Revenue for ${state.revRange}`,
                tension: 0.3,
            });
        } catch (err) {
            wrap.innerHTML = errorState(err.message);
        }
    }

    async function loadDishes() {
        const list = document.getElementById("dish-list");
        setLoading(list, 5);
        try {
            const d = await api.get("/api/v1/dashboard/dishes", {
                range: state.dishesRange, location_id: locParam(), date: dateParam(), limit: 5,
            });
            document.getElementById("dishes-sub").textContent =
                `Ranked by revenue · ${fmt.num(d.total)} dishes in range`;
            renderDishesLists(d.items || []);
        } catch (err) {
            list.innerHTML = errorState(err.message);
        }
    }

    /* ---------------- Wiring ---------------- */
    function syncDateInputs() {
        ["asof-date", "settings-date"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = DQ.state.businessDate || "";
                if (DQ.state.minDate) el.min = DQ.state.minDate;
                if (DQ.state.maxDate) el.max = DQ.state.maxDate;
            }
        });
    }

    function shiftDate(days) {
        const base = new Date((DQ.state.businessDate || DQ.state.maxDate) + "T12:00:00");
        base.setDate(base.getDate() + days);
        const iso = base.toISOString().slice(0, 10);
        if (DQ.state.minDate && iso < DQ.state.minDate) return;
        if (DQ.state.maxDate && iso > DQ.state.maxDate) return;
        DQ.state.businessDate = iso;
        DQ.refreshView("overview");
    }

    DQ.registerView("overview",
        function init() {
            renderQuick();
            syncDateInputs();

            document.getElementById("asof-date").addEventListener("change", (e) => {
                if (e.target.value) { DQ.state.businessDate = e.target.value; DQ.refreshView("overview"); }
            });
            document.getElementById("asof-prev").addEventListener("click", () => shiftDate(-1));
            document.getElementById("asof-next").addEventListener("click", () => shiftDate(1));
            document.getElementById("asof-latest").addEventListener("click", () => {
                DQ.state.businessDate = DQ.state.maxDate;
                DQ.refreshView("overview");
            });

            document.getElementById("recent-sort").addEventListener("change", (e) => {
                state.recentSort = e.target.value;
                loadKpis(); // cheap full reload keeps one code path
            });

            document.getElementById("dishes-range").addEventListener("change", (e) => {
                state.dishesRange = e.target.value;
                loadDishes();
            });

            document.querySelectorAll("#rev-range button").forEach(btn => {
                btn.addEventListener("click", () => {
                    document.querySelectorAll("#rev-range button").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    state.revRange = btn.dataset.range;
                    loadRevenue();
                });
            });
        },
        function refresh() {
            loadKpis();
            loadRevenue();
            loadDishes();
        });

    DQ.syncDateInputs = syncDateInputs;
})();
