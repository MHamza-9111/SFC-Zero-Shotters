/* ============================================================
   DineIQ Dashboard — hand-rolled SVG charts (no external libs)
   areaLine / grouped bars / donut — theme-aware, hover-enabled
   ============================================================ */
(function () {
    "use strict";

    const DQ = window.DQ;
    const NS = "http://www.w3.org/2000/svg";

    function cssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    function niceMax(v) {
        if (v <= 0) return 1;
        const exp = Math.pow(10, Math.floor(Math.log10(v)));
        const f = v / exp;
        const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
        return nf * exp;
    }

    function el(tag, attrs, parent) {
        const node = document.createElementNS(NS, tag);
        Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
        if (parent) parent.appendChild(node);
        return node;
    }

    function ensureTip(wrap) {
        let tip = wrap.querySelector(".chart-tip");
        if (!tip) {
            wrap.style.position = "relative";
            tip = document.createElement("div");
            tip.className = "chart-tip";
            tip.hidden = true;
            wrap.appendChild(tip);
        }
        return tip;
    }

    /* Catmull-Rom → cubic bezier smoothing */
    function smoothPath(pts, tension) {
        if (pts.length < 2) return "";
        const t = tension === undefined ? 0.32 : tension;
        let d = `M ${pts[0][0]} ${pts[0][1]}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2] || p2;
            const c1x = p1[0] + (p2[0] - p0[0]) * t;
            const c1y = p1[1] + (p2[1] - p0[1]) * t;
            const c2x = p2[0] - (p3[0] - p1[0]) * t;
            const c2y = p2[1] - (p3[1] - p1[1]) * t;
            d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
        }
        return d;
    }

    const charts = DQ.charts = {};

    charts._nodes = new Set();

    charts.store = function (el, payload) {
        el._chartData = payload;
        charts._nodes.add(el);
    };

    charts.rerenderStored = function () {
        charts._nodes.forEach(node => {
            if (!node.isConnected) {
                charts._nodes.delete(node);
                return;
            }
            const p = node._chartData;
            if (!p) return;
            if (p.type === "area") charts.areaLine(node, p.points, p.opts);
            else if (p.type === "bars") charts.bars(node, p.points, p.opts);
            else if (p.type === "stacked") charts.stacked(node, p.points, p.opts);
            else if (p.type === "donut") charts.donut(node, p.segments, p.opts);
        });
    };

    /* ---------------- Area / line chart ---------------- */
    charts.areaLine = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "area", points, opts });
        wrap.innerHTML = "";
        points = points || [];
        const W = 760, H = opts.height || 250;
        const pad = { l: 54, r: 14, t: 14, b: 30 };
        const accent = opts.color || cssVar("--accent") || "#35e888";
        const grid = cssVar("--chart-grid") || "rgba(128,128,128,.2)";
        const text3 = cssVar("--text-3") || "#888";
        const text2 = cssVar("--text-2") || "#aaa";

        const svg = el("svg", {
            viewBox: `0 0 ${W} ${H}`, role: "img",
            "aria-label": opts.aria || "Time series chart",
        });
        wrap.appendChild(svg);

        if (!points.length) {
            const msg = el("text", {
                x: W / 2, y: H / 2, "text-anchor": "middle",
                fill: text2, "font-size": "13", "font-family": "inherit",
            }, svg);
            msg.textContent = "No data for this range";
            return;
        }

        const values = points.map(p => +p.value || 0);
        const yMax = niceMax(Math.max(...values) * 1.12);
        const n = points.length;
        const plotW = W - pad.l - pad.r;
        const plotH = H - pad.t - pad.b;
        const xOf = i => pad.l + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;

        // grid + y labels
        const steps = 4;
        for (let s = 0; s <= steps; s++) {
            const v = (yMax / steps) * s;
            const y = yOf(v);
            el("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: grid, "stroke-width": 1 }, svg);
            const lbl = el("text", {
                x: pad.l - 8, y: y + 4, "text-anchor": "end",
                fill: text3, "font-size": "11", "font-family": "inherit",
            }, svg);
            lbl.textContent = opts.money === false ? DQ.fmt.num(Math.round(v)) : DQ.fmt.axisMoney(v);
        }

        // x labels (thinned)
        const every = Math.max(1, Math.ceil(n / (opts.maxXLabels || 7)));
        points.forEach((p, i) => {
            if (i % every !== 0 && i !== n - 1) return;
            const x = xOf(i);
            const lbl = el("text", {
                x, y: H - 8, "text-anchor": "middle",
                fill: text3, "font-size": "11", "font-family": "inherit",
            }, svg);
            lbl.textContent = p.label;
        });

        const pts = points.map((p, i) => [xOf(i), yOf(+p.value || 0)]);

        // area fill
        const gradId = "g" + Math.random().toString(36).slice(2, 8);
        const defs = el("defs", {}, svg);
        const grad = el("linearGradient", { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el("stop", { offset: "0%", "stop-color": accent, "stop-opacity": 0.22 }, grad);
        el("stop", { offset: "100%", "stop-color": accent, "stop-opacity": 0.0 }, grad);

        const line = smoothPath(pts, opts.tension);
        if (pts.length > 1) {
            el("path", {
                d: line + ` L ${pts[pts.length - 1][0]} ${yOf(0)} L ${pts[0][0]} ${yOf(0)} Z`,
                fill: `url(#${gradId})`, stroke: "none",
            }, svg);
        }
        el("path", {
            d: line, fill: "none", stroke: accent,
            "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round",
        }, svg);

        // dots
        pts.forEach(([x, y]) => {
            el("circle", { cx: x, cy: y, r: 3.4, fill: cssVar("--card") || "#fff", stroke: accent, "stroke-width": 2 }, svg);
        });

        // hover interaction
        const tip = ensureTip(wrap);
        const hoverLine = el("line", {
            y1: pad.t, y2: H - pad.b, stroke: accent, "stroke-width": 1,
            "stroke-dasharray": "4 4", opacity: 0,
        }, svg);
        const hoverDot = el("circle", { r: 5.5, fill: accent, opacity: 0 }, svg);
        const hit = el("rect", {
            x: pad.l - 10, y: 0, width: plotW + 20, height: H, fill: "transparent",
        }, svg);

        hit.addEventListener("mousemove", (e) => {
            const rect = svg.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * W;
            let best = 0, bestD = Infinity;
            pts.forEach(([x], i) => {
                const d = Math.abs(x - relX);
                if (d < bestD) { bestD = d; best = i; }
            });
            const [x, y] = pts[best];
            const p = points[best];
            hoverLine.setAttribute("x1", x); hoverLine.setAttribute("x2", x);
            hoverLine.setAttribute("opacity", 0.7);
            hoverDot.setAttribute("cx", x); hoverDot.setAttribute("cy", y);
            hoverDot.setAttribute("opacity", 1);
            tip.hidden = false;
            tip.innerHTML = `<div class="tip-label">${DQ.esc(p.sublabel ? p.label + " · " + p.sublabel : p.label)}</div>
                <div class="tip-value">${opts.money === false ? DQ.fmt.num(p.value) : DQ.fmt.money(p.value)}</div>
                ${p.orders !== undefined ? `<div class="tip-label">${DQ.fmt.num(p.orders)} order(s)</div>` : ""}`;
            const px = (x / W) * rect.width;
            tip.style.left = Math.min(Math.max(px - 60, 4), rect.width - 130) + "px";
            tip.style.top = Math.max(((y / H) * rect.height) - 72, 0) + "px";
        });
        hit.addEventListener("mouseleave", () => {
            hoverLine.setAttribute("opacity", 0);
            hoverDot.setAttribute("opacity", 0);
            tip.hidden = true;
        });
    };

    /* ---------------- Grouped bars ---------------- */
    charts.bars = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "bars", points, opts });
        wrap.innerHTML = "";
        points = points || [];
        const W = 760, H = opts.height || 230;
        const pad = { l: 46, r: 12, t: 16, b: 30 };
        const grid = cssVar("--chart-grid") || "rgba(128,128,128,.2)";
        const text3 = cssVar("--text-3") || "#888";
        const c1 = opts.color || cssVar("--accent") || "#35e888";
        const c2 = opts.color2 || "#6aa8ff";

        const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "Bar chart" });
        wrap.appendChild(svg);
        if (!points.length) {
            const msg = el("text", { x: W / 2, y: H / 2, "text-anchor": "middle", fill: text3, "font-size": "13", "font-family": "inherit" }, svg);
            msg.textContent = "No data for this range";
            return;
        }

        const hasCompare = points.some(p => p.value2 !== undefined);
        const yMax = niceMax(Math.max(...points.map(p => Math.max(+p.value || 0, hasCompare ? (+p.value2 || 0) : 0))) * 1.12);
        const plotW = W - pad.l - pad.r;
        const plotH = H - pad.t - pad.b;
        const slot = plotW / points.length;
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;

        const steps = 3;
        for (let s = 0; s <= steps; s++) {
            const v = (yMax / steps) * s;
            const y = yOf(v);
            el("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: grid, "stroke-width": 1 }, svg);
            const lbl = el("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end", fill: text3, "font-size": "11", "font-family": "inherit" }, svg);
            lbl.textContent = opts.money === false ? DQ.fmt.num(Math.round(v)) : DQ.fmt.axisMoney(v);
        }

        const tip = ensureTip(wrap);
        points.forEach((p, i) => {
            const bw = hasCompare ? Math.min(slot * 0.3, 12) : Math.min(slot * 0.5, 22);
            const cx = pad.l + slot * i + slot / 2;
            const bars = hasCompare
                ? [[cx - bw - 1, +p.value || 0, c1], [cx + 1, +p.value2 || 0, c2]]
                : [[cx - bw / 2, +p.value || 0, c1]];
            bars.forEach(([x, v, color]) => {
                const y = yOf(v);
                const h = Math.max(pad.t + plotH - y, v > 0 ? 2 : 0);
                const rect = el("rect", {
                    x, y, width: bw, height: h, rx: 3, fill: color, opacity: 0.9,
                }, svg);
                rect.addEventListener("mouseenter", () => {
                    tip.hidden = false;
                    tip.innerHTML = `<div class="tip-label">${DQ.esc(p.sublabel ? p.label + " · " + p.sublabel : p.label)}</div>
                        <div class="tip-value">${opts.money === false ? DQ.fmt.num(v) : DQ.fmt.money(v)}</div>`;
                    const rectSvg = svg.getBoundingClientRect();
                    tip.style.left = Math.min((cx / W) * rectSvg.width, rectSvg.width - 120) + "px";
                    tip.style.top = Math.max((y / H) * rectSvg.height - 64, 0) + "px";
                });
                rect.addEventListener("mouseleave", () => { tip.hidden = true; });
            });
            if (points.length <= 14 || i % 2 === 0) {
                const lbl = el("text", {
                    x: cx, y: H - 8, "text-anchor": "middle",
                    fill: text3, "font-size": "10.5", "font-family": "inherit",
                }, svg);
                lbl.textContent = p.label;
            }
        });

        if (opts.legend) {
            const g = el("g", {}, svg);
            opts.legend.forEach((item, i) => {
                el("rect", { x: pad.l + i * 130, y: 0, width: 9, height: 9, rx: 2, fill: i === 0 ? c1 : c2 }, g);
                const t = el("text", { x: pad.l + i * 130 + 14, y: 8.5, fill: text3, "font-size": "11", "font-family": "inherit" }, g);
                t.textContent = item;
            });
        }
    };

    /* ---------------- Stacked bars (e.g. payment mix per month) ---------------- */
    charts.stacked = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "stacked", points, opts });
        wrap.innerHTML = "";
        points = points || [];
        const W = 760, H = opts.height || 230;
        const pad = { l: 54, r: 12, t: 18, b: 30 };
        const grid = cssVar("--chart-grid") || "rgba(128,128,128,.2)";
        const text3 = cssVar("--text-3") || "#888";

        const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "Stacked bar chart" });
        wrap.appendChild(svg);
        if (!points.length) {
            const msg = el("text", { x: W / 2, y: H / 2, "text-anchor": "middle", fill: text3, "font-size": "13", "font-family": "inherit" }, svg);
            msg.textContent = "No data for this range";
            return;
        }

        const totals = points.map(p => (p.values || []).reduce((a, s) => a + (+s.value || 0), 0));
        const yMax = niceMax(Math.max(...totals) * 1.12) || 1;
        const plotW = W - pad.l - pad.r;
        const plotH = H - pad.t - pad.b;
        const slot = plotW / points.length;
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;

        const steps = 3;
        for (let s = 0; s <= steps; s++) {
            const v = (yMax / steps) * s;
            const y = yOf(v);
            el("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: grid, "stroke-width": 1 }, svg);
            const lbl = el("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end", fill: text3, "font-size": "11", "font-family": "inherit" }, svg);
            lbl.textContent = DQ.fmt.axisMoney(v);
        }

        const tip = ensureTip(wrap);
        const bw = Math.min(slot * 0.55, 26);
        points.forEach((p, i) => {
            const cx = pad.l + slot * i + slot / 2;
            let acc = 0;
            (p.values || []).forEach(seg => {
                const v = +seg.value || 0;
                if (v <= 0) return;
                const y0 = yOf(acc + v), y1 = yOf(acc);
                const rect = el("rect", {
                    x: cx - bw / 2, y: y0, width: bw, height: Math.max(y1 - y0, 1),
                    fill: seg.color || cssVar("--accent"), opacity: 0.92,
                }, svg);
                rect.addEventListener("mouseenter", () => {
                    tip.hidden = false;
                    tip.innerHTML = `<div class="tip-label">${DQ.esc(p.label)} · ${DQ.esc(seg.key)}</div>
                        <div class="tip-value">${DQ.fmt.money(seg.value)}</div>`;
                    const rs = svg.getBoundingClientRect();
                    tip.style.left = Math.min((cx / W) * rs.width, rs.width - 130) + "px";
                    tip.style.top = Math.max((y0 / H) * rs.height - 70, 0) + "px";
                });
                rect.addEventListener("mouseleave", () => { tip.hidden = true; });
                acc += v;
            });
            if (points.length <= 14 || i % 2 === 0) {
                const lbl = el("text", {
                    x: cx, y: H - 8, "text-anchor": "middle",
                    fill: text3, "font-size": "10.5", "font-family": "inherit",
                }, svg);
                lbl.textContent = p.label;
            }
        });

        if (opts.legend && opts.legend.length) {
            const g = el("g", {}, svg);
            const colorOf = key => {
                for (const p of points) {
                    const s = (p.values || []).find(v => v.key === key);
                    if (s) return s.color;
                }
                return cssVar("--accent");
            };
            opts.legend.forEach((key, i) => {
                el("rect", { x: pad.l + i * 118, y: 2, width: 9, height: 9, rx: 2, fill: colorOf(key) }, g);
                const t = el("text", { x: pad.l + i * 118 + 14, y: 10, fill: text3, "font-size": "11", "font-family": "inherit" }, g);
                t.textContent = key;
            });
        }
    };

    /* ---------------- Donut ---------------- */
    charts.donut = function (wrap, segments, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "donut", segments, opts });
        wrap.innerHTML = "";
        segments = segments || [];
        const size = 230, r = 86, inner = 58;
        const cx = size / 2, cy = size / 2;
        const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": opts.aria || "Share chart" });
        wrap.appendChild(svg);

        const total = segments.reduce((a, s) => a + (+s.value || 0), 0);
        if (!total) {
            const msg = el("text", { x: cx, y: cy, "text-anchor": "middle", fill: cssVar("--text-2"), "font-size": "13", "font-family": "inherit" }, svg);
            msg.textContent = "No data";
            return;
        }

        const tip = ensureTip(wrap);
        let angle = -Math.PI / 2;
        segments.forEach(seg => {
            const frac = (+seg.value || 0) / total;
            const a2 = angle + frac * Math.PI * 2;
            const large = frac > 0.5 ? 1 : 0;
            const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
            const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
            const ix1 = cx + inner * Math.cos(a2), iy1 = cy + inner * Math.sin(a2);
            const ix2 = cx + inner * Math.cos(angle), iy2 = cy + inner * Math.sin(angle);
            const d = frac >= 0.999
                ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z M ${cx} ${cy - inner} A ${inner} ${inner} 0 1 0 ${cx - 0.01} ${cy - inner} Z`
                : `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`;
            const path = el("path", { d, fill: seg.color || cssVar("--accent"), opacity: 0.92 }, svg);
            path.addEventListener("mouseenter", (e) => {
                tip.hidden = false;
                tip.innerHTML = `<div class="tip-label">${DQ.esc(seg.label)}</div>
                    <div class="tip-value">${opts.money === false ? DQ.fmt.num(seg.value) : DQ.fmt.money(seg.value)}</div>
                    <div class="tip-label">${(frac * 100).toFixed(1)}%</div>`;
                const rs = svg.getBoundingClientRect();
                tip.style.left = (e.clientX - rs.left) + "px";
                tip.style.top = (e.clientY - rs.top - 80) + "px";
            });
            path.addEventListener("mousemove", (e) => {
                const rs = svg.getBoundingClientRect();
                tip.style.left = (e.clientX - rs.left) + "px";
                tip.style.top = (e.clientY - rs.top - 80) + "px";
            });
            path.addEventListener("mouseleave", () => { tip.hidden = true; });
            angle = a2;
        });

        const center = el("text", {
            x: cx, y: cy - 4, "text-anchor": "middle",
            fill: cssVar("--text-2"), "font-size": "11", "font-family": "inherit",
        }, svg);
        center.textContent = opts.centerLabel || "Total";
        const centerV = el("text", {
            x: cx, y: cy + 18, "text-anchor": "middle",
            fill: cssVar("--text"), "font-size": "17", "font-weight": "800", "font-family": "inherit",
        }, svg);
        centerV.textContent = opts.money === false ? DQ.fmt.num(total) : DQ.fmt.moneyCompact(total);
    };
})();
