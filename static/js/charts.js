/* ============================================================
   DineIQ Dashboard — Handcrafted SVG Charts
   Ultra-responsive, theme-aware, glowing gradients, hover-enabled
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

    function ensureInsight(wrap, message) {
        let note = wrap.querySelector(".chart-insight");
        if (!note) {
            note = document.createElement("div");
            note.className = "chart-insight";
            wrap.appendChild(note);
        }
        note.innerHTML = message || "";
        note.hidden = !message;
        return note;
    }

    function autoInsight(points, kind, opts) {
        points = points || [];
        opts = opts || {};
        if (!points.length) return "";
        const n = points.length;
        const num = v => Number(v) || 0;
        const fmtValue = v => opts.money === false ? DQ.fmt.num(Math.round(num(v))) : DQ.fmt.money(num(v));
        if (kind === "donut") {
            const total = points.reduce((sum, p) => sum + num(p.value), 0);
            if (!total) return "";
            const top = [...points].sort((a, b) => num(b.value) - num(a.value))[0];
            return `<strong>Largest share:</strong> ${DQ.esc(top.label)} · ${(num(top.value) / total * 100).toFixed(1)}% of the plotted total.`;
        }
        if (kind === "stacked") {
            const totals = points.map(p => ({ label: p.label, value: (p.values || []).reduce((a, x) => a + num(x.value), 0) }));
            const peak = [...totals].sort((a, b) => b.value - a.value)[0];
            return `<strong>Peak period:</strong> ${DQ.esc(peak.label)} · ${fmtValue(peak.value)} combined activity in the plotted series.`;
        }
        if (points.some(p => p.value2 !== undefined)) {
            const diffs = points.map(p => ({ label: p.label, diff: num(p.value) - num(p.value2), a: num(p.value), b: num(p.value2) }));
            const largest = [...diffs].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
            const winner = largest.diff >= 0 ? "primary" : "comparison";
            return `<strong>Largest gap:</strong> ${DQ.esc(largest.label)} · ${winner} series leads by ${fmtValue(Math.abs(largest.diff))}.`;
        }
        const latest = points[n - 1];
        const peak = [...points].sort((a, b) => num(b.value) - num(a.value))[0];
        const first = num(points[0].value);
        const last = num(latest.value);
        const delta = first ? ((last - first) / Math.abs(first)) * 100 : 0;
        const trend = delta > 1 ? "up" : delta < -1 ? "down" : "stable";
        return `<strong>Signal:</strong> peak at ${DQ.esc(peak.label)} · ${fmtValue(peak.value)}; latest is ${trend} ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% versus the first plotted point.`;
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

    charts.store = function (wrapEl, payload) {
        wrapEl._chartData = payload;
        charts._nodes.add(wrapEl);
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

    // Auto re-render on resize
    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            charts.rerenderStored();
        }, 120);
    });

    /* ---------------- Area / Line Chart ---------------- */
    charts.areaLine = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "area", points, opts });
        wrap.innerHTML = "";
        points = points || [];
        
        const W = 760;
        const H = opts.height || 260;
        const pad = { l: 56, r: 16, t: 20, b: 34 };
        const accent = opts.color || cssVar("--accent") || "#f59e0b";
        const accent2 = opts.color2 || cssVar("--accent-2") || "#14b8a6";
        const grid = cssVar("--chart-grid") || "rgba(128,128,128,.12)";
        const text3 = cssVar("--text-3") || "#64748b";
        const text2 = cssVar("--text-2") || "#94a3b8";

        const svg = el("svg", {
            class: "chart-svg-wide",
            viewBox: `0 0 ${W} ${H}`,
            preserveAspectRatio: "none",
            role: "img",
            "aria-label": opts.aria || "Time series chart",
        });
        wrap.appendChild(svg);

        if (!points.length) {
            const msg = el("text", {
                x: W / 2, y: H / 2, "text-anchor": "middle",
                fill: text2, "font-size": "13", "font-weight": "600", "font-family": "inherit",
            }, svg);
            msg.textContent = "No data for this range";
            return;
        }

        const values = points.map(p => +p.value || 0);
        const yMax = niceMax(Math.max(...values) * 1.15);
        const n = points.length;
        const plotW = W - pad.l - pad.r;
        const plotH = H - pad.t - pad.b;
        const xOf = i => pad.l + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;

        // Horizontal grid & y-axis labels
        const steps = 4;
        for (let s = 0; s <= steps; s++) {
            const v = (yMax / steps) * s;
            const y = yOf(v);
            el("line", {
                x1: pad.l, x2: W - pad.r, y1: y, y2: y,
                stroke: grid, "stroke-width": 1, "stroke-dasharray": s === 0 ? "none" : "3 3",
            }, svg);
            const lbl = el("text", {
                x: pad.l - 10, y: y + 4, "text-anchor": "end",
                fill: text3, "font-size": "10.5", "font-weight": "600", "font-family": "inherit",
            }, svg);
            lbl.textContent = opts.money === false ? DQ.fmt.num(Math.round(v)) : DQ.fmt.axisMoney(v);
        }

        // X-axis labels
        const maxLabels = opts.maxXLabels || (W > 600 ? 8 : 5);
        const every = Math.max(1, Math.ceil(n / maxLabels));
        points.forEach((p, i) => {
            if (i % every !== 0 && i !== n - 1) return;
            const x = xOf(i);
            const lbl = el("text", {
                x, y: H - 10, "text-anchor": "middle",
                fill: text3, "font-size": "10.5", "font-weight": "600", "font-family": "inherit",
            }, svg);
            lbl.textContent = p.label;
        });

        const pts = points.map((p, i) => [xOf(i), yOf(+p.value || 0)]);
        const line = smoothPath(pts, opts.tension);

        // Area fill
        if (pts.length > 1) {
            el("path", {
                d: line + ` L ${pts[pts.length - 1][0]} ${yOf(0)} L ${pts[0][0]} ${yOf(0)} Z`,
                fill: accent, "fill-opacity": 0.08, stroke: "none",
            }, svg);
        }

        // Main line path
        el("path", {
            d: line, fill: "none", stroke: accent,
            "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round",
        }, svg);

        // Data dots
        pts.forEach(([x, y]) => {
            el("circle", {
                cx: x, cy: y, r: 3.5,
                fill: cssVar("--card") || "#0f1524", stroke: accent, "stroke-width": 2,
            }, svg);
        });

        // Hover interaction
        const tip = ensureTip(wrap);
        const hoverLine = el("line", {
            y1: pad.t, y2: H - pad.b, stroke: accent, "stroke-width": 1.5,
            "stroke-dasharray": "4 4", opacity: 0,
        }, svg);
        const hoverDot = el("circle", {
            r: 4.5, fill: accent, stroke: cssVar("--card") || "#0f1524", "stroke-width": 1.5, opacity: 0,
        }, svg);
        const hit = el("rect", {
            x: pad.l - 8, y: 0, width: plotW + 16, height: H, fill: "transparent",
            cursor: "crosshair",
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
            hoverLine.setAttribute("opacity", 0.8);
            hoverDot.setAttribute("cx", x); hoverDot.setAttribute("cy", y);
            hoverDot.setAttribute("opacity", 1);
            tip.hidden = false;
            tip.innerHTML = `
                <div class="tip-label">${DQ.esc(p.sublabel ? p.label + " · " + p.sublabel : p.label)}</div>
                <div class="tip-value">${opts.money === false ? DQ.fmt.num(p.value) : DQ.fmt.money(p.value)}</div>
                ${p.orders !== undefined ? `<div class="tip-label" style="margin-top:2px">${DQ.fmt.num(p.orders)} order(s)</div>` : ""}`;
            
            const px = (x / W) * rect.width;
            const tipWidth = tip.offsetWidth || 130;
            tip.style.left = Math.min(Math.max(px - tipWidth / 2, 8), rect.width - tipWidth - 8) + "px";
            tip.style.top = Math.max(((y / H) * rect.height) - 76, 8) + "px";
        });

        hit.addEventListener("mouseleave", () => {
            hoverLine.setAttribute("opacity", 0);
            hoverDot.setAttribute("opacity", 0);
            tip.hidden = true;
        });
        ensureInsight(wrap, opts.insight || autoInsight(points, "area", opts));
    };

    /* ---------------- Grouped Bars ---------------- */
    charts.bars = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "bars", points, opts });
        wrap.innerHTML = "";
        points = points || [];
        
        const W = 760;
        const H = opts.height || 250;
        const pad = { l: 52, r: 16, t: 20, b: 34 };
        const grid = cssVar("--chart-grid") || "rgba(128,128,128,.12)";
        const text3 = cssVar("--text-3") || "#64748b";
        const c1 = opts.color || cssVar("--accent") || "#f59e0b";
        const c2 = opts.color2 || "#38bdf8";

        const svg = el("svg", {
            class: "chart-svg-wide",
            viewBox: `0 0 ${W} ${H}`,
            preserveAspectRatio: "none",
            role: "img",
            "aria-label": opts.aria || "Bar chart",
        });
        wrap.appendChild(svg);

        if (!points.length) {
            const msg = el("text", {
                x: W / 2, y: H / 2, "text-anchor": "middle",
                fill: text3, "font-size": "13", "font-weight": "600", "font-family": "inherit",
            }, svg);
            msg.textContent = "No data for this range";
            return;
        }

        const hasCompare = points.some(p => p.value2 !== undefined);
        const yMax = niceMax(Math.max(...points.map(p => Math.max(+p.value || 0, hasCompare ? (+p.value2 || 0) : 0))) * 1.15);
        const plotW = W - pad.l - pad.r;
        const plotH = H - pad.t - pad.b;
        const slot = plotW / points.length;
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;

        // Gradients for bars
        const defs = el("defs", {}, svg);
        const bGrad1 = el("linearGradient", { id: "bg1", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el("stop", { offset: "0%", "stop-color": c1, "stop-opacity": 1 }, bGrad1);
        el("stop", { offset: "100%", "stop-color": c1, "stop-opacity": 0.7 }, bGrad1);

        const bGrad2 = el("linearGradient", { id: "bg2", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el("stop", { offset: "0%", "stop-color": c2, "stop-opacity": 1 }, bGrad2);
        el("stop", { offset: "100%", "stop-color": c2, "stop-opacity": 0.7 }, bGrad2);

        // Y Grid
        const steps = 3;
        for (let s = 0; s <= steps; s++) {
            const v = (yMax / steps) * s;
            const y = yOf(v);
            el("line", {
                x1: pad.l, x2: W - pad.r, y1: y, y2: y,
                stroke: grid, "stroke-width": 1, "stroke-dasharray": s === 0 ? "none" : "3 3",
            }, svg);
            const lbl = el("text", {
                x: pad.l - 10, y: y + 4, "text-anchor": "end",
                fill: text3, "font-size": "10.5", "font-weight": "600", "font-family": "inherit",
            }, svg);
            lbl.textContent = opts.money === false ? DQ.fmt.num(Math.round(v)) : DQ.fmt.axisMoney(v);
        }

        const tip = ensureTip(wrap);
        points.forEach((p, i) => {
            const bw = hasCompare ? Math.min(slot * 0.34, 15) : Math.min(slot * 0.55, 26);
            const cx = pad.l + slot * i + slot / 2;
            const bars = hasCompare
                ? [[cx - bw - 2, +p.value || 0, c1, c1, opts.legend ? opts.legend[0] : "Primary"],
                   [cx + 2, +p.value2 || 0, c2, c2, opts.legend ? opts.legend[1] : "Secondary"]]
                : [[cx - bw / 2, +p.value || 0, c1, c1, ""]];

            bars.forEach(([x, v, fill, color, leg]) => {
                const y = yOf(v);
                const h = Math.max(pad.t + plotH - y, v > 0 ? 3 : 0);
                const rect = el("rect", {
                    x, y, width: bw, height: h, rx: 4, ry: 4, fill,
                    cursor: "pointer",
                }, svg);

                rect.addEventListener("mouseenter", () => {
                    rect.setAttribute("opacity", "0.82");
                    tip.hidden = false;
                    tip.innerHTML = `
                        <div class="tip-label">${DQ.esc(p.sublabel ? p.label + " · " + p.sublabel : p.label)}${leg ? ` · <span style="color:${color}">${DQ.esc(leg)}</span>` : ""}</div>
                        <div class="tip-value">${opts.money === false ? DQ.fmt.num(v) : DQ.fmt.money(v)}</div>`;
                    const rectSvg = svg.getBoundingClientRect();
                    const px = ((x + bw / 2) / W) * rectSvg.width;
                    const tipWidth = tip.offsetWidth || 130;
                    tip.style.left = Math.min(Math.max(px - tipWidth / 2, 8), rectSvg.width - tipWidth - 8) + "px";
                    tip.style.top = Math.max((y / H) * rectSvg.height - 68, 8) + "px";
                });
                rect.addEventListener("mouseleave", () => {
                    rect.removeAttribute("opacity");
                    tip.hidden = true;
                });
            });

            if (points.length <= 16 || i % 2 === 0) {
                const lbl = el("text", {
                    x: cx, y: H - 10, "text-anchor": "middle",
                    fill: text3, "font-size": "10.5", "font-weight": "600", "font-family": "inherit",
                }, svg);
                lbl.textContent = p.label;
            }
        });

        // Legend
        if (opts.legend && opts.legend.length) {
            const g = el("g", {}, svg);
            opts.legend.forEach((item, i) => {
                const legX = pad.l + i * 140;
                el("rect", { x: legX, y: 2, width: 10, height: 10, rx: 3, fill: i === 0 ? c1 : c2 }, g);
                const t = el("text", {
                    x: legX + 16, y: 11, fill: text3,
                    "font-size": "11", "font-weight": "600", "font-family": "inherit",
                }, g);
                t.textContent = item;
            });
        }
        ensureInsight(wrap, opts.insight || autoInsight(points, "bars", opts));
    };

    /* ---------------- Stacked Bars ---------------- */
    charts.stacked = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "stacked", points, opts });
        wrap.innerHTML = "";
        points = points || [];
        
        const W = 760;
        const H = opts.height || 250;
        const pad = { l: 56, r: 16, t: 24, b: 34 };
        const grid = cssVar("--chart-grid") || "rgba(128,128,128,.12)";
        const text3 = cssVar("--text-3") || "#64748b";

        const svg = el("svg", {
            class: "chart-svg-wide",
            viewBox: `0 0 ${W} ${H}`,
            preserveAspectRatio: "none",
            role: "img",
            "aria-label": opts.aria || "Stacked bar chart",
        });
        wrap.appendChild(svg);

        if (!points.length) {
            const msg = el("text", {
                x: W / 2, y: H / 2, "text-anchor": "middle",
                fill: text3, "font-size": "13", "font-weight": "600", "font-family": "inherit",
            }, svg);
            msg.textContent = "No data for this range";
            return;
        }

        const totals = points.map(p => (p.values || []).reduce((a, s) => a + (+s.value || 0), 0));
        const yMax = niceMax(Math.max(...totals) * 1.15) || 1;
        const plotW = W - pad.l - pad.r;
        const plotH = H - pad.t - pad.b;
        const slot = plotW / points.length;
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;

        // Grid lines
        const steps = 3;
        for (let s = 0; s <= steps; s++) {
            const v = (yMax / steps) * s;
            const y = yOf(v);
            el("line", {
                x1: pad.l, x2: W - pad.r, y1: y, y2: y,
                stroke: grid, "stroke-width": 1, "stroke-dasharray": s === 0 ? "none" : "3 3",
            }, svg);
            const lbl = el("text", {
                x: pad.l - 10, y: y + 4, "text-anchor": "end",
                fill: text3, "font-size": "10.5", "font-weight": "600", "font-family": "inherit",
            }, svg);
            lbl.textContent = DQ.fmt.axisMoney(v);
        }

        const tip = ensureTip(wrap);
        const bw = Math.min(slot * 0.56, 28);
        points.forEach((p, i) => {
            const cx = pad.l + slot * i + slot / 2;
            let acc = 0;
            const nonZero = (p.values || []).filter(s => (+s.value || 0) > 0);
            
            nonZero.forEach((seg, sIdx) => {
                const v = +seg.value || 0;
                const y0 = yOf(acc + v), y1 = yOf(acc);
                const isTop = sIdx === nonZero.length - 1;
                const rect = el("rect", {
                    x: cx - bw / 2, y: y0, width: bw, height: Math.max(y1 - y0, 1),
                    fill: seg.color || cssVar("--accent"), rx: isTop ? 4 : 0, ry: isTop ? 4 : 0,
                    opacity: 0.95, cursor: "pointer",
                }, svg);

                rect.addEventListener("mouseenter", () => {
                    rect.setAttribute("opacity", "0.82");
                    tip.hidden = false;
                    tip.innerHTML = `
                        <div class="tip-label">${DQ.esc(p.label)} · <strong style="color:${seg.color}">${DQ.esc(seg.key)}</strong></div>
                        <div class="tip-value">${DQ.fmt.money(seg.value)}</div>
                        <div class="tip-label" style="margin-top:2px">Total: ${DQ.fmt.money(totals[i])}</div>`;
                    const rs = svg.getBoundingClientRect();
                    const px = (cx / W) * rs.width;
                    const tipWidth = tip.offsetWidth || 140;
                    tip.style.left = Math.min(Math.max(px - tipWidth / 2, 8), rs.width - tipWidth - 8) + "px";
                    tip.style.top = Math.max((y0 / H) * rs.height - 76, 8) + "px";
                });
                rect.addEventListener("mouseleave", () => {
                    rect.removeAttribute("opacity");
                    tip.hidden = true;
                });
                acc += v;
            });

            if (points.length <= 16 || i % 2 === 0) {
                const lbl = el("text", {
                    x: cx, y: H - 10, "text-anchor": "middle",
                    fill: text3, "font-size": "10.5", "font-weight": "600", "font-family": "inherit",
                }, svg);
                lbl.textContent = p.label;
            }
        });

        if (opts.legend && opts.legend.length) {
            const g = el("g", {}, svg);
            const colorOf = key => {
                for (const p of points) {
                    const s = (p.values || []).find(v => v.key === key);
                    if (s && s.color) return s.color;
                }
                return cssVar("--accent");
            };
            opts.legend.forEach((key, i) => {
                const legX = pad.l + i * 128;
                el("rect", { x: legX, y: 2, width: 10, height: 10, rx: 3, fill: colorOf(key) }, g);
                const t = el("text", {
                    x: legX + 16, y: 11, fill: text3,
                    "font-size": "11", "font-weight": "600", "font-family": "inherit",
                }, g);
                t.textContent = key;
            });
        }
        ensureInsight(wrap, opts.insight || autoInsight(points, "stacked", opts));
    };

    /* ---------------- Donut Chart ---------------- */
    charts.donut = function (wrap, segments, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "donut", segments, opts });
        wrap.innerHTML = "";
        segments = segments || [];
        
        const size = 240, r = 92, inner = 64;
        const cx = size / 2, cy = size / 2;
        const svg = el("svg", {
            class: "chart-svg-square",
            viewBox: `0 0 ${size} ${size}`,
            role: "img",
            "aria-label": opts.aria || "Share chart",
        });
        wrap.appendChild(svg);

        const total = segments.reduce((a, s) => a + (+s.value || 0), 0);
        if (!total) {
            const msg = el("text", {
                x: cx, y: cy, "text-anchor": "middle",
                fill: cssVar("--text-3"), "font-size": "13", "font-weight": "600", "font-family": "inherit",
            }, svg);
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
            
            const path = el("path", {
                d, fill: seg.color || cssVar("--accent"), opacity: 0.95,
                stroke: cssVar("--card") || "#0f1524", "stroke-width": 2,
                cursor: "pointer",
            }, svg);

            const onHover = (e) => {
                path.setAttribute("opacity", "0.82");
                tip.hidden = false;
                tip.innerHTML = `
                    <div class="tip-label">${DQ.esc(seg.label)}</div>
                    <div class="tip-value">${opts.money === false ? DQ.fmt.num(seg.value) : DQ.fmt.money(seg.value)}</div>
                    <div class="tip-label" style="color:var(--accent);font-weight:700">${(frac * 100).toFixed(1)}%</div>`;
                const rs = wrap.getBoundingClientRect();
                tip.style.left = (e.clientX - rs.left + 12) + "px";
                tip.style.top = (e.clientY - rs.top - 68) + "px";
            };

            path.addEventListener("mouseenter", onHover);
            path.addEventListener("mousemove", onHover);
            path.addEventListener("mouseleave", () => {
                path.setAttribute("opacity", "0.95");
                tip.hidden = true;
            });
            angle = a2;
        });

        // Center label & value
        const center = el("text", {
            x: cx, y: cy - 4, "text-anchor": "middle",
            fill: cssVar("--text-3"), "font-size": "11", "font-weight": "700",
            "letter-spacing": "0.06em", "text-transform": "uppercase", "font-family": "inherit",
        }, svg);
        center.textContent = opts.centerLabel || "Total";

        const centerV = el("text", {
            x: cx, y: cy + 18, "text-anchor": "middle",
            fill: cssVar("--text"), "font-size": "18", "font-weight": "800", "font-family": "inherit",
        }, svg);
        centerV.textContent = opts.money === false ? DQ.fmt.num(total) : DQ.fmt.moneyCompact(total);
        ensureInsight(wrap, opts.insight || autoInsight(segments, "donut", opts));
    };
})();
