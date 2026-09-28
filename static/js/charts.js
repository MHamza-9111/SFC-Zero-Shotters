




(function () {
    "use strict";

    const DQ = window.DQ;
    const NS = "http://www.w3.org/2000/svg";

    function cssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }



    function resolveColor(color, fallback) {
        if (color === undefined || color === null || color === "") return fallback;
        const s = String(color).trim();
        if (s.startsWith("var(")) {
            const name = s.slice(4, s.lastIndexOf(")")).trim();
            return cssVar(name) || fallback;
        }
        return s;
    }



    function measureWidth(wrap, fallback) {
        try {
            const style = getComputedStyle(wrap);
            const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
            const w = wrap.clientWidth - pad;
            if (w > 60) return Math.round(w);
        } catch (_) {  }
        return fallback;
    }

    function niceMax(v) {
        if (v <= 0) return 1;
        const exp = Math.pow(10, Math.floor(Math.log10(v)));
        const f = v / exp;
        const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
        return nf * exp;
    }



    function niceScale(maxVal, target) {
        if (!(maxVal > 0)) return { max: 1, step: 1 };
        const raw = maxVal / target;
        const exp = Math.pow(10, Math.floor(Math.log10(raw)));
        const f = raw / exp;
        const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
        const step = nf * exp;
        return { max: step * target, step };
    }

    function el(tag, attrs, parent) {
        const node = document.createElementNS(NS, tag);
        Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
        if (parent) parent.appendChild(node);
        return node;
    }

    let _gradSeq = 0;
    function gradId() { return "dqg" + (++_gradSeq); }

    const DONUT_PALETTE = ["#5EE0AA", "#38BDF8", "#fbbf24", "#a78bfa", "#fb7185", "#2dd4bf", "#60a5fa", "#f472b6"];
    function donutColor(i, seg) {
        if (seg && seg.color) return resolveColor(seg.color);
        const seq = ["--accent", "--accent-2", "--warn", "--info", "--success", "--danger"];
        return cssVar(seq[i % seq.length]) || DONUT_PALETTE[i % DONUT_PALETTE.length];
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



    function placeTip(wrap, svg, tip, svgX, svgY) {
        const wrapRect = wrap.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const offX = svgRect.left - wrapRect.left;
        const offY = svgRect.top - wrapRect.top;
        const tw = tip.offsetWidth || 130;
        const absX = offX + svgX;
        const left = Math.min(Math.max(absX - tw / 2, 6), Math.max(6, wrapRect.width - tw - 6));
        const absY = offY + svgY;
        const top = Math.max(absY - 74, 6);
        tip.style.left = left + "px";
        tip.style.top = top + "px";
    }

    function nextFrame(fn) {
        requestAnimationFrame(() => requestAnimationFrame(fn));
    }

    function shouldAnimate() {
        if (charts._skipAnim) return false;
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
        return true;
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
    charts._skipAnim = false;

    charts.store = function (wrapEl, payload) {
        wrapEl._chartData = payload;
        charts._nodes.add(wrapEl);
    };

    charts.rerenderStored = function () {
        charts._skipAnim = true;
        try {
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
        } finally {
            charts._skipAnim = false;
        }
    };


    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            charts.rerenderStored();
        }, 120);
    });


    function renderGrid(svg, { W, H, pad, yMax, steps, grid, text3, moneyFalse }) {
        for (let s = 0; s <= steps; s++) {
            const v = (yMax / steps) * s;
            const y = pad.t + (H - pad.t - pad.b) - (v / yMax) * (H - pad.t - pad.b);
            el("line", {
                x1: pad.l, x2: W - pad.r, y1: y, y2: y,
                stroke: grid, "stroke-width": 1, "stroke-dasharray": s === 0 ? "none" : "3 4",
            }, svg);
            const lbl = el("text", {
                x: pad.l - 10, y: y + 3.5, "text-anchor": "end",
                fill: text3, "font-size": "10", "font-weight": "500", "font-family": "inherit",
            }, svg);
            lbl.textContent = moneyFalse ? DQ.fmt.num(Math.round(v)) : DQ.fmt.axisMoney(v);
        }
    }




    function xLabelPlan(points, plotW, W) {
        const n = points.length;
        const maxLabels = W < 460 ? 5 : (W < 680 ? 8 : 11);
        const every = Math.max(1, Math.ceil(n / maxLabels));
        const idx = [];
        for (let i = 0; i < n; i += every) idx.push(i);
        if (n > 1 && idx[idx.length - 1] !== n - 1) idx.push(n - 1);
        const slot = plotW / Math.max(idx.length, 1);
        const longest = idx.reduce((m, i) => Math.max(m, String(points[i].label || "").length), 0);
        const rotate = idx.length > 1 && longest > 4 && longest * 6 > slot * 0.9;
        return { idx, rotate };
    }

    function drawXLabels(svg, points, plan, pad, H, plotW, text3, xCenter) {
        const right = pad.l + plotW;
        plan.idx.forEach(i => {
            const p = points[i];
            const label = String(p.label || "");
            const cx = xCenter(i);
            if (plan.rotate) {
                const y = H - 8;
                const t = el("text", {
                    x: cx, y, "text-anchor": "end",
                    fill: text3, "font-size": "10", "font-weight": "500", "font-family": "inherit",
                    transform: `rotate(-42 ${cx} ${y})`,
                }, svg);
                t.textContent = label;
            } else {


                const half = label.length * 3;
                let anchor = "middle", x = cx;
                if (cx - half < pad.l) { anchor = "start"; x = pad.l; }
                else if (cx + half > right) { anchor = "end"; x = right; }
                const t = el("text", {
                    x, y: H - 9, "text-anchor": anchor,
                    fill: text3, "font-size": "10", "font-weight": "500", "font-family": "inherit",
                }, svg);
                t.textContent = label;
            }
        });
    }


    charts.areaLine = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "area", points, opts });
        wrap.innerHTML = "";
        points = points || [];

        const animate = shouldAnimate();
        const W = measureWidth(wrap, 760);
        const baseH = opts.height || 280;
        const H = W < 460 ? Math.round(baseH * 0.82) : baseH;
        let pad = { l: 54, r: 16, t: 18, b: 32 };
        if (W < 460) { pad = { l: 40, r: 12, t: 14, b: 28 }; }
        const accent = resolveColor(opts.color, cssVar("--accent") || "#5EE0AA");
        const grid = cssVar("--chart-grid") || "rgba(128,128,128,.12)";
        const text2 = cssVar("--text-2") || "#94a3b8";
        const text3 = cssVar("--text-3") || "#64748b";
        const cardBg = cssVar("--card") || "#0f1524";

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
                fill: text2, "font-size": "13", "font-weight": "500", "font-family": "inherit",
            }, svg);
            msg.textContent = "No data for this range";
            ensureInsight(wrap, "");
            return;
        }

        const values = points.map(p => +p.value || 0);
        const yMax = niceScale(Math.max(...values) * 1.06, 4).max;
        const n = points.length;
        const plotW = W - pad.l - pad.r;
        const plan = xLabelPlan(points, plotW, W);
        if (plan.rotate) pad.b = Math.max(pad.b, 58);
        const plotH = H - pad.t - pad.b;
        const xOf = i => pad.l + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;


        const defs = el("defs", {}, svg);
        const gid = gradId();
        const ag = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el("stop", { offset: "0%", "stop-color": accent, "stop-opacity": 0.26 }, ag);
        el("stop", { offset: "70%", "stop-color": accent, "stop-opacity": 0.06 }, ag);
        el("stop", { offset: "100%", "stop-color": accent, "stop-opacity": 0 }, ag);

        renderGrid(svg, { W, H, pad, yMax, steps: 4, grid, text3, moneyFalse: opts.money === false });

        const pts = points.map((p, i) => [xOf(i), yOf(+p.value || 0)]);
        const line = smoothPath(pts, opts.tension);


        let areaPath = null;
        if (pts.length > 1) {
            areaPath = el("path", {
                d: line + ` L ${pts[pts.length - 1][0]} ${yOf(0)} L ${pts[0][0]} ${yOf(0)} Z`,
                fill: `url(#${gid})`, stroke: "none",
            }, svg);
        }


        if (pts.length > 1) {
            el("path", {
                d: line, fill: "none", stroke: accent,
                "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.1,
            }, svg);
        }


        const linePath = el("path", {
            d: line, fill: "none", stroke: accent,
            "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round",
            style: `filter: drop-shadow(0 4px 8px ${accent});`
        }, svg);


        if (animate && pts.length > 1) {
            try {
                const len = linePath.getTotalLength();
                linePath.style.strokeDasharray = `${len}`;
                linePath.style.strokeDashoffset = `${len}`;
                linePath.style.transition = "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)";
                nextFrame(() => { linePath.style.strokeDashoffset = "0"; });
            } catch (_) {  }
            if (areaPath) {
                areaPath.style.opacity = "0";
                areaPath.style.transition = "opacity 720ms ease 140ms";
                nextFrame(() => { areaPath.style.opacity = "1"; });
            }
        }


        const tip = ensureTip(wrap);
        const hoverLine = el("line", {
            y1: pad.t, y2: H - pad.b, stroke: accent, "stroke-width": 1,
            "stroke-dasharray": "3 4", opacity: 0,
        }, svg);
        const halo = el("circle", {
            r: 9, fill: accent, opacity: 0,
        }, svg);
        const hoverDot = el("circle", {
            r: 4.2, fill: accent, stroke: cardBg, "stroke-width": 2, opacity: 0,
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
            hoverLine.setAttribute("opacity", 0.5);
            halo.setAttribute("cx", x); halo.setAttribute("cy", y); halo.setAttribute("opacity", 0.14);
            hoverDot.setAttribute("cx", x); hoverDot.setAttribute("cy", y); hoverDot.setAttribute("opacity", 1);
            tip.hidden = false;
            tip.innerHTML = `
                <div class="tip-label">${DQ.esc(p.sublabel ? p.label + " · " + p.sublabel : p.label)}</div>
                <div class="tip-value">${opts.money === false ? DQ.fmt.num(p.value) : DQ.fmt.money(p.value)}</div>
                ${p.orders !== undefined ? `<div class="tip-label" style="margin-top:2px">${DQ.fmt.num(p.orders)} order(s)</div>` : ""}`;
            placeTip(wrap, svg, tip, x, y);
        });

        hit.addEventListener("mouseleave", () => {
            hoverLine.setAttribute("opacity", 0);
            halo.setAttribute("opacity", 0);
            hoverDot.setAttribute("opacity", 0);
            tip.hidden = true;
        });
        drawXLabels(svg, points, plan, pad, H, plotW, text3, i => pad.l + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)));
        ensureInsight(wrap, opts.insight || autoInsight(points, "area", opts));
    };


    charts.bars = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "bars", points, opts });
        wrap.innerHTML = "";
        points = points || [];

        const animate = shouldAnimate();
        const W = measureWidth(wrap, 760);
        const baseH = opts.height || 250;
        const H = W < 460 ? Math.round(baseH * 0.82) : baseH;
        let pad = { l: 48, r: 16, t: 20, b: 32 };
        if (W < 460) { pad = { l: 38, r: 12, t: 16, b: 30 }; }
        const grid = cssVar("--chart-grid") || "rgba(128,128,128,.12)";
        const text3 = cssVar("--text-3") || "#64748b";
        const c1 = resolveColor(opts.color, cssVar("--accent") || "#5EE0AA");
        const c2 = resolveColor(opts.color2, cssVar("--accent-2") || "#38BDF8");

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
                fill: text3, "font-size": "13", "font-weight": "500", "font-family": "inherit",
            }, svg);
            msg.textContent = "No data for this range";
            ensureInsight(wrap, "");
            return;
        }

        const hasCompare = points.some(p => p.value2 !== undefined);
        const yMax = niceScale(Math.max(...points.map(p => Math.max(+p.value || 0, hasCompare ? (+p.value2 || 0) : 0))) * 1.06, 4).max;
        const plotW = W - pad.l - pad.r;
        const plan = xLabelPlan(points, plotW, W);
        if (plan.rotate) pad.b = Math.max(pad.b, 58);
        const plotH = H - pad.t - pad.b;
        const slot = plotW / points.length;
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;


        const defs = el("defs", {}, svg);
        const gid1 = gradId();
        const g1 = el("linearGradient", { id: gid1, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el("stop", { offset: "0%", "stop-color": c1, "stop-opacity": 1 }, g1);
        el("stop", { offset: "100%", "stop-color": c1, "stop-opacity": 0.68 }, g1);
        let gid2 = null;
        if (hasCompare) {
            gid2 = gradId();
            const g2 = el("linearGradient", { id: gid2, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
            el("stop", { offset: "0%", "stop-color": c2, "stop-opacity": 1 }, g2);
            el("stop", { offset: "100%", "stop-color": c2, "stop-opacity": 0.68 }, g2);
        }

        renderGrid(svg, { W, H, pad, yMax, steps: 4, grid, text3, moneyFalse: opts.money === false });

        const tip = ensureTip(wrap);
        const growRects = [];
        let barIndex = 0;
        points.forEach((p, i) => {
            const bw = hasCompare ? Math.min(slot * 0.32, 14) : Math.min(slot * 0.52, 24);
            const cx = pad.l + slot * i + slot / 2;
            const bars = hasCompare
                ? [[cx - bw - 2, +p.value || 0, `url(#${gid1})`, c1, opts.legend ? opts.legend[0] : "Primary"],
                   [cx + 2, +p.value2 || 0, `url(#${gid2})`, c2, opts.legend ? opts.legend[1] : "Secondary"]]
                : [[cx - bw / 2, +p.value || 0, `url(#${gid1})`, c1, ""]];

            bars.forEach(([x, v, fill, color, leg]) => {
                const y = yOf(v);
                const h = Math.max(pad.t + plotH - y, v > 0 ? 3 : 0);
                const rect = el("rect", {
                    x, y, width: bw, height: h, rx: 4, ry: 4, fill,
                    cursor: "pointer",
                    style: `filter: drop-shadow(0 4px 8px ${color}); transition: opacity 0.3s ease, filter 0.3s ease;`
                }, svg);

                if (animate && v > 0) {
                    rect.style.transformBox = "fill-box";
                    rect.style.transformOrigin = "center bottom";
                    rect.style.transform = "scaleY(0)";
                    rect.style.transition = `transform 620ms cubic-bezier(0.16,1,0.3,1) ${barIndex * 26}ms`;
                    growRects.push(rect);
                }

                rect.addEventListener("mouseenter", () => {
                    rect.setAttribute("opacity", "0.82");
                    tip.hidden = false;
                    tip.innerHTML = `
                        <div class="tip-label">${DQ.esc(p.sublabel ? p.label + " · " + p.sublabel : p.label)}${leg ? ` · <span style="color:${color}">${DQ.esc(leg)}</span>` : ""}</div>
                        <div class="tip-value">${opts.money === false ? DQ.fmt.num(v) : DQ.fmt.money(v)}</div>`;
                    placeTip(wrap, svg, tip, x + bw / 2, y);
                });
                rect.addEventListener("mouseleave", () => {
                    rect.removeAttribute("opacity");
                    tip.hidden = true;
                });
                barIndex++;
            });
        });

        if (animate && growRects.length) {
            nextFrame(() => growRects.forEach(r => { r.style.transform = "scaleY(1)"; }));
        }

        drawXLabels(svg, points, plan, pad, H, plotW, text3, i => pad.l + slot * i + slot / 2);


        if (opts.legend && opts.legend.length) {
            const g = el("g", {}, svg);
            const legGap = W < 460 ? 96 : 140;
            opts.legend.forEach((item, i) => {
                const legX = pad.l + i * legGap;
                el("rect", { x: legX, y: 2, width: 10, height: 10, rx: 3, fill: i === 0 ? c1 : c2 }, g);
                const t = el("text", {
                    x: legX + 16, y: 11, fill: text3,
                    "font-size": "10.5", "font-weight": "500", "font-family": "inherit",
                }, g);
                t.textContent = item;
            });
        }
        ensureInsight(wrap, opts.insight || autoInsight(points, "bars", opts));
    };


    charts.stacked = function (wrap, points, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "stacked", points, opts });
        wrap.innerHTML = "";
        points = points || [];

        const animate = shouldAnimate();
        const W = measureWidth(wrap, 760);
        const baseH = opts.height || 250;
        const H = W < 460 ? Math.round(baseH * 0.82) : baseH;
        let pad = { l: 52, r: 16, t: 22, b: 32 };
        if (W < 460) { pad = { l: 40, r: 12, t: 18, b: 30 }; }
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
                fill: text3, "font-size": "13", "font-weight": "500", "font-family": "inherit",
            }, svg);
            msg.textContent = "No data for this range";
            ensureInsight(wrap, "");
            return;
        }

        const totals = points.map(p => (p.values || []).reduce((a, s) => a + (+s.value || 0), 0));
        const yMax = niceScale(Math.max(...totals) * 1.06, 4).max || 1;
        const plotW = W - pad.l - pad.r;
        const plan = xLabelPlan(points, plotW, W);
        if (plan.rotate) pad.b = Math.max(pad.b, 58);
        const plotH = H - pad.t - pad.b;
        const slot = plotW / points.length;
        const yOf = v => pad.t + plotH - (v / yMax) * plotH;

        renderGrid(svg, { W, H, pad, yMax, steps: 4, grid, text3, moneyFalse: false });

        const tip = ensureTip(wrap);
        const bw = Math.min(slot * 0.54, 26);
        const growCols = [];
        points.forEach((p, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const col = el("g", {}, svg);
            let acc = 0;
            const nonZero = (p.values || []).filter(s => (+s.value || 0) > 0);

            nonZero.forEach((seg, sIdx) => {
                const v = +seg.value || 0;
                const y0 = yOf(acc + v), y1 = yOf(acc);
                const isTop = sIdx === nonZero.length - 1;
                const rect = el("rect", {
                    x: cx - bw / 2, y: y0, width: bw, height: Math.max(y1 - y0, 1),
                    fill: resolveColor(seg.color, cssVar("--accent")), rx: isTop ? 4 : 0, ry: isTop ? 4 : 0,
                    opacity: 0.96, cursor: "pointer",
                }, col);

                rect.addEventListener("mouseenter", () => {
                    rect.setAttribute("opacity", "0.82");
                    tip.hidden = false;
                    tip.innerHTML = `
                        <div class="tip-label">${DQ.esc(p.label)} · <strong style="color:${resolveColor(seg.color, cssVar("--accent"))}">${DQ.esc(seg.key)}</strong></div>
                        <div class="tip-value">${DQ.fmt.money(seg.value)}</div>
                        <div class="tip-label" style="margin-top:2px">Total: ${DQ.fmt.money(totals[i])}</div>`;
                    placeTip(wrap, svg, tip, cx, y0);
                });
                rect.addEventListener("mouseleave", () => {
                    rect.setAttribute("opacity", "0.96");
                    tip.hidden = true;
                });
                acc += v;
            });

            if (animate) {
                col.style.transformBox = "fill-box";
                col.style.transformOrigin = "center bottom";
                col.style.transform = "scaleY(0)";
                col.style.transition = `transform 620ms cubic-bezier(0.16,1,0.3,1) ${i * 26}ms`;
                growCols.push(col);
            }
        });

        if (animate && growCols.length) {
            nextFrame(() => growCols.forEach(c => { c.style.transform = "scaleY(1)"; }));
        }

        drawXLabels(svg, points, plan, pad, H, plotW, text3, i => pad.l + slot * i + slot / 2);

        if (animate && growCols.length) {
            nextFrame(() => growCols.forEach(c => { c.style.transform = "scaleY(1)"; }));
        }

        if (opts.legend && opts.legend.length) {
            const g = el("g", {}, svg);
            const colorOf = key => {
                for (const p of points) {
                    const s = (p.values || []).find(v => v.key === key);
                    if (s && s.color) return resolveColor(s.color);
                }
                return cssVar("--accent");
            };
            const legGap = W < 460 ? 96 : 128;
            opts.legend.forEach((key, i) => {
                const legX = pad.l + i * legGap;
                el("rect", { x: legX, y: 2, width: 10, height: 10, rx: 3, fill: colorOf(key) }, g);
                const t = el("text", {
                    x: legX + 16, y: 11, fill: text3,
                    "font-size": "10.5", "font-weight": "500", "font-family": "inherit",
                }, g);
                t.textContent = key;
            });
        }
        ensureInsight(wrap, opts.insight || autoInsight(points, "stacked", opts));
    };


    charts.donut = function (wrap, segments, opts) {
        opts = opts || {};
        charts.store(wrap, { type: "donut", segments, opts });
        wrap.innerHTML = "";
        segments = segments || [];

        const animate = shouldAnimate();
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
                fill: cssVar("--text-3"), "font-size": "13", "font-weight": "500", "font-family": "inherit",
            }, svg);
            msg.textContent = "No data";
            ensureInsight(wrap, "");
            return;
        }

        const tip = ensureTip(wrap);
        const group = el("g", {}, svg);
        if (animate) {
            group.style.transformBox = "fill-box";
            group.style.transformOrigin = "center";
            group.style.transform = "scale(0.9)";
            group.style.opacity = "0";
            group.style.transition = "transform 620ms cubic-bezier(0.16,1,0.3,1), opacity 520ms ease";
        }

        let angle = -Math.PI / 2;
        const cardBg = cssVar("--card") || "#0f1524";

        segments.forEach((seg, idx) => {
            const frac = (+seg.value || 0) / total;
            const a2 = angle + frac * Math.PI * 2;
            const large = frac > 0.5 ? 1 : 0;
            const color = donutColor(idx, seg);
            const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
            const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
            const ix1 = cx + inner * Math.cos(a2), iy1 = cy + inner * Math.sin(a2);
            const ix2 = cx + inner * Math.cos(angle), iy2 = cy + inner * Math.sin(angle);

            const d = frac >= 0.999
                ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z M ${cx} ${cy - inner} A ${inner} ${inner} 0 1 0 ${cx - 0.01} ${cy - inner} Z`
                : `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`;

            const path = el("path", {
                d, fill: color, opacity: 0.96,
                stroke: cardBg, "stroke-width": 2,
                cursor: "pointer",
                style: `filter: drop-shadow(0 4px 12px ${color}); transition: transform 0.3s ease, filter 0.3s ease;`
            }, group);


            const mid = (angle + a2) / 2;
            const popX = (Math.cos(mid) * 5).toFixed(2);
            const popY = (Math.sin(mid) * 5).toFixed(2);

            const onHover = (e) => {
                path.setAttribute("opacity", "1");
                path.style.transform = `translate(${popX}px, ${popY}px)`;
                path.style.transition = "transform 180ms cubic-bezier(0.16,1,0.3,1)";
                tip.hidden = false;
                tip.innerHTML = `
                    <div class="tip-label">${DQ.esc(seg.label)}</div>
                    <div class="tip-value">${opts.money === false ? DQ.fmt.num(seg.value) : DQ.fmt.money(seg.value)}</div>
                    <div class="tip-label" style="color:${color};font-weight:700">${(frac * 100).toFixed(1)}%</div>`;
                const rs = wrap.getBoundingClientRect();
                tip.style.left = Math.min(Math.max(e.clientX - rs.left + 12, 6), Math.max(6, rs.width - (tip.offsetWidth || 130) - 6)) + "px";
                tip.style.top = Math.max(e.clientY - rs.top - 70, 6) + "px";
            };

            path.addEventListener("mouseenter", onHover);
            path.addEventListener("mousemove", onHover);
            path.addEventListener("mouseleave", () => {
                path.setAttribute("opacity", "0.96");
                path.style.transform = "translate(0,0)";
                tip.hidden = true;
            });
            angle = a2;
        });


        const center = el("text", {
            x: cx, y: cy - 4, "text-anchor": "middle",
            fill: cssVar("--text-3"), "font-size": "10.5", "font-weight": "600",
            "letter-spacing": "0.06em", "text-transform": "uppercase", "font-family": "inherit",
        }, group);
        center.textContent = opts.centerLabel || "Total";

        const centerV = el("text", {
            x: cx, y: cy + 18, "text-anchor": "middle",
            fill: cssVar("--text"), "font-size": "19", "font-weight": "700", "font-family": "inherit",
        }, group);
        centerV.textContent = opts.money === false ? DQ.fmt.num(total) : DQ.fmt.moneyCompact(total);

        if (animate) {
            nextFrame(() => { group.style.transform = "scale(1)"; group.style.opacity = "1"; });
        }
        ensureInsight(wrap, opts.insight || autoInsight(segments, "donut", opts));
    };
})();
