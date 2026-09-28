





(function () {
    "use strict";

    const DQ = window.DQ;
    const { api, fmt, esc, icon, badge, emptyState, errorState } = DQ;

    const LOCATION_KEY = "dq-home-location";
    const el = (id) => document.getElementById(id);
    const rootEl = () => el("view-home");
    const roleOf = () => (rootEl() && rootEl().dataset.role) || "Administrator";


    function kpiCard({ label, value, support, trendPct, ic, tint, hero }) {
        const trend = fmt.trend(trendPct, "vs prior day");
        return `<div class="kpi ${hero ? "hero" : ""}">
            <div class="kpi-label">${esc(label)}</div>
            ${ic ? `<div class="kpi-ic ${hero ? "" : "kpi-icon-tint " + (tint || "")}">${icon(ic)}</div>` : ""}
            <div class="kpi-value">${value}</div>
            <div class="kpi-support">
                ${trendPct !== null && trendPct !== undefined ? `<span class="kpi-trend ${trend.cls}">${esc(trend.text)}</span>` : ""}
                <span>${esc(support || "")}</span>
            </div>
        </div>`;
    }

    function skeletonKpis(n) {
        el("home-kpis").innerHTML = Array.from({ length: n || 4 }).map(() =>
            `<div class="kpi"><div class="skeleton sk-line" style="width:50%"></div>
             <div class="skeleton" style="height:28px;width:70%;margin-top:10px"></div>
             <div class="skeleton sk-line" style="width:60%"></div></div>`).join("");
    }


    async function fill(id, loader) {
        const target = el(id);
        if (!target) return;
        DQ.setLoading(target, 3);
        try {
            const html = await loader();
            target.innerHTML = html;
        } catch (err) {
            target.innerHTML = errorState(err && err.message);
        }
    }

    function renderQuick(tiles) {
        const grid = el("home-quick");
        if (!grid) return;
        grid.innerHTML = tiles.map(t => `
            <a class="quick-tile" href="${t.href}">
                <span class="quick-ic ${t.cls}">${icon(t.ic)}</span>
                <span>${esc(t.label)}</span>
            </a>`).join("");
    }

    function alertsHtml(payload) {
        const items = (payload && payload.items) || [];
        if (!items.length) return emptyState("No open alerts", "Nothing needs attention right now.", "check");
        const kind = { danger: "red", warn: "amber", info: "blue" };
        return items.slice(0, 6).map(a => `
            <a class="alert-item clickable" href="${esc(a.href || "#")}">
                ${badge(a.level === "danger" ? "Critical" : a.level === "warn" ? "Warning" : "Info", kind[a.level] || "gray")}
                <span class="alert-body">
                    <div class="alert-title">${esc(a.title)}</div>
                    <div class="alert-text">${esc(a.body)}</div>
                </span>
            </a>`).join("");
    }

    function stepsHtml(payload) {
        const steps = (payload && payload.steps) || [];
        if (!steps.length) return emptyState("No pipeline runs", "Pipeline status is unavailable.", "cpu");
        return steps.map(s => `
            <div class="pay-row">
                <span class="pay-ic">${icon("cpu")}</span>
                <span class="pay-meta">
                    <span class="pay-name">${esc(s.name)}</span>
                    <span class="pay-sub">${esc(s.detail || "")}</span>
                </span>
                <span class="pay-right">${badge(String(s.status || "unknown").toUpperCase(), s.status === "ok" ? "green" : "amber")}</span>
            </div>`).join("");
    }

    function when(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "—";
        return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }




    const ROLE_ORDER = ["Administrator", "Regional Manager", "Restaurant Manager", "Data Analyst"];

    async function loadAdmin() {
        skeletonKpis(4);
        const [users, status, alerts, pipe] = await Promise.allSettled([
            api.get("/api/v1/auth/users"),
            api.get("/api/v1/status"),
            api.get("/api/v1/dashboard/alerts"),
            api.get("/api/v1/pipeline/status"),
        ]);
        const list = users.status === "fulfilled" ? (users.value.users || []) : null;
        const counts = {};
        (list || []).forEach(u => { counts[u.role] = (counts[u.role] || 0) + 1; });

        el("home-kpis").innerHTML = [
            kpiCard({ label: "Accounts", value: list ? fmt.num(list.length) : "—", ic: "users", tint: "blue", hero: true,
                support: list ? `${fmt.num(counts["Administrator"] || 0)} administrator(s)` : "Could not load accounts" }),
            kpiCard({ label: "Service status", ic: "shield", tint: "green",
                value: status.status === "fulfilled" ? esc(status.value.status) : "—",
                support: status.status === "fulfilled" ? `${status.value.engine} · agreement ${status.value.dual_pipeline_agreement}` : "Status unavailable" }),
            kpiCard({ label: "Open alerts", ic: "alert", tint: "amber",
                value: alerts.status === "fulfilled" ? fmt.num((alerts.value.items || []).length) : "—",
                support: "Raised by the analytics pipeline" }),
            kpiCard({ label: "Last pipeline run", ic: "clock", tint: "purple",
                value: pipe.status === "fulfilled" && pipe.value.last_processing_run ? esc(String(pipe.value.last_processing_run).slice(0, 10)) : "—",
                support: pipe.status === "fulfilled" && pipe.value.last_processing_run ? String(pipe.value.last_processing_run).slice(11, 16) + " · processing complete" : "No run recorded" }),
        ].join("");


        const roles = el("home-roles");
        if (list) {
            const total = list.length || 1;
            roles.innerHTML = ROLE_ORDER.map(r => {
                const n = counts[r] || 0;
                return `<div class="cat-row"><div class="cat-top"><span class="cat-name">${esc(r)}</span>
                    <span class="cat-share">${fmt.num(n)} account(s)</span></div>
                    <div class="cat-bar"><span style="width:${Math.round(n / total * 100)}%"></span></div></div>`;
            }).join("");
        } else {
            roles.innerHTML = errorState(users.reason && users.reason.message);
        }

        el("home-alerts").innerHTML = alerts.status === "fulfilled" ? alertsHtml(alerts.value) : errorState(alerts.reason && alerts.reason.message);
        el("home-steps").innerHTML = pipe.status === "fulfilled" ? stepsHtml(pipe.value) : errorState(pipe.reason && pipe.reason.message);

        await fill("home-audit", async () => {
            const res = await api.get("/api/v1/audit", { limit: 8 });
            const items = res.items || [];
            if (!items.length) return emptyState("No activity yet", "Audit entries appear as people sign in and change data.", "doc");
            return items.map(a => `
                <div class="tx-row">
                    <span class="pay-ic">${icon("doc")}</span>
                    <span><span class="tx-type">${esc(String(a.action || "").replace(/_/g, " "))}</span><br>
                        <span class="tx-sub">${esc(a.actor_email || "anonymous")} · ${esc(a.actor_role || "")}</span></span>
                    <span class="tx-time">${esc(when(a.created_at))}</span>
                    ${a.status === "success" ? badge("OK", "green") : badge(a.status || "?", "red")}
                </div>`).join("");
        });

        renderQuick([
            { label: "Team & access", href: "/team", ic: "users", cls: "purple" },
            { label: "Data management", href: "/data", ic: "doc", cls: "blue" },
            { label: "Models & serving", href: "/models", ic: "cpu", cls: "green" },
            { label: "Data quality", href: "/quality", ic: "shield", cls: "amber" },
            { label: "Reports", href: "/reports", ic: "chart", cls: "cyan" },
            { label: "Executive dashboard", href: "/overview", ic: "grid", cls: "rose" },
        ]);
    }




    async function loadRegional() {
        skeletonKpis(4);
        try {
            const ov = await api.get("/api/v1/dashboard/overview");
            const k = ov.kpis || {};
            const note = el("home-note");
            note.textContent = `All locations · ${ov.as_of_label || ""}`;
            note.hidden = false;
            el("home-kpis").innerHTML = [
                kpiCard({ label: "Revenue", value: fmt.money0(k.revenue && k.revenue.value), ic: "wallet", hero: true,
                    trendPct: k.revenue && k.revenue.trend_pct, support: k.revenue && k.revenue.support }),
                kpiCard({ label: "Orders", value: fmt.num(k.orders && k.orders.value), ic: "receipt", tint: "blue",
                    trendPct: k.orders && k.orders.trend_pct, support: k.orders && k.orders.support }),
                kpiCard({ label: "Average order value", value: fmt.money0(k.aov && k.aov.value), ic: "trend", tint: "green",
                    trendPct: k.aov && k.aov.trend_pct, support: k.aov && k.aov.support }),
                kpiCard({ label: "Locations trading", ic: "pin", tint: "amber",
                    value: k.locations_active ? `${fmt.num(k.locations_active.value)} / ${fmt.num(k.locations_active.total)}` : "—",
                    support: k.locations_active && k.locations_active.support }),
            ].join("");
        } catch (err) {
            el("home-kpis").innerHTML = `<div style="grid-column:1/-1">${errorState(err.message)}</div>`;
        }

        await Promise.all([
            fill("home-locations", async () => {
                const res = await api.get("/api/v1/dashboard/locations");
                const rows = (res.rows || []).slice(0, 8);
                if (!rows.length) return emptyState("No location data", "Location ranking is unavailable.", "pin");
                el("home-loc-sub").textContent = `Top ${rows.length} of ${(res.rows || []).length} locations by revenue`;
                return rows.map(a => `
                    <a class="area-row" href="/locations">
                        <span class="area-rank">#${a.rank}</span>
                        <span><span class="area-name">${esc(a.city_area)}</span><br>
                            <span class="area-sub">${fmt.num(a.orders)} orders · AOV ${fmt.money0(a.avg_order_value)}</span></span>
                        <span class="area-amount">${fmt.money0(a.revenue)}</span>
                    </a>`).join("");
            }),
            fill("home-channels", async () => {
                const res = await api.get("/api/v1/dashboard/channels");
                const rows = res.rows || [];
                if (!rows.length) return emptyState("No channel data", "Channel revenue is unavailable.", "globe");
                const total = rows.reduce((a, r) => a + (r.revenue || 0), 0) || 1;
                return rows.map(r => {
                    const share = (r.revenue || 0) / total * 100;
                    return `<div class="cat-row"><div class="cat-top"><span class="cat-name">${esc(r.channel)}</span>
                        <span class="cat-share">${share.toFixed(1)}% · ${fmt.money0(r.revenue)}</span></div>
                        <div class="cat-bar"><span style="width:${Math.min(share, 100)}%"></span></div></div>`;
                }).join("");
            }),
            fill("home-alerts", async () => alertsHtml(await api.get("/api/v1/dashboard/alerts"))),
        ]);

        renderQuick([
            { label: "Locations", href: "/locations", ic: "pin", cls: "amber" },
            { label: "Channels", href: "/channels", ic: "globe", cls: "blue" },
            { label: "Promotions", href: "/promotions", ic: "tag", cls: "rose" },
            { label: "Demand forecast", href: "/forecast", ic: "chart", cls: "green" },
            { label: "Reports", href: "/reports", ic: "doc", cls: "cyan" },
            { label: "Executive dashboard", href: "/overview", ic: "grid", cls: "purple" },
        ]);
    }




    const PAY_ICONS = { "Cash": "cash", "Card": "card", "Online Wallet": "phone", "Unspecified": "wallet" };

    function savedLocation() {
        try { return localStorage.getItem(LOCATION_KEY) || ""; } catch (_) { return ""; }
    }

    async function ensureLocations() {
        const select = el("home-location");
        if (!select || select.dataset.ready) return;
        select.dataset.ready = "1";
        try {
            const meta = await api.get("/api/v1/dashboard/meta");
            const locations = (meta.locations || []).slice()
                .sort((a, b) => String(a.city_area).localeCompare(String(b.city_area), undefined, { numeric: true }));
            select.innerHTML = locations.map(l =>
                `<option value="${esc(l.location_id)}">${esc(l.city_area)}</option>`).join("");
            const saved = savedLocation();
            if (saved && locations.some(l => String(l.location_id) === saved)) select.value = saved;
            select.addEventListener("change", () => {
                try { localStorage.setItem(LOCATION_KEY, select.value); } catch (_) {  }
                loadRestaurant();
            });
        } catch (err) {
            select.innerHTML = `<option value="">Locations unavailable</option>`;
        }
    }

    async function loadRestaurant() {
        await ensureLocations();
        const select = el("home-location");
        const locationId = select ? select.value : "";
        if (!locationId) {
            el("home-kpis").innerHTML = `<div style="grid-column:1/-1">${emptyState("Choose your location", "Pick your restaurant location to see its sales.", "pin")}</div>`;
            return;
        }
        skeletonKpis(4);
        let ov;
        try {
            ov = await api.get("/api/v1/dashboard/overview", { location_id: locationId });
        } catch (err) {
            el("home-kpis").innerHTML = `<div style="grid-column:1/-1">${errorState(err.message)}</div>`;
            return;
        }
        DQ.state.businessDate = ov.as_of || DQ.state.businessDate;
        const k = ov.kpis || {};
        const loc = ov.location || {};
        const note = el("home-note");
        note.textContent = `${loc.city_area || "Location"} · business date ${ov.as_of_label || ""}`;
        note.hidden = false;

        el("home-kpis").innerHTML = [
            kpiCard({ label: "Today's revenue", value: fmt.money0(k.revenue && k.revenue.value), ic: "wallet", hero: true,
                trendPct: k.revenue && k.revenue.trend_pct, support: k.revenue && k.revenue.support }),
            kpiCard({ label: "Orders", value: fmt.num(k.orders && k.orders.value), ic: "receipt", tint: "blue",
                trendPct: k.orders && k.orders.trend_pct, support: k.orders && k.orders.support }),
            kpiCard({ label: "Average order value", value: fmt.money0(k.aov && k.aov.value), ic: "trend", tint: "green",
                trendPct: k.aov && k.aov.trend_pct, support: k.aov && k.aov.support }),
            kpiCard({ label: "Guests served", value: fmt.num(k.customers && k.customers.value), ic: "users", tint: "purple",
                trendPct: k.customers && k.customers.trend_pct, support: k.customers && k.customers.support }),
        ].join("");


        const orders = ov.recent_orders || [];
        const list = el("home-orders");
        el("home-orders-sub").textContent = `${orders.length} recent order(s)`;
        list.innerHTML = orders.length ? orders.map(o => `
            <button class="order-row" type="button" data-order="${o.order_id}">
                <span class="order-ic">${icon("receipt")}</span>
                <span class="order-main">
                    <span class="order-title"><span class="order-ref">#${esc(o.order_ref)}</span></span>
                    <span class="order-sub">${esc(o.item_summary || [o.order_channel, o.restaurant_type].filter(Boolean).join(" · "))}</span>
                </span>
                <span class="order-side">
                    <span class="order-amount">${fmt.money2(o.total_amount)}</span>
                    ${DQ.statusBadge(o.order_status, o.is_completed)}
                </span>
            </button>`).join("") : emptyState("No orders on this date", "Nothing recorded for this location yet.", "receipt");
        list.querySelectorAll("[data-order]").forEach(btn =>
            btn.addEventListener("click", () => DQ.openOrder && DQ.openOrder(btn.dataset.order)));


        const dishes = (ov.top_dishes || []).slice(0, 5);
        el("home-dishes").innerHTML = dishes.length ? dishes.map((d, i) => `
            <a class="dish-row" href="/menu">
                <span class="dish-rank">#${d.rank || i + 1}</span>
                <span class="dish-thumb" style="background:${DQ.dishColor(d.menu_item_id || d.item_name)}">${esc(DQ.dishInitial(d.item_name))}</span>
                <span><span class="dish-name">${esc(d.item_name)}</span><br>
                    <span class="dish-sub">${fmt.num(d.units)} units${d.category_name ? " · " + esc(d.category_name) : ""}</span></span>
                <span class="dish-right"><span class="dish-amount">${fmt.money0(d.revenue)}</span></span>
            </a>`).join("") : emptyState("No dish sales", "No menu sales recorded for this location.", "menu-book");


        const pays = ov.payment_methods || [];
        el("home-pay-sub").textContent = `Settled tenders on ${fmt.dateLabel(ov.as_of)}`;
        el("home-pay").innerHTML = pays.length ? pays.map(r => `
            <a class="pay-row clickable" href="/payments?method=${encodeURIComponent(r.method)}">
                <span class="pay-ic">${icon(PAY_ICONS[r.method] || "wallet")}</span>
                <span class="pay-meta">
                    <span class="pay-name">${esc(r.method)}</span>
                    <span class="pay-sub">${fmt.num(r.orders)} order(s) · ${r.share}%</span>
                    <span class="pay-bar"><span style="width:${Math.min(r.share, 100)}%"></span></span>
                </span>
                <span class="pay-right"><span class="pay-amount">${fmt.money2(r.total)}</span></span>
            </a>`).join("") : emptyState("No settled payments", "Nothing collected on this business date.", "wallet");

        renderQuick([
            { label: "Orders", href: "/orders", ic: "receipt", cls: "rose" },
            { label: "Wastage & stock", href: "/inventory", ic: "box", cls: "amber" },
            { label: "Menu", href: "/menu", ic: "menu-book", cls: "blue" },
            { label: "Promotions", href: "/promotions", ic: "tag", cls: "purple" },
            { label: "Peak periods", href: "/peak", ic: "clock", cls: "green" },
            { label: "Recommendations", href: "/recommendations", ic: "spark", cls: "cyan" },
        ]);
    }




    async function loadAnalyst() {
        skeletonKpis(4);
        const [status, forecast, anomalies, meta, pipe, alerts] = await Promise.allSettled([
            api.get("/api/v1/status"),
            api.get("/api/v1/dashboard/forecast"),
            api.get("/api/v1/dashboard/anomalies"),
            api.get("/api/v1/dashboard/meta"),
            api.get("/api/v1/pipeline/status"),
            api.get("/api/v1/dashboard/alerts"),
        ]);
        const ok = (r) => r.status === "fulfilled";
        const evalRow = ok(forecast) ? (forecast.value.evaluation || [])[0] : null;
        const quarantine = ok(meta) ? Object.values(meta.value.quarantine || {}).reduce((a, n) => a + (Number(n) || 0), 0) : null;

        el("home-kpis").innerHTML = [
            kpiCard({ label: "Forecast error (MAPE)", ic: "chart", hero: true,
                value: evalRow && evalRow.mape !== null && evalRow.mape !== undefined ? fmt.pct(evalRow.mape, 1) : "—",
                support: evalRow ? String(evalRow.model).split("(")[0].trim() : "Forecast evaluation unavailable" }),
            kpiCard({ label: "Dual-pipeline agreement", ic: "cpu", tint: "green",
                value: ok(status) ? esc(status.value.dual_pipeline_agreement) : "—",
                support: ok(status) ? `Serving latency ${status.value.nfr_latency_ms} ms` : "Status unavailable" }),
            kpiCard({ label: "Anomalies flagged", ic: "alert", tint: "amber",
                value: ok(anomalies) ? fmt.num(anomalies.value.count) : "—", support: "Sales and rating deviations" }),
            kpiCard({ label: "Quarantined rows", ic: "shield", tint: "purple",
                value: quarantine === null ? "—" : fmt.num(quarantine), support: "Parked by the data-quality pipeline" }),
        ].join("");


        const fc = el("home-forecast");
        if (ok(forecast)) {
            const pts = (forecast.value.points || []).slice(-7);
            el("home-forecast-sub").textContent = `Latest ${pts.length} day(s) · horizon ${forecast.value.horizon || "—"} days`;
            fc.innerHTML = pts.length ? pts.map(p => `
                <div class="tx-row">
                    <span class="pay-ic">${icon("chart")}</span>
                    <span><span class="tx-type">${esc(fmt.dateLabel(p.date))}</span><br>
                        <span class="tx-sub">${p.actual_sales !== null && p.actual_sales !== undefined ? "Actual " + fmt.moneyCompact(p.actual_sales) : "Forecast only"}</span></span>
                    <span class="tx-amount">${fmt.moneyCompact(p.python_model_prediction)}</span>
                    ${p.in_sample ? badge("In-sample", "gray") : badge("Held out", "blue")}
                </div>`).join("") : emptyState("No forecast points", "The forecast layer is unavailable.", "chart");
        } else {
            fc.innerHTML = errorState(forecast.reason && forecast.reason.message);
        }


        const an = el("home-anomalies");
        if (ok(anomalies)) {
            const rows = (anomalies.value.sales || []).slice()
                .sort((a, b) => Math.abs(b.z_score || 0) - Math.abs(a.z_score || 0)).slice(0, 6);
            an.innerHTML = rows.length ? rows.map(a => `
                <a class="tx-row" href="/anomalies">
                    <span class="pay-ic">${icon("alert")}</span>
                    <span><span class="tx-type">${esc(String(a.entity || "").replace(/_/g, " "))}</span><br>
                        <span class="tx-sub">${esc(a.period || "")} · ${esc(a.note || "")}</span></span>
                    <span class="tx-amount">${a.z_score !== null && a.z_score !== undefined ? "z " + Number(a.z_score).toFixed(1) : ""}</span>
                </a>`).join("") : emptyState("No anomalies", "No sales deviations were flagged.", "check");
        } else {
            an.innerHTML = errorState(anomalies.reason && anomalies.reason.message);
        }

        el("home-steps").innerHTML = ok(pipe) ? stepsHtml(pipe.value) : errorState(pipe.reason && pipe.reason.message);
        el("home-alerts").innerHTML = ok(alerts) ? alertsHtml(alerts.value) : errorState(alerts.reason && alerts.reason.message);

        renderQuick([
            { label: "Demand forecast", href: "/forecast", ic: "chart", cls: "green" },
            { label: "Anomalies", href: "/anomalies", ic: "alert", cls: "amber" },
            { label: "Models & serving", href: "/models", ic: "cpu", cls: "blue" },
            { label: "Data quality", href: "/quality", ic: "shield", cls: "purple" },
            { label: "What-if scenarios", href: "/whatif", ic: "sliders", cls: "rose" },
            { label: "Reports", href: "/reports", ic: "doc", cls: "cyan" },
        ]);
    }


    const LOADERS = {
        "Administrator": loadAdmin,
        "Regional Manager": loadRegional,
        "Restaurant Manager": loadRestaurant,
        "Data Analyst": loadAnalyst,
    };

    DQ.registerView("home",
        function init() {
            const refresh = el("home-refresh");
            if (refresh) refresh.addEventListener("click", () => DQ.refreshView("home"));
        },
        function refresh() {
            const loader = LOADERS[roleOf()] || loadAdmin;
            return loader();
        });
})();
