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
                <tr data-order="${o.order_id}" tabindex="0" role="button" aria-label="Open order #${esc(o.order_ref)}">
                    <td class="cell-strong">#${esc(o.order_ref)}</td>
                    <td>#${esc(o.customer_id)}</td>
                    <td>${esc(o.city_area || "—")}<div class="cell-sub">${esc(o.restaurant_name || "")}</div></td>
                    <td>${esc(o.order_channel || "—")}</td>
                    <td>${esc(o.payment_method || "—")}</td>
                    <td class="num cell-strong">${fmt.money2(o.total_amount)}</td>
                    <td>${DQ.statusBadge(o.order_status, o.is_completed)}</td>
                    <td>${fmt.dateLabel(o.order_date)}<div class="cell-sub">${esc(o.order_time || "")}</div></td>
                </tr>`).join("");
            tbody.querySelectorAll("[data-order]").forEach(tr => {
                const open = () => DQ.openOrder(tr.dataset.order);
                tr.addEventListener("click", open);
                tr.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        open();
                    }
                });
            });
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
        try {
            const inv = await api.get("/api/v1/dashboard/inventory");
            const items = (inv.wastage_items || []).slice(0, 15);
            DQ.charts.bars(document.getElementById("inv-chart-1"), items.slice(0, 10).map(w => ({
                label: String(w.item_name || ("Item " + w.menu_item_id)).slice(0, 12),
                sublabel: `Venue ${w.restaurant_id}`,
                value: (Number(w.wastage_ratio) || 0) * 100,
            })), { money: false, height: 230, aria: "Wastage ratio by menu item" });
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
            DQ.charts.bars(document.getElementById("inv-chart-2"), slow.slice(0, 10).map(s => ({
                label: String(s.item_name || s.menu_item_id).slice(0, 12),
                value: Number(s.first_60d_units ?? s.units_first_60d) || 0,
                value2: Number(s.last_60d_units ?? s.units_last_60d) || 0,
            })), { money: false, height: 230, legend: ["First 60 days", "Last 60 days"], aria: "Slow moving item units" });
            if (!slow.length) {
                slowEl.innerHTML = emptyState("Processed layer not present",
                    "Run the Python analytics pipeline to calculate slow-moving items.", "clock");
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
        try {
            const r = await api.get("/api/v1/dashboard/customers", {
                q: cust.q, risk: cust.risk, page: cust.page, page_size: 12,
            });
            const s = r.stats || {};
            DQ.charts.donut(document.getElementById("cust-chart-1"), [
                { label: "High risk", value: Number(s.high) || 0, color: "#fb7185" },
                { label: "Medium risk", value: Number(s.medium) || 0, color: "#fbbf24" },
                { label: "Low risk", value: Number(s.low) || 0, color: "#34d399" },
            ], { money: false, centerLabel: "Profiles", aria: "Customer risk distribution" });
            DQ.charts.bars(document.getElementById("cust-chart-2"), Object.entries(s.recency_buckets || {}).map(([label, value]) => ({
                label, value: Number(value) || 0,
            })), { money: false, height: 230, aria: "Customer recency distribution" });
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
        try {
            const r = await api.get("/api/v1/dashboard/promotions", { filter: promos.filter });
            const s = r.stats || {};
            DQ.charts.bars(document.getElementById("promo-chart"), (r.items || []).slice(0, 10).map(p => ({
                label: String(p.promotion_name || ("Promo " + p.promotion_id)).slice(0, 12),
                value: Number(p.aov_lift_percentage) || 0,
            })), { money: false, height: 230, aria: "Average order value lift by promotion" });
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
                <tr data-order="${t.order_id}" tabindex="0" role="button" aria-label="Open transaction order #${esc(t.order_ref)}">
                    <td class="cell-strong">${esc(t.type)}</td>
                    <td>#${esc(t.order_ref)}</td>
                    <td class="num cell-strong">${fmt.money2(t.amount)}</td>
                    <td>${esc(t.date)}</td>
                    <td>${esc(t.time || "")}</td>
                    <td>${t.status === "Paid" ? badge("Paid", "green-solid") : badge(t.status, "red")}</td>
                </tr>`).join("");
            tbody.querySelectorAll("[data-order]").forEach(tr => {
                const open = () => DQ.openOrder(tr.dataset.order);
                tr.addEventListener("click", open);
                tr.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        open();
                    }
                });
            });
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
        const endpoints = [
            "/api/v1/dashboard/reports",
            "/api/v1/dashboard/revenue-series?range=year",
            "/api/v1/dashboard/locations",
            "/api/v1/dashboard/menu-intelligence",
            "/api/v1/dashboard/inventory",
            "/api/v1/dashboard/customers",
            "/api/v1/dashboard/promotions",
            "/api/v1/dashboard/forecast?horizon=30",
        ];
        setLoading(stats, 4);
        const results = await Promise.allSettled(endpoints.map(path => api.get(path)));
        const valueAt = index => results[index].status === "fulfilled" ? results[index].value : null;
        const report = valueAt(0);
        if (report) {
            const quality = report.quality || [];
            const rows = quality.reduce((sum, row) => sum + (Number(row.rows) || 0), 0);
            const missing = quality.reduce((sum, row) => sum + (Number(row.missing_cells) || 0), 0);
            const duplicates = quality.reduce((sum, row) => sum + (Number(row.duplicate_rows) || 0), 0);
            const quarantined = Object.values(report.quarantine || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
            const dual = (report.dual_pipeline || [])[0];
            stats.innerHTML = [
                ["Datasets profiled", fmt.num(quality.length), "raw layer quality checks"],
                ["Rows validated", fmt.num(rows), "across all datasets"],
                ["Missing cells", fmt.num(missing), "flagged before cleaning"],
                ["Duplicate rows", fmt.num(duplicates), "flagged before cleaning"],
                ["Quarantined rows", fmt.num(quarantined), "parked for review"],
                ["Dual-pipeline agreement", dual ? Number(dual.agreement_percentage).toFixed(0) + "%" : "?", dual ? `${fmt.num(dual.cases)} unseen cases` : ""],
            ].map(([label, value, note]) => `<div class="report-stat"><div class="k">${esc(label)}</div>
                <div class="v">${value}</div><div class="muted">${esc(note)}</div></div>`).join("");
        } else {
            stats.innerHTML = errorState(results[0].reason?.message || "Report data is unavailable");
        }

        const draw = (id, result, points, options) => {
            const element = document.getElementById(id);
            if (!result) {
                element.innerHTML = errorState("Could not load this dataset");
                return;
            }
            if (options.type === "line") DQ.charts.areaLine(element, points, options);
            else if (options.type === "donut") DQ.charts.donut(element, points, options);
            else DQ.charts.bars(element, points, options);
        };
        const revenue = valueAt(1);
        const locations = valueAt(2);
        const menu = valueAt(3);
        const inventory = valueAt(4);
        const customers = valueAt(5);
        const promotions = valueAt(6);
        const forecast = valueAt(7);

        draw("report-revenue", revenue, revenue?.points || [], {
            type: "line", height: 230, aria: "Monthly revenue trend",
        });
        draw("report-locations", locations, (locations?.rows || []).slice(0, 12).map(row => ({
            label: String(row.city_area).slice(0, 12), value: Number(row.revenue) || 0,
        })), { money: true, height: 230, aria: "Revenue by location" });
        const classCounts = (menu?.classes || []).reduce((counts, item) => {
            const label = item.actual_class || item.predicted_class || "Unclassified";
            counts[label] = (counts[label] || 0) + 1;
            return counts;
        }, {});
        draw("report-menu-class", menu, Object.entries(classCounts).map(([label, value]) => ({ label, value })), {
            type: "donut", money: false, centerLabel: "Menu items", aria: "Menu business class mix",
        });
        draw("report-wastage", inventory, (inventory?.wastage_items || []).slice(0, 10).map(row => ({
            label: String(row.item_name || ("Item " + row.menu_item_id)).slice(0, 12),
            value: (Number(row.wastage_ratio) || 0) * 100,
        })), { money: false, height: 230, aria: "Wastage ratio by menu item" });
        draw("report-recency", customers, Object.entries(customers?.stats?.recency_buckets || {}).map(([label, value]) => ({
            label, value: Number(value) || 0,
        })), { money: false, height: 230, aria: "Customer recency distribution" });
        draw("report-promotions", promotions, (promotions?.items || []).slice(0, 10).map(row => ({
            label: String(row.promotion_name || ("Promo " + row.promotion_id)).slice(0, 12),
            value: Number(row.aov_lift_percentage) || 0,
        })), { money: false, height: 230, aria: "Average order value lift by promotion" });
        draw("report-forecast", forecast, (forecast?.points || []).slice(-14).map(row => ({
            label: String(row.date).slice(5),
            value: Number(row.python_model_prediction) || 0,
            value2: Number(row.actual_sales) || 0,
        })), { money: true, height: 230, legend: ["Forecast", "Actual"], aria: "Forecast compared with actual sales" });
        const hourly = {};
        (locations?.peak_hours || []).forEach(row => {
            const hour = Number(row.hour);
            hourly[hour] ||= { label: `${String(hour).padStart(2, "0")}:00`, value: 0, value2: 0 };
            if (/weekend/i.test(String(row.day_type))) hourly[hour].value2 += Number(row.orders) || 0;
            else hourly[hour].value += Number(row.orders) || 0;
        });
        draw("report-peak", locations, Object.values(hourly), {
            money: false, height: 230, legend: ["Weekday", "Weekend"], aria: "Order count by hour and day type",
        });
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

    DQ.registerView("reports", function init() {
        const button = document.getElementById("report-export-button");
        button.addEventListener("click", () => {
            const dataset = document.getElementById("report-export").value;
            window.location.assign(`/api/v1/dashboard/export?dataset=${encodeURIComponent(dataset)}`);
        });
    }, loadReports);
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
        },
        loadSettings);

    /* ================= SRS analytical views ================= */
    DQ.registerView("basket", () => {}, loadBasketView);
    DQ.registerView("price", function init() {
        let timer;
        document.getElementById("price-q").addEventListener("input", (event) => {
            clearTimeout(timer);
            timer = setTimeout(() => loadPriceView(event.target.value), 250);
        });
    }, () => loadPriceView(document.getElementById("price-q").value));
    DQ.registerView("forecast", function init() {
        document.getElementById("forecast-horizon").addEventListener("change", loadForecastView);
    }, loadForecastView);
    DQ.registerView("peak", () => {}, loadPeakView);
    DQ.registerView("anomalies", () => {}, loadAnomalyView);
    DQ.registerView("whatif", function init() {
        document.getElementById("whatif-range").addEventListener("input", updateWhatIf);
        document.getElementById("whatif-scenario").addEventListener("change", updateWhatIf);
        document.getElementById("whatif-item").addEventListener("change", updateWhatIf);
        loadWhatIfItems();
    }, updateWhatIf);
    DQ.registerView("recommendations", () => {}, loadRecommendationsView);
    DQ.registerView("quality", () => {}, loadQualityView);
    async function loadAuditView() {
        const tbody = document.getElementById("audit-tbody");
        const status = document.getElementById("audit-status");
        if (!tbody) return;
        setLoading(tbody, 6);
        try {
            const limit = (document.getElementById("audit-limit") || {}).value || "100";
            const result = await api.get("/api/v1/audit", { limit });
            const items = result.items || [];
            if (status) {
                status.textContent = items.length
                    ? `Showing the ${items.length} most recent events recorded by the API`
                    : "No audit events recorded yet.";
            }
            const statusKind = (s) => {
                if (s === "success") return "green";
                if (s === "failed" || s === "rejected") return "red";
                if (s === "unavailable") return "amber";
                return "gray";
            };
            tbody.innerHTML = items.map(a => `<tr style="cursor:default">
                <td class="cell-sub">${esc(String(a.created_at || "—").replace("T", " ").slice(0, 19))}</td>
                <td>${esc(a.actor_email || "system")}</td>
                <td>${esc(a.actor_role || "—")}</td>
                <td class="cell-strong">${esc(a.action)}</td>
                <td class="num">${a.record_count === null || a.record_count === undefined ? "—" : fmt.num(a.record_count)}</td>
                <td>${badge(a.status || "—", statusKind(a.status))}</td>
                <td class="audit-details" title="${esc(JSON.stringify(a.details || {}))}">${esc(JSON.stringify(a.details || {}))}</td>
            </tr>`).join("")
                || `<tr><td colspan="7">${emptyState("No audit events", "Sign-ins, exports, predictions and admin changes appear here.", "shield")}</td></tr>`;
        } catch (error) {
            const message = error.status === 403
                ? "Administrator access is required to view the audit trail."
                : error.status === 401
                    ? "Sign in to view the audit trail."
                    : error.message;
            if (status) status.textContent = message;
            tbody.innerHTML = `<tr><td colspan="7">${errorState(message)}</td></tr>`;
        }
    }

    DQ.registerView("team",
        function init() {
            const limit = document.getElementById("audit-limit");
            if (limit) limit.addEventListener("change", loadAuditView);
            const reload = document.getElementById("audit-refresh");
            if (reload) reload.addEventListener("click", loadAuditView);
        },
        function refresh() { loadTeamView(); loadAuditView(); });
    DQ.registerView("billing", () => {}, loadUsageView);
    DQ.registerView("data", initDataManagement, loadDataManagement);

    const dataManager = { resources: [], resource: "locations", page: 1, pageSize: 25, totalPages: 1, query: "", editingId: null, writable: false, initialized: false };
    async function initDataManagement() {
        if (dataManager.initialized) return;
        dataManager.initialized = true;
        const select = document.getElementById("data-resource");
        try {
            const [catalog, user] = await Promise.all([
                api.get("/api/v1/admin/data/resources"), api.get("/api/v1/auth/me"),
            ]);
            dataManager.resources = catalog.resources || [];
            dataManager.writable = user.role === "Administrator";
            select.innerHTML = dataManager.resources.map(item => `<option value="${esc(item.name)}">${esc(item.label)}</option>`).join("");
            document.getElementById("data-new").hidden = !dataManager.writable;
            document.getElementById("data-editor-note").textContent = dataManager.writable ? "Required fields are marked. Numeric IDs may be left blank for automatic assignment." : "Records are read-only for your account. Administrator access is required to change data.";
            select.addEventListener("change", () => { dataManager.resource = select.value; dataManager.page = 1; loadDataManagement(); });
            document.getElementById("data-search-button").addEventListener("click", () => { dataManager.query = document.getElementById("data-search").value.trim(); dataManager.page = 1; loadDataManagement(); });
            document.getElementById("data-search").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); document.getElementById("data-search-button").click(); } });
            document.getElementById("data-prev").addEventListener("click", () => { if (dataManager.page > 1) { dataManager.page--; loadDataManagement(); } });
            document.getElementById("data-next").addEventListener("click", () => { if (dataManager.page < dataManager.totalPages) { dataManager.page++; loadDataManagement(); } });
            document.getElementById("data-new").addEventListener("click", () => openDataEditor());
            document.getElementById("data-cancel").addEventListener("click", closeDataEditor);
            document.getElementById("data-form").addEventListener("submit", saveDataRecord);
            await loadDataManagement();
        } catch (error) {
            document.getElementById("data-page-info").textContent = error.message;
            document.getElementById("data-new").hidden = true;
        }
    }

    async function loadDataManagement() {
        const head = document.getElementById("data-head");
        const body = document.getElementById("data-tbody");
        if (!dataManager.resources.length) return;
        body.innerHTML = `<tr><td colspan="12">Loading records…</td></tr>`;
        try {
            const result = await api.get(`/api/v1/admin/data/${encodeURIComponent(dataManager.resource)}`, {
                page: dataManager.page, page_size: dataManager.pageSize, q: dataManager.query,
            });
            const definition = dataManager.resources.find(item => item.name === dataManager.resource);
            const rows = result.items || [];
            const columns = definition.fields.map(field => field.name).filter(name => rows.some(row => row[name] !== null && row[name] !== undefined));
            head.innerHTML = `<tr>${columns.map(name => `<th>${esc(name.replace(/_/g, " "))}</th>`).join("")}${dataManager.writable ? "<th>Actions</th>" : ""}</tr>`;
            body.innerHTML = rows.map(row => `<tr>${columns.map(name => `<td>${esc(row[name] === null || row[name] === undefined ? "—" : typeof row[name] === "boolean" || name === "is_active" ? (Number(row[name]) ? "Yes" : "No") : row[name])}</td>`).join("")}${dataManager.writable ? `<td><button class="btn btn-ghost btn-sm data-edit" type="button" data-id="${esc(row[definition.primary_key])}">Edit</button> <button class="btn btn-ghost btn-sm data-delete" type="button" data-id="${esc(row[definition.primary_key])}">Delete</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="12">No records found. Create a record to start the operational data store.</td></tr>`;
            body.querySelectorAll(".data-edit").forEach(button => button.addEventListener("click", () => {
                const row = rows.find(item => String(item[definition.primary_key]) === button.dataset.id);
                if (row) openDataEditor(row);
            }));
            body.querySelectorAll(".data-delete").forEach(button => button.addEventListener("click", async () => {
                if (!window.confirm("Delete this record? Referenced records may prevent deletion.")) return;
                try {
                    await api.delete(`/api/v1/admin/data/${encodeURIComponent(dataManager.resource)}/${encodeURIComponent(button.dataset.id)}`);
                    DQ.toast("Record deleted"); loadDataManagement();
                } catch (error) { DQ.toast(error.message, "error"); }
            }));
            dataManager.totalPages = result.pages || 1;
            document.getElementById("data-page-info").textContent = `${fmt.num(result.total)} records · page ${dataManager.page} of ${dataManager.totalPages}`;
            document.getElementById("data-prev").disabled = dataManager.page <= 1;
            document.getElementById("data-next").disabled = dataManager.page >= dataManager.totalPages;
        } catch (error) { head.innerHTML = ""; body.innerHTML = `<tr><td>${esc(error.message)}</td></tr>`; }
    }

    function openDataEditor(record = null) {
        if (!dataManager.writable) return;
        const definition = dataManager.resources.find(item => item.name === dataManager.resource);
        dataManager.editingId = record ? record[definition.primary_key] : null;
        document.getElementById("data-editor-title").textContent = record ? `Edit ${definition.label.toLowerCase()}` : `New ${definition.label.toLowerCase().replace(/s$/, "")}`;
        document.getElementById("data-form-error").textContent = "";
        document.getElementById("data-fields").innerHTML = definition.fields.map(field => {
            const id = `data-field-${field.name}`;
            const value = record && record[field.name] !== null && record[field.name] !== undefined ? record[field.name] : "";
            const disabled = dataManager.editingId !== null && field.name === definition.primary_key;
            const required = field.required && !disabled ? "required" : "";
            let input;
            if (field.type === "enum") input = `<select class="control" id="${id}" name="${esc(field.name)}" ${required} ${disabled ? "disabled" : ""}><option value="">Select…</option>${(field.options || []).map(option => `<option value="${esc(option)}" ${value === option ? "selected" : ""}>${esc(option)}</option>`).join("")}</select>`;
            else if (field.type === "boolean") input = `<select class="control" id="${id}" name="${esc(field.name)}" ${disabled ? "disabled" : ""}><option value="">Default</option><option value="true" ${Number(value) === 1 ? "selected" : ""}>Yes</option><option value="false" ${value !== "" && Number(value) === 0 ? "selected" : ""}>No</option></select>`;
            else input = `<input class="control" id="${id}" name="${esc(field.name)}" type="${field.type === "integer" || field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"}" ${field.type === "integer" ? "step=1" : field.type === "number" ? "step=any" : ""} ${field.minimum !== null ? `min="${field.minimum}"` : ""} ${field.maximum !== null ? `max="${field.maximum}"` : ""} ${field.max_length ? `maxlength="${field.max_length}"` : ""} value="${esc(field.type === "datetime" ? String(value).slice(0, 16) : value)}" ${required} ${disabled ? "disabled" : ""} ${field.name === definition.primary_key ? 'placeholder="Auto"' : ""}>`;
            return `<label class="data-form-field" for="${id}"><span>${esc(field.name.replace(/_/g, " "))}${field.required && !disabled ? " *" : ""}</span>${input}</label>`;
        }).join("");
        document.getElementById("data-editor").hidden = false;
        document.getElementById("data-editor").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeDataEditor() {
        dataManager.editingId = null;
        document.getElementById("data-editor").hidden = true;
        document.getElementById("data-form").reset();
    }

    async function saveDataRecord(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = {};
        new FormData(form).forEach((value, name) => {
            const field = dataManager.resources.find(item => item.name === dataManager.resource).fields.find(item => item.name === name);
            if (value === "") return;
            if (field.type === "integer" || field.type === "number") payload[name] = Number(value);
            else if (field.type === "boolean") payload[name] = value === "true";
            else payload[name] = value;
        });
        const path = `/api/v1/admin/data/${encodeURIComponent(dataManager.resource)}`;
        try {
            if (dataManager.editingId !== null) await api.patch(`${path}/${encodeURIComponent(dataManager.editingId)}`, payload);
            else await api.post(path, payload);
            DQ.toast(dataManager.editingId === null ? "Record created" : "Record updated");
            closeDataEditor(); loadDataManagement();
        } catch (error) { document.getElementById("data-form-error").textContent = error.message; }
    }

    async function loadBasketView() {
        const tbody = document.getElementById("basket-tbody");
        setLoading(tbody, 6);
        try {
            const result = await api.get("/api/v1/dashboard/market-basket");
            const rows = result.items || [];
            tbody.innerHTML = rows.map(row => `<tr style="cursor:default">
                <td class="cell-strong">${esc(row.item_a_name)} + ${esc(row.item_b_name)}</td>
                <td>${esc(row.restaurant_id)}</td>
                <td class="num">${fmt.num(row.pair_orders)}</td>
                <td class="num">${fmt.pct(Number(row.support) * 100, 2)}</td>
                <td class="num">${fmt.pct(Number(row.confidence_a_to_b) * 100, 2)}</td>
                <td class="num">${Number(row.lift || 0).toFixed(3)}</td>
            </tr>`).join("") || `<tr><td colspan="6">${emptyState("No association evidence", "Run the market-basket analysis to produce support and confidence measures.", "bag")}</td></tr>`;
        } catch (error) { tbody.innerHTML = `<tr><td colspan="6">${errorState(error.message)}</td></tr>`; }
    }

    async function loadPriceView(query = "") {
        const tbody = document.getElementById("price-tbody");
        setLoading(tbody, 5);
        try {
            const result = await api.get("/api/v1/dashboard/pricing", { q: query });
            tbody.innerHTML = (result.items || []).map(row => `<tr style="cursor:default">
                <td class="cell-strong">${esc(row.item_name)}</td>
                <td class="num">${fmt.num(row.months_observed)}</td>
                <td class="num">${fmt.money0(row.average_price)}</td>
                <td class="num">${fmt.num(row.total_units)}</td>
                <td class="num">${Number(row.price_elasticity).toFixed(2)}</td>
                <td>${row.price_sensitive ? badge("Highly sensitive", "amber") : badge("Lower sensitivity", "green-solid")}</td>
            </tr>`).join("") || `<tr><td colspan="6">${emptyState("No pricing evidence", "Historical price and demand data is not available for this item.", "trend")}</td></tr>`;
        } catch (error) { tbody.innerHTML = `<tr><td colspan="6">${errorState(error.message)}</td></tr>`; }
    }

    async function loadForecastView() {
        const source = document.getElementById("forecast-source");
        const tbody = document.getElementById("forecast-tbody");
        try {
            const horizon = document.getElementById("forecast-horizon").value;
            const result = await api.get("/api/v1/dashboard/forecast", { horizon });
            const points = result.points || [];
            const metrics = (result.evaluation || []).map(row =>
                `${row.model}: MAE ${fmt.money0(row.mae)}, RMSE ${fmt.money0(row.rmse)}, MAPE ${Number(row.mape).toFixed(2)}%`).join(" · ");
            source.textContent = `${result.source || "Forecast evidence"} · ${points.length} chronological holdout days${metrics ? " · " + metrics : ""}`;
            DQ.charts.bars(document.getElementById("forecast-chart"), points.map(row => ({
                label: row.date, value: Number(row.python_model_prediction) || 0,
                value2: Number(row.actual_sales) || 0,
            })), { height: 260, legend: ["Forecast", "Actual"] });
            const fields = ["date", "actual_sales", "python_model_prediction", "naive_prediction", "in_sample"];
            document.getElementById("forecast-head").innerHTML = fields.map(field => `<th>${esc(field.replace(/_/g, " "))}</th>`).join("");
            tbody.innerHTML = points.map(row => `<tr style="cursor:default">${fields.map(field => {
                const value = row[field];
                return `<td>${field.endsWith("sales") || field.includes("prediction") ? fmt.money0(value) : esc(value)}</td>`;
            }).join("")}</tr>`).join("") || `<tr><td colspan="5">${emptyState("No forecast records", "Generate a chronological forecast to populate this view.", "chart")}</td></tr>`;
        } catch (error) { source.textContent = error.message; tbody.innerHTML = `<tr><td colspan="5">${errorState(error.message)}</td></tr>`; }
    }

    async function loadPeakView() {
        const tbody = document.getElementById("peak-view-tbody");
        try {
            const result = await api.get("/api/v1/dashboard/peak-hours");
            const rows = result.rows || [];
            tbody.innerHTML = rows.map(row => `<tr style="cursor:default"><td>${esc(row.hour)}</td><td>${esc(row.day_type)}</td><td class="num">${fmt.num(row.orders)}</td><td class="num">${fmt.money0(row.revenue)}</td></tr>`).join("") || `<tr><td colspan="4">${emptyState("No peak-period records", "Run the Spark SQL peak-period analysis to populate this view.", "clock")}</td></tr>`;
            const grouped = new Map();
            rows.forEach(row => {
                const hour = Number(row.hour);
                const key = String(hour).padStart(2, "0") + ":00";
                const previous = grouped.get(key) || { label: key, value: 0, value2: 0 };
                if (/weekend/i.test(String(row.day_type))) previous.value2 += Number(row.orders) || 0;
                else previous.value += Number(row.orders) || 0;
                grouped.set(key, previous);
            });
            DQ.charts.bars(document.getElementById("peak-view-chart"), [...grouped.values()],
                { money: false, height: 260, legend: ["Weekday", "Weekend"] });
        } catch (error) { tbody.innerHTML = `<tr><td colspan="4">${errorState(error.message)}</td></tr>`; }
    }

    async function loadAnomalyView() {
        const list = document.getElementById("alerts-list");
        const kpis = document.getElementById("alerts-kpis");
        setLoading(list, 4);
        try {
            const [anomalies, alerts] = await Promise.all([
                api.get("/api/v1/dashboard/anomalies"), api.get("/api/v1/dashboard/alerts"),
            ]);
            const rows = [...(anomalies.sales || []).map(row => ({ type: row.anomaly_type, entity: row.entity, period: row.period, value: row.value, detail: row.note, level: Number(row.z_score) >= 4 ? "HIGH" : "MEDIUM" })),
                ...(anomalies.ratings || []).map(row => ({ type: "rating_anomaly", entity: row.item_name, period: "Recorded rating history", value: row.average_rating, detail: `${row.rating_count} ratings; range ${row.minimum_rating}–${row.maximum_rating}`, level: "HIGH" }))];
            kpis.innerHTML = [kpiMini("Anomaly records", fmt.num(rows.length), "sales and rating signals"),
                kpiMini("Rating signals", fmt.num((anomalies.ratings || []).length), "items flagged by the rating pipeline"),
                kpiMini("Operational alerts", fmt.num((alerts.items || []).length), "current evidence-backed alerts"),
                kpiMini("Source status", anomalies.data_status === "ok" ? "Available" : "Missing", "processed analytics")].join("");
            list.innerHTML = rows.map(row => `<article class="alert-item"><div>${badge(row.level, row.level === "HIGH" ? "red" : "amber")}</div><div><strong>${esc(row.type)} · ${esc(row.entity)}</strong><p>${esc(row.detail)} · ${esc(row.period)} · observed value ${esc(row.value)}</p></div></article>`).join("") || emptyState("No anomalies recorded", "No sales or rating anomalies were found in the current evidence.", "check");
            if (!rows.length && alerts.items && alerts.items.length) {
                list.innerHTML = alerts.items.map(row => `<article class="alert-item"><div>${badge(row.level, row.level === "danger" ? "red" : "amber")}</div><div><strong>${esc(row.title)}</strong><p>${esc(row.body)}</p></div></article>`).join("");
            }
        } catch (error) { kpis.innerHTML = errorState(error.message); list.innerHTML = ""; }
    }

    let whatIfTimer;
    async function loadWhatIfItems() {
        const select = document.getElementById("whatif-item");
        try {
            const result = await api.get("/api/v1/dashboard/dishes", { limit: 100 });
            select.innerHTML = `<option value="">All menu items</option>` + (result.items || []).map(row =>
                `<option value="${esc(row.menu_item_id)}">${esc(row.item_name)}</option>`).join("");
            updateWhatIf();
        } catch (error) { document.getElementById("whatif-assumption").textContent = error.message; }
    }
    function updateWhatIf() {
        clearTimeout(whatIfTimer);
        const range = document.getElementById("whatif-range");
        const scenario = document.getElementById("whatif-scenario");
        if (!range || !scenario) return;
        const change = Number(range.value) || 0;
        document.getElementById("whatif-rate").textContent = `${change}%`;
        document.getElementById("whatif-assumption").textContent = "Demand response to price or discounts is not inferred without validated elasticity evidence.";
        whatIfTimer = setTimeout(async () => {
            try {
                const result = await api.post("/api/v1/dashboard/what-if", {
                    scenario: scenario.value, change_percent: change,
                    menu_item_id: document.getElementById("whatif-item").value || null,
                });
                document.getElementById("whatif-base").textContent = fmt.money0(result.baseline.revenue);
                document.getElementById("whatif-base-profit").textContent = `Contribution ${fmt.money0(result.baseline.contribution)} · demand ${fmt.num(result.baseline.demand_units)} units`;
                document.getElementById("whatif-date").textContent = result.menu_item_id ? `Menu item ${result.menu_item_id}` : "All loaded menu items";
                document.getElementById("whatif-result").textContent = fmt.money0(result.estimated.revenue);
                document.getElementById("whatif-delta").textContent = `Revenue impact ${fmt.money0(result.impact.revenue)} · demand estimate ${fmt.num(result.estimated.demand_units)} units`;
                document.getElementById("whatif-profit-result").textContent = `Estimated contribution ${fmt.money0(result.estimated.contribution)} (${fmt.money0(result.impact.contribution)} impact)`;
            } catch (error) { document.getElementById("whatif-delta").textContent = error.message; }
        }, 180);
    }

    async function loadRecommendationsView() {
        const tbody = document.getElementById("recommendations-tbody");
        const source = document.getElementById("recommendations-source");
        try {
            const result = await api.get("/api/v1/dashboard/recommendations");
            const rows = result.items || [];
            const keys = rows.length ? Object.keys(rows[0]) : [];
            document.getElementById("recommendations-head").innerHTML = keys.map(key => `<th>${esc(key.replace(/_/g, " "))}</th>`).join("");
            tbody.innerHTML = rows.map(row => `<tr style="cursor:default">${keys.map(key => `<td>${esc(row[key])}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="5">${emptyState("No recommendations available", "Run the analytics pipeline to create evidence-backed actions.", "spark")}</td></tr>`;
            source.textContent = result.data_status === "ok" ? `${rows.length} pipeline recommendations with evidence` : "No recommendation artifact is available";
        } catch (error) { source.textContent = error.message; tbody.innerHTML = ""; }
    }

    async function loadQualityView() {
        try {
            const [reports, pipeline, meta] = await Promise.all([
                api.get("/api/v1/dashboard/reports"), api.get("/api/v1/pipeline/status"),
                api.get("/api/v1/dashboard/meta"),
            ]);
            const checks = reports.quality || [];
            const totalRows = (meta.data_sources || []).reduce((sum, source) => sum + (Number(source.rows) || 0), 0);
            const quarantined = Object.values(reports.quarantine || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
            document.getElementById("quality-kpis").innerHTML = [
                kpiMini("Data sources", fmt.num((meta.data_sources || []).length), "pipeline artifacts available"),
                kpiMini("Rows in loaded layers", fmt.num(totalRows), "source counts reported by the data layer"),
                kpiMini("Quarantined rows", fmt.num(quarantined), "retained for review"),
            ].join("");
            document.getElementById("quality-steps").innerHTML = (pipeline.steps || []).map(step => `<tr style="cursor:default"><td class="cell-strong">${esc(step.name)}</td><td>${badge(step.status, step.status === "ok" ? "green-solid" : step.status === "fail" ? "red" : "gray")}</td><td>${esc(step.detail)}</td></tr>`).join("") || `<tr><td colspan="3">No processing status is available.</td></tr>`;
            
            // Build the visual track
            const visualTrack = document.getElementById("pipeline-visual-track");
            if (visualTrack) {
                if (pipeline.steps && pipeline.steps.length) {
                    visualTrack.innerHTML = pipeline.steps.map(step => `
                        <div class="pipeline-node ${esc(step.status)}">
                            <div class="pipeline-dot"></div>
                            <div class="pipeline-label">${esc(step.name)}</div>
                            <div class="pipeline-meta">${step.status === "ok" ? "Completed" : step.status === "fail" ? "Failed" : "Pending"}</div>
                        </div>
                    `).join("");
                } else {
                    visualTrack.innerHTML = emptyState("No pipeline telemetry", "Pipeline graph cannot be established.", "cpu");
                }
            }

            const columns = checks.length ? Object.keys(checks[0]) : [];
            document.getElementById("quality-head").innerHTML = columns.map(key => `<th>${esc(key.replace(/_/g, " "))}</th>`).join("");
            document.getElementById("quality-tbody").innerHTML = checks.map(row => `<tr style="cursor:default">${columns.map(key => `<td>${esc(row[key])}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="4">No quality report is available.</td></tr>`;
        } catch (error) { document.getElementById("quality-kpis").innerHTML = errorState(error.message); }
    }

    async function loadTeamView() {
        const tbody = document.getElementById("team-tbody");
        const status = document.getElementById("team-status");
        try {
            const result = await api.get("/api/v1/auth/users");
            status.textContent = "Administrator access: update user roles for this workspace.";
            tbody.innerHTML = (result.users || []).map(user => `<tr style="cursor:default">
                <td class="cell-strong">${esc(user.name)}</td><td>${esc(user.email)}</td><td>${esc(user.brand)}</td>
                <td><select class="control team-role" data-email="${esc(user.email)}">${["Data Analyst", "Restaurant Manager", "Regional Manager", "Administrator"].map(role => `<option ${user.role === role ? "selected" : ""}>${role}</option>`).join("")}</select></td>
                <td>${esc(user.created_at || "—")}</td><td><button class="btn btn-ghost btn-sm team-save" type="button" data-email="${esc(user.email)}">Save role</button></td></tr>`).join("") || `<tr><td colspan="6">No user accounts are registered.</td></tr>`;
            tbody.querySelectorAll(".team-save").forEach(button => button.addEventListener("click", async () => {
                const select = tbody.querySelector(`.team-role[data-email="${CSS.escape(button.dataset.email)}"]`);
                try { await api.patch(`/api/v1/auth/users/${encodeURIComponent(button.dataset.email)}/role`, { role: select.value }); DQ.toast("Account role updated"); }
                catch (error) { DQ.toast(error.message, "error"); }
            }));
        } catch (error) {
            status.textContent = error.status === 403 ? "Role administration is restricted to administrators." : error.message;
            tbody.innerHTML = `<tr><td colspan="6">${emptyState("User directory unavailable", status.textContent, "users")}</td></tr>`;
        }
    }

    async function loadUsageView() {
        try {
            const [meta, status, pipeline] = await Promise.all([
                api.get("/api/v1/dashboard/meta"), api.get("/api/v1/status"),
                api.get("/api/v1/pipeline/status"),
            ]);
            const rows = meta.data_sources || [];
            const totalRows = rows.reduce((sum, source) => sum + (Number(source.rows) || 0), 0);
            document.getElementById("usage-kpis").innerHTML = [
                kpiMini("Pipeline status", status.status, status.engine),
                kpiMini("Loaded data sources", fmt.num(rows.length), "processed and evidence layers"),
                kpiMini("Reported rows", fmt.num(totalRows), "from current source registry"),
                kpiMini("Latest run", pipeline.last_processing_run ? esc(pipeline.last_processing_run.slice(0, 16)) : "Unavailable", "processing evidence"),
            ].join("");
            document.getElementById("usage-sources").innerHTML = rows.map(source => `<tr style="cursor:default"><td class="cell-strong">${esc(source.label)}</td><td class="num">${fmt.num(source.rows)}</td><td>${badge(source.status, source.status === "available" ? "green-solid" : "red")}</td></tr>`).join("");
        } catch (error) { document.getElementById("usage-kpis").innerHTML = errorState(error.message); }
    }
    
    async function loadChannelsView() {
        const tbody = document.getElementById("channels-tbody");
        setLoading(tbody, 3);
        try {
            const r = await api.get("/api/v1/dashboard/channels");
            document.getElementById("channels-kpis").innerHTML = [
                kpiMini("Active Channels", fmt.num((r.rows || []).length), "sources with completed orders"),
                kpiMini("Omnichannel Revenue", fmt.money0(r.rows.reduce((sum, x) => sum + x.revenue, 0)), "across all active channels"),
                kpiMini("Total Refunds", fmt.money0(r.rows.reduce((sum, x) => sum + x.refunds, 0)), "deducted from revenue"),
            ].join("");
            
            tbody.innerHTML = (r.rows || []).map(row => `<tr style="cursor:default">
                <td class="cell-strong">${esc(row.channel)}</td>
                <td class="num">${fmt.num(row.orders)}</td>
                <td class="num">${fmt.money2(row.revenue)}</td>
                <td class="num">${fmt.money2(row.avg_order_value)}</td>
                <td class="num" style="color:var(--danger)">${fmt.money2(row.refunds)}</td>
            </tr>`).join("") || `<tr><td colspan="5">${emptyState("No channel data found", "Pipeline data not available for channels.", "globe")}</td></tr>`;
            
            // Build the charts
            if (r.rows && r.rows.length && window.DQ.charts) {
                // Pie/Donut for Network Distribution
                const pieData = r.rows.slice(0, 5).map(c => ({ label: c.channel, value: c.revenue }));
                if (pieData.length) {
                    DQ.charts.donut(document.getElementById("channel-chart-dist"), pieData);
                }
                
                // Stacked/Area chart for trends
                if (r.monthly && r.monthly.months && r.monthly.months.length) {
                    const topChan = r.rows[0].channel;
                    const topSeries = r.monthly.series[topChan] || [];
                    const points = topSeries.map((val, idx) => ({ label: r.monthly.months[idx], value: val }));
                    DQ.charts.areaLine(document.getElementById("channel-chart-trend"), points, { color: "var(--accent-2)" });
                    document.getElementById("channel-chart-trend").previousElementSibling.querySelector(".card-sub").textContent = `Monthly revenue for ${esc(topChan)}`;
                }
            }
        } catch (error) { tbody.innerHTML = `<tr><td colspan="5">${errorState(error.message)}</td></tr>`; }
    }
    
    DQ.registerView("channels", () => {}, loadChannelsView);

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
