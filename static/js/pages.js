/* ============================================================
   DineIQ Dashboard — secondary views + order detail modal
   ============================================================ */
(function () {
    "use strict";

    const DQ = window.DQ;
    const { api, fmt, esc, icon, badge, setLoading, emptyState, errorState, renderPager } = DQ;

    function locParam() { return DQ.state.locationId === "all" ? undefined : DQ.state.locationId; }
    function dateParam() { return DQ.state.businessDate; }

    function kpiMini(label, value, support) {
        return `<div class="kpi"><div class="kpi-label">${esc(label)}</div>
            <div class="kpi-value">${value}</div>
            <div class="kpi-support">${esc(support || "")}</div></div>`;
    }

    function riskBadge(risk) {
        if (risk === "high") return badge("High risk", "red");
        if (risk === "medium") return badge("Medium", "amber");
        if (risk === "low") return badge("Low", "green");
        return badge("Unknown", "gray");
    }

    function classBadge(cls) {
        const map = {
            "Profit Driver": "green-solid",
            "Volume Driver": "blue",
            "Hidden Opportunity": "amber",
            "Low Performer": "red",
        };
        return badge(cls || "—", map[cls] || "gray");
    }

    /* ================= Order detail modal ================= */
    DQ.openOrder = async function (orderId) {
        document.getElementById("order-modal-title").textContent = `Order DQ-${String(orderId).padStart(4, "0")}`;
        const body = document.getElementById("order-modal-body");
        body.innerHTML = DQ.skeleton(6);
        DQ.openModal("modal-order");
        try {
            const o = await api.get(`/api/v1/dashboard/orders/${orderId}`);
            const cells = [
                ["Placed", `${fmt.dateLabel(o.order_date)} · ${esc(o.order_time || "")}`],
                ["Status", DQ.statusBadge(o.order_status, o.is_completed)],
                ["Guest", `#${esc(o.customer_id)}`],
                ["Venue", `${esc(o.restaurant_name || "—")}<br><span class="muted">${esc(o.city_area || "")} · ${esc(o.restaurant_type || "")}</span>`],
                ["Channel", esc(o.order_channel || "—")],
                ["Payment", esc(o.payment_method || "—")],
                ["Promotion", esc(o.promotion_name || "None")],
                ["Total", `<strong>${fmt.money2(o.total_amount)}</strong>`],
            ];
            let lines = "";
            if (o.lines && o.lines.length) {
                lines = `<table class="table table-compact"><thead><tr>
                    <th>Item</th><th>Category</th><th class="num">Qty</th>
                    <th class="num">Unit</th><th class="num">Line total</th><th class="num">Contribution</th>
                </tr><tbody>` + o.lines.map(l => `<tr style="cursor:default">
                    <td class="cell-strong">${esc(l.item_name)}</td>
                    <td>${esc(l.category_name || "—")}</td>
                    <td class="num">${fmt.num(l.quantity)}</td>
                    <td class="num">${fmt.money2(l.unit_price)}</td>
                    <td class="num">${fmt.money2(l.line_total)}</td>
                    <td class="num">${fmt.money2(l.contribution)}</td>
                </tr>`).join("") + `</tbody></table>`;
            } else {
                lines = emptyState("Line items not in sample",
                    o.lines_note || "This order's line detail sits outside the loaded evidence slice.", "doc");
            }
            body.innerHTML = `
                <div class="detail-grid">
                    ${cells.map(([k, v]) => `<div class="detail-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
                </div>
                <h4 style="margin-bottom:8px;font-size:13.5px">Order lines</h4>
                ${lines}`;
        } catch (err) {
            body.innerHTML = errorState(err.message);
        }
    };

    /* ================= ORDERS ================= */
    const orders = { page: 1, q: "", status: "", channel: "", payment: "", sort: "recent" };

    async function loadOrders() {
        const tbody = document.getElementById("orders-tbody");
        setLoading(tbody, 8);
        try {
            const r = await api.get("/api/v1/dashboard/orders", {
                location_id: locParam(), q: orders.q, status: orders.status,
                channel: orders.channel, payment: orders.payment,
                sort: orders.sort, page: orders.page, page_size: 12,
            });
            document.getElementById("orders-kpis").innerHTML = [
                kpiMini("Orders in view", fmt.num(r.stats.orders), "matching current filters"),
                kpiMini("Revenue in view", fmt.money0(r.stats.revenue), "completed orders"),
                kpiMini("Avg Order Value", fmt.money0(r.stats.aov), "per completed order"),
            ].join("");
            if (!r.items.length) {
                tbody.innerHTML = `<tr><td colspan="8">${emptyState("No orders found", "Try adjusting the filters or business date.", "receipt")}</td></tr>`;
                renderPager(document.getElementById("orders-pager"), null, () => {});
                return;
            }
            tbody.innerHTML = r.items.map(o => `
                <tr data-order="${o.order_id}">
                    <td class="cell-strong">#${esc(o.order_ref)}</td>
                    <td>#${esc(o.customer_id)}</td>
                    <td>${esc(o.city_area || "—")}<div class="cell-sub">${esc(o.restaurant_name || "")}</div></td>
                    <td>${esc(o.order_channel || "—")}</td>
                    <td>${esc(o.payment_method || "—")}</td>
                    <td class="num cell-strong">${fmt.money2(o.total_amount)}</td>
                    <td>${DQ.statusBadge(o.order_status, o.is_completed)}</td>
                    <td>${fmt.dateLabel(o.order_date)}<div class="cell-sub">${esc(o.order_time || "")}</div></td>
                </tr>`).join("");
            tbody.querySelectorAll("[data-order]").forEach(tr =>
                tr.addEventListener("click", () => DQ.openOrder(tr.dataset.order)));
            renderPager(document.getElementById("orders-pager"), r, (p) => {
                orders.page = p;
                loadOrders();
            });
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="8">${errorState(err.message)}</td></tr>`;
        }
    }

    function fillOrderFilters() {
        const meta = DQ.state.meta || {};
        (meta.statuses || []).forEach(s => {
            document.getElementById("orders-status").insertAdjacentHTML("beforeend",
                `<option value="${esc(s)}">${esc(s)}</option>`);
        });
        (meta.channels || []).forEach(s => {
            document.getElementById("orders-channel").insertAdjacentHTML("beforeend",
                `<option value="${esc(s)}">${esc(s)}</option>`);
        });
        (meta.payment_methods || []).forEach(s => {
            document.getElementById("orders-payment").insertAdjacentHTML("beforeend",
                `<option value="${esc(s)}">${esc(s)}</option>`);
        });
        // deep links
        const ch = DQ.queryParam("channel");
        if (ch) { orders.channel = ch; document.getElementById("orders-channel").value = ch; }
    }

    /* ================= MENU ================= */
    const menuState = { q: "", range: "all" };

    async function loadMenu() {
        const tbody = document.getElementById("dishes-tbody");
        const ctbody = document.getElementById("classes-tbody");
        const xt = document.getElementById("combos-tbody");
        setLoading(tbody, 6); setLoading(ctbody, 6); setLoading(xt, 5);
        try {
            const [d, intel] = await Promise.all([
                api.get("/api/v1/dashboard/dishes", {
                    q: menuState.q, range: menuState.range,
                    location_id: locParam(), date: dateParam(),
                }),
                api.get("/api/v1/dashboard/menu-intelligence"),
            ]);
            if (!d.items.length) {
                tbody.innerHTML = `<tr><td colspan="6">${emptyState("No dishes found", "No menu item sales for this range.", "menu-book")}</td></tr>`;
            } else {
                tbody.innerHTML = d.items.slice(0, 30).map(x => `
                    <tr style="cursor:default">
                        <td class="num muted">#${x.rank}</td>
                        <td class="cell-strong">${esc(x.item_name)}</td>
                        <td>${esc(x.category_name || "—")}</td>
                        <td class="num">${fmt.num(x.units)}</td>
                        <td class="num cell-strong">${fmt.money0(x.revenue)}</td>
                        <td class="num">${fmt.money0(x.contribution)}</td>
                    </tr>`).join("");
            }

            const classes = intel.classes || [];
            const counts = {};
            classes.forEach(c => counts[c.actual_class] = (counts[c.actual_class] || 0) + 1);
            document.getElementById("class-legend").innerHTML =
                Object.entries(counts).map(([k, v]) => `${classBadge(k)} <span class="muted">${v}</span>`).join(" ");
            if (!classes.length) {
                ctbody.innerHTML = `<tr><td colspan="5">${emptyState("No class results", "Menu classification evidence is unavailable.", "star")}</td></tr>`;
            } else {
                ctbody.innerHTML = classes.slice(0, 30).map(c => `
                    <tr style="cursor:default">
                        <td class="cell-strong">${esc(c.item_name || ("Menu Item " + c.menu_item_id))}
                            ${c.match === false ? badge("disagree", "amber") : ""}</td>
                        <td class="num">${fmt.num(c.units_sold)}</td>
                        <td class="num">${c.profit_margin_percentage != null ? Number(c.profit_margin_percentage).toFixed(1) + "%" : "—"}</td>
                        <td class="num">${c.average_rating != null ? Number(c.average_rating).toFixed(2) : "—"}</td>
                        <td>${classBadge(c.actual_class)}</td>
                    </tr>`).join("");
            }

            const combos = intel.combos || [];
            if (!combos.length) {
                xt.innerHTML = `<tr><td colspan="3">${emptyState("No combos", "Market-basket evidence is unavailable.", "bag")}</td></tr>`;
            } else {
                xt.innerHTML = combos.slice(0, 12).map(c => `
                    <tr style="cursor:default">
                        <td class="cell-strong">${esc(c.item_a_name)} + ${esc(c.item_b_name)}
                            <div class="cell-sub">Venue #${esc(c.restaurant_id)}</div></td>
                        <td class="num">${fmt.num(c.orders_with_combo)}</td>
                        <td class="num">${c.lift != null ? Number(c.lift).toFixed(3) : "—"}</td>
                    </tr>`).join("");
            }
            DQ.renderCatList(document.getElementById("menu-cat-list"), intel.categories || []);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6">${errorState(err.message)}</td></tr>`;
        }
    }

    DQ.renderCatList = function (list, cats) {
        if (!cats.length) {
            list.innerHTML = emptyState("No category mix", "Category revenue share is unavailable.", "menu-book");
            return;
        }
        list.innerHTML = cats.map(c => {
            const share = c.share != null ? (c.share <= 1 ? c.share * 100 : c.share) : 0;
            return `<div class="cat-row">
                <div class="cat-top">
                    <span class="cat-name">${esc(c.category_name || c.name)}</span>
                    <span class="cat-share">${share.toFixed(1)}% · ${fmt.money0(c.revenue)}</span>
                </div>
                <div class="cat-bar"><span style="width:${Math.min(share, 100)}%"></span></div>
            </div>`;
        }).join("");
    };

    /* ================= INVENTORY ================= */
    async function loadInventory() {
        const tbody = document.getElementById("wastage-tbody");
        setLoading(tbody, 6);
        document.getElementById("inv-chart-1").src = "/api/v1/charts/13_wastage_risk.png";
        document.getElementById("inv-chart-2").src = "/api/v1/charts/15_slow_moving_items.png";
        try {
            const inv = await api.get("/api/v1/dashboard/inventory");
            const items = (inv.wastage_items || []).slice(0, 15);
            if (!items.length) {
                tbody.innerHTML = `<tr><td colspan="5">${emptyState("No wastage signals", "Run the analytics pipeline to populate wastage ratios.", "box")}</td></tr>`;
            } else {
                tbody.innerHTML = items.map(w => `
                    <tr style="cursor:default">
                        <td class="cell-strong">${esc(w.item_name || ("Menu Item " + w.menu_item_id))}
                            <div class="cell-sub">Venue #${esc(w.restaurant_id)}</div></td>
                        <td class="num">${w.wastage_ratio != null ? (Number(w.wastage_ratio) * 100).toFixed(1) + "%" : "—"}</td>
                        <td class="num">${fmt.num(w.units_sold)}</td>
                        <td class="num">${fmt.money0(w.revenue)}</td>
                        <td>${classBadge(w.actual_class)}</td>
                    </tr>`).join("");
            }
            const slow = inv.slow_moving || [];
            const slowEl = document.getElementById("slow-detail");
            if (!slow.length) {
                slowEl.innerHTML = emptyState("Processed layer not present",
                    "slow_moving_items.csv appears after python_pipeline/run_pipeline.py executes. The chart above is the committed analytic output.", "clock");
            } else {
                slowEl.innerHTML = `<table class="table table-compact"><thead><tr>
                    <th>Item</th><th class="num">First 60d</th><th class="num">Last 60d</th><th class="num">Δ %</th>
                </tr><tbody>` + slow.slice(0, 12).map(s => `<tr style="cursor:default">
                    <td>${esc(s.item_name || s.menu_item_id)}</td>
                    <td class="num">${fmt.num(s.first_60d_units != null ? s.first_60d_units : s.units_first_60d)}</td>
                    <td class="num">${fmt.num(s.last_60d_units != null ? s.last_60d_units : s.units_last_60d)}</td>
                    <td class="num">${s.decline_pct != null ? Number(s.decline_pct).toFixed(1) + "%" : "—"}</td>
                </tr>`).join("") + "</tbody></table>";
            }
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5">${errorState(err.message)}</td></tr>`;
        }
    }

    /* ================= CUSTOMERS ================= */
    const cust = { page: 1, q: "", risk: "" };

    async function loadCustomers() {
        const tbody = document.getElementById("customers-tbody");
        setLoading(tbody, 6);
        document.getElementById("cust-chart-1").src = "/api/v1/charts/10_rfm_segments.png";
        document.getElementById("cust-chart-2").src = "/api/v1/charts/12_churn_risk.png";
        try {
            const r = await api.get("/api/v1/dashboard/customers", {
                q: cust.q, risk: cust.risk, page: cust.page, page_size: 12,
            });
            const s = r.stats || {};
            document.getElementById("customers-kpis").innerHTML = [
                kpiMini("Watchlist", fmt.num(s.total), "guests matching filters"),
                kpiMini("High risk", fmt.num(s.high), "180+ days since last order"),
                kpiMini("Medium risk", fmt.num(s.medium), "90–180 days since last order"),
                kpiMini("Avg recency", s.avg_days != null ? Math.round(s.avg_days) + "d" : "—", "across the watchlist"),
            ].join("");
            if (!r.items.length) {
                tbody.innerHTML = `<tr><td colspan="6">${emptyState("No guests found", "Try a different risk tier or search.", "users")}</td></tr>`;
                renderPager(document.getElementById("customers-pager"), null, () => {});
                return;
            }
            tbody.innerHTML = r.items.map(c => `
                <tr style="cursor:default">
                    <td class="cell-strong">#${esc(c.customer_id)}</td>
                    <td>${esc(c.last_order_date || "—")}</td>
                    <td class="num">${fmt.num(c.days_since)}</td>
                    <td>${esc(c.preferred_channel || "—")}</td>
                    <td class="num">${fmt.num(c.total_orders)}</td>
                    <td>${riskBadge(c.risk)}</td>
                </tr>`).join("");
            renderPager(document.getElementById("customers-pager"), r, (p) => {
                cust.page = p;
                loadCustomers();
            });
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6">${errorState(err.message)}</td></tr>`;
        }
    }

    /* ================= PROMOTIONS ================= */
    const promos = { filter: "", page: 1, pageSize: 15, all: [] };

    async function loadPromotions() {
        const tbody = document.getElementById("promos-tbody");
        setLoading(tbody, 6);
        document.getElementById("promo-chart").src = "/api/v1/charts/08_promo_effectiveness.png";
        try {
            const r = await api.get("/api/v1/dashboard/promotions", { filter: promos.filter });
            const s = r.stats || {};
            document.getElementById("promos-kpis").innerHTML = [
                kpiMini("Promotions", fmt.num(s.promotions), "in the analysis window"),
                kpiMini("Promotion traps", fmt.num(s.traps), "lift does not cover discount"),
                kpiMini("Avg AOV lift", s.avg_lift != null ? Number(s.avg_lift).toFixed(2) + "%" : "—", "vs control groups"),
                kpiMini("Incremental rev.", fmt.money0(s.total_incremental), "estimated across promos"),
            ].join("");
            promos.all = r.items || [];
            renderPromoRows();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7">${errorState(err.message)}</td></tr>`;
        }
    }

    function renderPromoRows() {
        const tbody = document.getElementById("promos-tbody");
        const items = promos.all;
        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="7">${emptyState("No promotions found", "Try a different filter.", "tag")}</td></tr>`;
            renderPager(document.getElementById("promos-pager"), null, () => {});
            return;
        }
        const pages = Math.max(Math.ceil(items.length / promos.pageSize), 1);
        if (promos.page > pages) promos.page = pages;
        const slice = items.slice((promos.page - 1) * promos.pageSize, promos.page * promos.pageSize);
        tbody.innerHTML = slice.map(p => `
            <tr style="cursor:default">
                <td class="cell-strong">${esc(p.promotion_name || ("Promotion " + p.promotion_id))}
                    <div class="cell-sub">Venue #${esc(p.restaurant_id)} · ${esc(p.discount_percentage)}% off</div></td>
                <td class="num">${esc(p.discount_percentage)}</td>
                <td class="num">${fmt.num(p.promo_orders)}</td>
                <td class="num">${p.aov_lift_percentage != null ? Number(p.aov_lift_percentage).toFixed(2) + "%" : "—"}</td>
                <td class="num">${fmt.money0(p.promo_discount_spent != null ? p.promo_discount_spent : p.promo_discount_spend)}</td>
                <td class="num">${fmt.money0(p.incremental_revenue_estimate)}</td>
                <td>${p.promotion_trap ? badge("Trap", "red") : badge("Healthy", "green-solid")}</td>
            </tr>`).join("");
        renderPager(document.getElementById("promos-pager"),
            { total: items.length, page: promos.page, pages }, (p) => {
                promos.page = p;
                renderPromoRows();
            });
    }

    /* ================= PAYMENTS ================= */
    const pay = { range: "month", page: 1, q: "", method: "", status: "" };

    const PAY_ICONS = { "Cash": "cash", "Card": "card", "Online Wallet": "phone", "Unspecified": "wallet" };
    const PAY_COLORS = { "Cash": "#35e888", "Card": "#6aa8ff", "Online Wallet": "#f5c451", "Unspecified": "#9aa1a8" };

    async function loadPayments() {
        const donut = document.getElementById("pay-donut");
        const rows = document.getElementById("pay-list-lg");
        const monthly = document.getElementById("pay-monthly");
        setLoading(rows, 4);
        donut.innerHTML = DQ.skeletonBlocks(1);
        monthly.innerHTML = DQ.skeletonBlocks(1);
        try {
            const r = await api.get("/api/v1/dashboard/payments", {
                range: pay.range, location_id: locParam(), date: dateParam(),
            });
            const methods = r.methods || [];
            document.getElementById("payments-kpis").innerHTML = [
                kpiMini("Collected", fmt.money0(r.total), `range: ${pay.range}`),
                kpiMini("Paid orders", fmt.num(r.orders), "completed settlements"),
                kpiMini("Avg settled", r.orders ? fmt.money0(r.total / r.orders) : "—", "per paid order"),
            ].join("");

            if (!methods.length) {
                donut.innerHTML = emptyState("No payments", "Nothing settled in this range.", "wallet");
                rows.innerHTML = "";
            } else {
                DQ.charts.donut(donut, methods.map(m => ({
                    label: m.method, value: m.total, color: PAY_COLORS[m.method] || DQ.dishColor(m.method),
                })), { centerLabel: "Collected" });
                rows.innerHTML = methods.map(m => `
                    <div class="pay-row" style="cursor:default">
                        <span class="pay-ic" style="color:${PAY_COLORS[m.method] || "inherit"}">${icon(PAY_ICONS[m.method] || "wallet")}</span>
                        <span>
                            <span class="pay-name">${esc(m.method)}</span>
                            <span class="pay-meta pay-name" style="font-weight:500">${fmt.num(m.orders)} order(s) · ${m.share}%</span>
                            <span class="pay-bar"><span style="width:${Math.min(m.share, 100)}%"></span></span>
                        </span>
                        <span class="pay-right"><span class="pay-amount">${fmt.money2(m.total)}</span></span>
                    </div>`).join("");
            }

            const byMonth = r.by_month || [];
            if (!byMonth.length) {
                monthly.innerHTML = emptyState("No monthly mix", "Settlement history is empty for this range.", "chart");
            } else {
                const keys = ["Cash", "Card", "Online Wallet", "Unspecified"];
                const colors = ["#35e888", "#6aa8ff", "#f5c451", "#9aa1a8"];
                const points = byMonth.map(m => ({
                    label: m.month,
                    values: keys.map((k, i) => ({ key: k, value: m[k] || 0, color: colors[i] })),
                }));
                DQ.charts.stacked(monthly, points, {
                    legend: keys.filter(k => byMonth.some(m => m[k])),
                });
            }
        } catch (err) {
            rows.innerHTML = errorState(err.message);
        }
    }

    async function loadTxTable() {
        const tbody = document.getElementById("tx-tbody");
        setLoading(tbody, 6);
        try {
            const r = await api.get("/api/v1/dashboard/transactions", {
                location_id: locParam(), q: pay.q, method: pay.method,
                status: pay.status, page: pay.page, page_size: 12,
            });
            if (!r.items.length) {
                tbody.innerHTML = `<tr><td colspan="6">${emptyState("No transactions", "Try different filters.", "cash")}</td></tr>`;
                renderPager(document.getElementById("tx-pager"), null, () => {});
                return;
            }
            tbody.innerHTML = r.items.map(t => `
                <tr data-order="${t.order_id}">
                    <td class="cell-strong">${esc(t.type)}</td>
                    <td>#${esc(t.order_ref)}</td>
                    <td class="num cell-strong">${fmt.money2(t.amount)}</td>
                    <td>${esc(t.date)}</td>
                    <td>${esc(t.time || "")}</td>
                    <td>${t.status === "Paid" ? badge("Paid", "green-solid") : badge(t.status, "red")}</td>
                </tr>`).join("");
            tbody.querySelectorAll("[data-order]").forEach(tr =>
                tr.addEventListener("click", () => DQ.openOrder(tr.dataset.order)));
            renderPager(document.getElementById("tx-pager"), r, (p) => {
                pay.page = p;
                loadTxTable();
            });
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6">${errorState(err.message)}</td></tr>`;
        }
    }

    /* ================= REPORTS ================= */
    async function loadReports() {
        const stats = document.getElementById("report-stats");
        const groups = document.getElementById("reports-groups");
        setLoading(stats, 4);
        groups.innerHTML = DQ.skeletonBlocks(3);
        try {
            const r = await api.get("/api/v1/dashboard/reports");
            const q = r.quality || [];
            const rows = q.reduce((a, x) => a + (Number(x.rows) || 0), 0);
            const missing = q.reduce((a, x) => a + (Number(x.missing_cells) || 0), 0);
            const dupes = q.reduce((a, x) => a + (Number(x.duplicate_rows) || 0), 0);
            const quar = Object.values(r.quarantine || {}).reduce((a, b) => a + b, 0);
            const dual = (r.dual_pipeline || [])[0];
            stats.innerHTML = [
                ["Datasets profiled", fmt.num(q.length), "raw layer quality checks"],
                ["Rows validated", fmt.num(rows), "across all datasets"],
                ["Missing cells", fmt.num(missing), "flagged before cleaning"],
                ["Duplicate rows", fmt.num(dupes), "flagged before cleaning"],
                ["Quarantined rows", fmt.num(quar), "parked for review"],
                ["Dual-pipeline agreement", dual ? Number(dual.agreement_percentage).toFixed(0) + "%" : "—", dual ? `${fmt.num(dual.cases)} unseen cases` : ""],
            ].map(([k, v, s]) => `<div class="report-stat"><div class="k">${esc(k)}</div>
                <div class="v">${v}</div><div class="muted">${esc(s)}</div></div>`).join("");

            groups.innerHTML = (r.groups || []).map(g => `
                <h2 style="font-size:15.5px;margin:20px 0 12px">${esc(g.title)}</h2>
                <div class="chart-gallery">
                    ${g.charts.map(ch => ch.available ? `
                        <div class="card" data-zoom="${esc(ch.url)}">
                            <div class="card-head"><h3 class="card-title" style="font-size:13.5px">${esc(ch.title)}</h3></div>
                            <img class="chart-img" src="${esc(ch.url)}" alt="${esc(ch.title)}" loading="lazy">
                        </div>` : "").join("")}
                </div>`).join("");
            groups.querySelectorAll("[data-zoom]").forEach(card => {
                card.addEventListener("click", () => {
                    const img = card.querySelector("img");
                    DQ.infoModal(card.querySelector(".card-title").textContent,
                        `<img src="${card.dataset.zoom}" alt="" style="width:100%;border-radius:10px">`);
                });
            });
        } catch (err) {
            stats.innerHTML = errorState(err.message);
            groups.innerHTML = "";
        }
    }

    /* ================= LOCATIONS ================= */
    let locSelected = null;

    async function loadLocations() {
        const tbody = document.getElementById("locations-tbody");
        setLoading(tbody, 6);
        try {
            const r = await api.get("/api/v1/dashboard/locations");
            const rows = r.rows || [];
            const totalRev = rows.reduce((a, x) => a + (Number(x.revenue) || 0), 0);
            const totalOrders = rows.reduce((a, x) => a + (Number(x.orders) || 0), 0);
            const best = [...rows].sort((a, b) => (b.avg_order_value || 0) - (a.avg_order_value || 0))[0];
            document.getElementById("locations-kpis").innerHTML = [
                kpiMini("Trading areas", fmt.num(rows.length), "across the chain"),
                kpiMini("Total revenue", fmt.money0(totalRev), "population aggregate"),
                kpiMini("Total orders", fmt.num(totalOrders), "population aggregate"),
                kpiMini("Best AOV area", best ? esc(best.city_area) : "—", best ? fmt.money0(best.avg_order_value) + " avg" : ""),
            ].join("");

            tbody.innerHTML = rows.map(a => `
                <tr data-loc="${esc(a.city_area)}">
                    <td class="num muted">#${a.rank}</td>
                    <td class="cell-strong">${esc(a.city_area)}</td>
                    <td class="num">${fmt.num(a.orders)}</td>
                    <td class="num cell-strong">${fmt.money0(a.revenue)}</td>
                    <td class="num">${fmt.money0(a.avg_order_value)}</td>
                </tr>`).join("");
            tbody.querySelectorAll("[data-loc]").forEach(tr =>
                tr.addEventListener("click", () => {
                    locSelected = tr.dataset.loc;
                    drawLocChart(r);
                }));

            // peak hours grouped bars
            const peak = r.peak_hours || [];
            const byHour = {};
            peak.forEach(p => {
                const h = Number(p.hour);
                byHour[h] = byHour[h] || {};
                byHour[h][p.day_type] = Number(p.orders) || 0;
            });
            const peakPoints = Object.keys(byHour).map(Number).sort((a, b) => a - b).map(h => ({
                label: `${h}:00`,
                value: byHour[h].weekday || 0,
                value2: byHour[h].weekend || 0,
            }));
            DQ.charts.bars(document.getElementById("peak-chart"), peakPoints, {
                money: false, legend: ["Weekday", "Weekend"],
                color: "var(--accent)", color2: "#6aa8ff", height: 200,
            });

            drawLocChart(r);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5">${errorState(err.message)}</td></tr>`;
        }
    }

    function drawLocChart(r) {
        const wrap = document.getElementById("loc-chart");
        const sub = document.getElementById("loc-chart-sub");
        const months = (r.monthly && r.monthly.months) || [];
        let series = [];
        if (locSelected && r.monthly.series[locSelected]) {
            series = r.monthly.series[locSelected];
            sub.textContent = locSelected;
        } else {
            sub.textContent = "All areas";
            series = months.map((_, i) =>
                Object.values(r.monthly.series).reduce((a, s) => a + (s[i] || 0), 0));
        }
        const points = months.map((m, i) => ({
            label: new Date(m + "-01T12:00:00").toLocaleDateString("en-GB", { month: "short" }),
            sublabel: m,
            value: series[i] || 0,
        }));
        DQ.charts.areaLine(wrap, points, { height: 220, tension: 0.3 });
    }

    /* ================= MODELS ================= */
    const scorer = { task: "high_value_order", specs: [] };

    async function loadModels() {
        const kpis = document.getElementById("models-kpis");
        const dualPanels = document.getElementById("dual-panels");
        setLoading(kpis, 3);
        try {
            const [models, pipeline, tasks] = await Promise.all([
                api.get("/api/v1/models"),
                api.get("/api/v1/pipeline/status"),
                api.get("/api/v1/predict/tasks"),
            ]);
            scorer.specs = tasks.tasks || [];
            renderScorerForm();

            const active = (models.models || []).filter(m => m.status === "active");
            const dp = pipeline.dual_pipeline || {};
            const ens = pipeline.ensemble || {};
            kpis.innerHTML = [
                kpiMini("Dual-pipeline agreement", dp.agreement != null ? Number(dp.agreement).toFixed(0) + "%" : "—",
                    dp.cases != null ? `${fmt.num(dp.cases)} unseen cases` : ""),
                kpiMini("Active artifacts", fmt.num(active.length), `${models.models.length} versioned total`),
                kpiMini("Slowest ensemble batch", ens.max_ms != null ? ens.max_ms + " ms" : "—",
                    ens.limit_ms ? `budget ${fmt.num(ens.limit_ms)} ms` : ""),
                kpiMini("NFR status", ens.pass ? "PASS" : (ens.max_ms != null ? "FAIL" : "—"),
                    pipeline.last_processing_run ? `last run ${esc(pipeline.last_processing_run.slice(0, 16))}` : "warm-process serving"),
            ].join("");

            dualPanels.innerHTML = (dp.rows || []).map(row => `
                <div class="report-stat" style="margin-bottom:10px">
                    <div class="k">${esc(row.task)}</div>
                    <div class="v">${Number(row.agreement_percentage).toFixed(0)}%</div>
                    <div class="muted">${fmt.num(row.matching_cases)} / ${fmt.num(row.cases)} matching ·
                        python acc ${(Number(row.python_accuracy) * 100).toFixed(1)}% ·
                        pipeline acc ${(Number(row.pipeline_accuracy) * 100).toFixed(1)}%</div>
                </div>`).join("") || emptyState("No comparison evidence", "Run the dual pipeline to populate this panel.", "cpu");

            const lt = document.getElementById("latency-tbody");
            if (ens.rows && ens.rows.length) {
                lt.innerHTML = ens.rows.map(row => `
                    <tr style="cursor:default">
                        <td class="cell-strong">${esc(row.task)}</td>
                        <td class="num">${fmt.num(row.batch_size)}</td>
                        <td class="num">${esc(row.total_ms_max)}</td>
                        <td class="num">${fmt.num(row.nfr_limit_ms)}</td>
                        <td>${String(row.pass).toLowerCase() === "true" ? badge("Pass", "green-solid") : badge("Fail", "red")}</td>
                    </tr>`).join("");
            } else {
                lt.innerHTML = `<tr><td colspan="5">${emptyState("No latency report", "Run the ensemble latency test to populate NFR evidence.", "clock")}</td></tr>`;
            }

            const mt = document.getElementById("models-tbody");
            mt.innerHTML = (models.models || []).map(m => {
                const metrics = Object.entries(m.metrics || {})
                    .map(([k, v]) => `${esc(k)}: ${typeof v === "number" ? Number(v).toFixed(4) : esc(v)}`).join("<br>");
                return `<tr style="cursor:default">
                    <td class="cell-strong">${esc(m.task)}</td>
                    <td>${esc(m.pipeline)}</td>
                    <td class="num">v${esc(m.version)}</td>
                    <td>${esc(m.engine || "—")}</td>
                    <td>${esc(m.trained_at || "—")}</td>
                    <td style="white-space:normal;max-width:220px">${metrics || "—"}</td>
                    <td class="cell-sub">${esc(m.artifact)}</td>
                    <td>${m.status === "active" ? badge("Active", "green-solid") : badge("Archived", "gray")}</td>
                </tr>`;
            }).join("") || `<tr><td colspan="8">${emptyState("No model artifacts", "Train the models via spark_jobs/run_all.py.", "cpu")}</td></tr>`;
        } catch (err) {
            kpis.innerHTML = `<div style="grid-column:1/-1">${errorState(err.message)}</div>`;
        }
    }

    const SAMPLES = {
        high_value_order: {
            order_hour: 18, day_of_week_code: 2, order_month: 7, is_weekend: 0,
            is_promo_order: 1, channel_code: 1, payment_code: 2, basket_size: 4,
            basket_quantity: 6, avg_unit_price: 1520.5, discount_rate_percentage: 3.1,
            total_orders: 12, total_spend: 54000,
        },
        customer_churn: {
            recency_days: 45, f_log_orders: 1.2, f_log_spend: 9.4,
            average_order_value: 3200, discount_dependency: 0.02, promo_dependency: 0.1,
            top_category_share: 0.4, unique_categories: 5,
        },
        menu_business_class: {
            units_sold: 8871, revenue: 10189641.65, estimated_profit: 5308219.75,
            profit_margin_percentage: 52.09, average_rating: 4.22, wastage_ratio: 0.08,
        },
    };

    const FIELD_META = {
        is_weekend: { type: "select", options: [[0, "No"], [1, "Yes"]] },
        is_promo_order: { type: "select", options: [[0, "No"], [1, "Yes"]] },
        channel_code: { type: "select", options: [[0, "Dine-in"], [1, "Takeaway"], [2, "Website/App"], [3, "Third-party"]] },
        payment_code: { type: "select", options: [[0, "Cash"], [1, "Card"], [2, "Online Wallet"]] },
        day_of_week_code: { type: "select", options: [[0, "Mon"], [1, "Tue"], [2, "Wed"], [3, "Thu"], [4, "Fri"], [5, "Sat"], [6, "Sun"]] },
    };

    function renderScorerForm() {
        const tabs = document.getElementById("scorer-task");
        const form = document.getElementById("scorer-form");
        tabs.innerHTML = scorer.specs.map(s =>
            `<button type="button" data-task="${s.task}" class="${s.task === scorer.task ? "active" : ""}">${esc(s.label)}</button>`).join("");
        tabs.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
            scorer.task = b.dataset.task;
            renderScorerForm();
            document.getElementById("scorer-result").hidden = true;
        }));

        const spec = scorer.specs.find(s => s.task === scorer.task);
        if (!spec) { form.innerHTML = ""; return; }
        form.innerHTML = spec.features.map(f => {
            const meta = FIELD_META[f] || { type: "number" };
            const id = "sf-" + f;
            if (meta.type === "select") {
                return `<div class="form-field">
                    <label for="${id}">${esc(f.replace(/_/g, " "))}</label>
                    <select id="${id}" data-field="${f}">
                        ${meta.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}
                    </select></div>`;
            }
            const def = (SAMPLES[spec.task] || {})[f];
            return `<div class="form-field">
                <label for="${id}">${esc(f.replace(/_/g, " "))}</label>
                <input id="${id}" data-field="${f}" type="number" step="any" value="${def !== undefined ? def : 0}">
            </div>`;
        }).join("");
    }

    function runScorer() {
        const spec = scorer.specs.find(s => s.task === scorer.task);
        const out = document.getElementById("scorer-result");
        const rec = {};
        document.querySelectorAll("#scorer-form [data-field]").forEach(inp => {
            rec[inp.dataset.field] = Number(inp.value);
        });
        out.hidden = false;
        out.innerHTML = DQ.skeleton(4);
        api.post("/api/v1/predict/ensemble", { task: spec.task, records: [rec] })
            .then(res => {
                const p = res.predictions[0];
                const rows = spec.type === "multiclass"
                    ? Object.entries(p.probabilities || {}).map(([k, v]) => `
                        <div class="result-row"><span>${esc(k)}</span>
                        <span>${(v * 100).toFixed(1)}% <span class="prob-bar" style="display:inline-block;width:70px"><span style="width:${v * 100}%"></span></span></span></div>`).join("")
                    : `<div class="result-row"><span>${esc(spec.label)} probability</span>
                        <span><strong>${(p.probability_ensemble * 100).toFixed(1)}%</strong>
                        <span class="prob-bar" style="display:inline-block;width:70px"><span style="width:${p.probability_ensemble * 100}%"></span></span></span></div>
                       <div class="result-row"><span>Big-data pipeline model</span><span>${(p.probability_big_data * 100).toFixed(1)}%</span></div>
                       <div class="result-row"><span>Python model</span><span>${(p.probability_python * 100).toFixed(1)}%</span></div>`;
                out.innerHTML = `
                    <h4>${esc(res.task_label || res.task)} → <strong style="color:var(--accent)">${esc(p.label_name)}</strong>
                        ${res.nfr_pass ? badge("NFR pass", "green-solid") : badge("Over budget", "red")}</h4>
                    ${rows}
                    <div class="result-row"><span>Ensemble latency</span><span><strong>${res.latency_ms} ms</strong> / ${fmt.num(res.nfr_limit_ms)} ms budget</span></div>
                    <div class="result-row"><span>Model versions</span><span>pipeline v${res.ensemble_version.big_data} · python v${res.ensemble_version.python}</span></div>
                    <div class="muted" style="margin-top:8px">${esc(p.decision_rule)}</div>`;
            })
            .catch(err => {
                out.innerHTML = errorState(err.message);
            });
    }

    /* ================= SETTINGS ================= */
    async function loadSettings() {
        try {
            const [meta, status] = await Promise.all([
                api.get("/api/v1/dashboard/meta"),
                api.get("/api/v1/status"),
            ]);
            DQ.state.meta = meta;
            document.getElementById("settings-api").textContent =
                `${status.status} · ${status.engine} · agreement ${status.dual_pipeline_agreement}`;
            document.getElementById("settings-range").textContent =
                `Data covers ${fmt.dateLabel(meta.date_range.min)} → ${fmt.dateLabel(meta.date_range.max)} · default “today” = ${fmt.dateLabel(meta.date_range.default)}`;
            const tbody = document.getElementById("sources-tbody");
            tbody.innerHTML = (meta.data_sources || []).map(s => `
                <tr style="cursor:default">
                    <td class="cell-strong">${esc(s.label)}</td>
                    <td class="cell-sub">${esc(s.file || "—")}</td>
                    <td>${s.layer === "processed" ? badge("processed", "blue") : s.layer === "evidence" ? badge("evidence", "green-solid") : badge(s.layer, "gray")}</td>
                    <td class="num">${fmt.num(s.rows)}</td>
                    <td>${s.status === "available" ? badge("Available", "green-solid") : badge("Missing", "red")}</td>
                </tr>`).join("");
            DQ.syncDateInputs && DQ.syncDateInputs();
        } catch (err) {
            document.getElementById("settings-api").textContent = err.message;
        }
    }

    /* ================= Registration ================= */
    DQ.registerView("orders",
        function init() {
            fillOrderFilters();
            const onInput = (key, ev, extra) => {
                orders[key] = ev.target.value;
                orders.page = 1;
                if (extra) extra();
                loadOrders();
            };
            let t;
            document.getElementById("orders-q").addEventListener("input", (e) => {
                clearTimeout(t);
                t = setTimeout(() => onInput("q", e), 280);
            });
            document.getElementById("orders-status").addEventListener("change", e => onInput("status", e));
            document.getElementById("orders-channel").addEventListener("change", e => onInput("channel", e));
            document.getElementById("orders-payment").addEventListener("change", e => onInput("payment", e));
            document.getElementById("orders-sort").addEventListener("change", e => onInput("sort", e));
            document.getElementById("orders-clear").addEventListener("click", () => {
                Object.assign(orders, { page: 1, q: "", status: "", channel: "", payment: "", sort: "recent" });
                document.getElementById("orders-q").value = "";
                ["status", "channel", "payment"].forEach(k => document.getElementById("orders-" + k).value = "");
                document.getElementById("orders-sort").value = "recent";
                loadOrders();
            });
        },
        loadOrders);

    DQ.registerView("menu",
        function init() {
            let t;
            document.getElementById("menu-q").addEventListener("input", (e) => {
                clearTimeout(t);
                t = setTimeout(() => { menuState.q = e.target.value; loadMenu(); }, 280);
            });
            document.getElementById("menu-range").addEventListener("change", (e) => {
                menuState.range = e.target.value;
                loadMenu();
            });
        },
        loadMenu);

    DQ.registerView("inventory", () => {}, loadInventory);

    DQ.registerView("customers",
        function init() {
            const risk = DQ.queryParam("risk");
            if (risk) { cust.risk = risk; document.getElementById("customers-risk").value = risk; }
            let t;
            document.getElementById("customers-q").addEventListener("input", (e) => {
                clearTimeout(t);
                t = setTimeout(() => { cust.q = e.target.value; cust.page = 1; loadCustomers(); }, 280);
            });
            document.getElementById("customers-risk").addEventListener("change", (e) => {
                cust.risk = e.target.value; cust.page = 1; loadCustomers();
            });
        },
        loadCustomers);

    DQ.registerView("promotions",
        function init() {
            document.getElementById("promos-filter").addEventListener("change", (e) => {
                promos.filter = e.target.value;
                promos.page = 1;
                loadPromotions();
            });
        },
        loadPromotions);

    DQ.registerView("payments",
        function init() {
            const method = DQ.queryParam("method");
            if (method) pay.method = method;
            document.querySelectorAll("#pay-range button").forEach(btn =>
                btn.addEventListener("click", () => {
                    document.querySelectorAll("#pay-range button").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    pay.range = btn.dataset.range;
                    loadPayments();
                }));
            const meta = DQ.state.meta || {};
            (meta.payment_methods || []).forEach(m => {
                const opt = `<option value="${esc(m)}">${esc(m)}</option>`;
                document.getElementById("tx-method").insertAdjacentHTML("beforeend", opt);
            });
            if (method) document.getElementById("tx-method").value = method;
            let t;
            document.getElementById("tx-q").addEventListener("input", (e) => {
                clearTimeout(t);
                t = setTimeout(() => { pay.q = e.target.value; pay.page = 1; loadTxTable(); }, 280);
            });
            document.getElementById("tx-method").addEventListener("change", (e) => {
                pay.method = e.target.value; pay.page = 1; loadTxTable();
            });
            document.getElementById("tx-status").addEventListener("change", (e) => {
                pay.status = e.target.value; pay.page = 1; loadTxTable();
            });
        },
        function refresh() { loadPayments(); loadTxTable(); });

    DQ.registerView("reports", () => {}, loadReports);
    DQ.registerView("locations", () => {}, loadLocations);

    DQ.registerView("models",
        function init() {
            document.getElementById("scorer-run").addEventListener("click", runScorer);
            document.getElementById("scorer-sample").addEventListener("click", () => {
                const sample = SAMPLES[scorer.task] || {};
                Object.entries(sample).forEach(([f, v]) => {
                    const inp = document.getElementById("sf-" + f);
                    if (inp) inp.value = v;
                });
                DQ.toast("Sample unseen case loaded from the dual-pipeline benchmark");
            });
        },
        loadModels);

    DQ.registerView("settings",
        function init() {
            document.querySelectorAll("#theme-segment button").forEach(btn =>
                btn.addEventListener("click", () => DQ.setTheme(btn.dataset.theme)));
            document.getElementById("settings-date").addEventListener("change", (e) => {
                if (e.target.value) {
                    DQ.state.businessDate = e.target.value;
                    DQ.syncDateInputs && DQ.syncDateInputs();
                    DQ.toast("Business date updated");
                }
            });
            document.getElementById("settings-refresh").addEventListener("click", reloadLayers);
            document.getElementById("profile-refresh").addEventListener("click", reloadLayers);
        },
        loadSettings);

    async function reloadLayers() {
        DQ.toast("Reloading pipeline data layer…");
        try {
            await api.post("/api/v1/dashboard/reload", {});
            DQ.state.meta = await api.get("/api/v1/dashboard/meta");
            DQ.toast("Data layer reloaded");
            DQ.refreshView(DQ.currentView());
        } catch (err) {
            DQ.toast("Reload failed: " + err.message, "error");
        }
    }
})();
