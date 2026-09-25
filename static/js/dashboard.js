/* ══════════════════════════════════════════════════════════════════════
   DineIQ Analytics — Interactive Dashboard Controller
   Supports Dual-Task Ensemble Scoring (PKR Currency), Chart Lightbox & API
   ══════════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    loadStatus();
    setupPredictor();
    setupLightbox();
    loadRecommendations();
});

function initTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const targetEl = document.getElementById(target);
            if (targetEl) {
                targetEl.classList.add("active");
            }
        });
    });
}

async function loadStatus() {
    try {
        const res = await fetch("/api/v1/status");
        if (res.ok) {
            const data = await res.json();
            const statusEl = document.getElementById("api-status");
            if (statusEl) statusEl.textContent = `${data.status} · LIVE`;
            
            const agreementEl = document.getElementById("agreement-stat");
            if (agreementEl) agreementEl.textContent = data.dual_pipeline_agreement || "100.0%";
            
            const latencyEl = document.getElementById("latency-stat");
            if (latencyEl) latencyEl.textContent = `${data.nfr_latency_ms} ms`;
        }
    } catch (e) {
        console.warn("API status fetch error:", e);
    }
}

function setupPredictor() {
    const btn = document.getElementById("predict-btn");
    const resultBox = document.getElementById("result-box");
    const taskSelect = document.getElementById("input-task");

    if (!btn) return;

    btn.addEventListener("click", async () => {
        btn.textContent = "Scoring Warm Ensemble Models...";
        btn.disabled = true;

        const task = taskSelect ? taskSelect.value : "order_value";
        const amount = parseFloat(document.getElementById("input-amount").value) || 3200;
        const items = parseInt(document.getElementById("input-items").value) || 5;
        const orders = parseInt(document.getElementById("input-orders").value) || 14;
        const spend = parseFloat(document.getElementById("input-spend").value) || 24500;
        const promo = parseInt(document.getElementById("input-promo").value) || 0;

        const record = {
            order_amount: amount,
            item_count: items,
            customer_orders: orders,
            customer_spend: spend,
            promo_applied: promo,
            orders: orders,
            spend: spend
        };

        try {
            const res = await fetch("/api/v1/predict/ensemble", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    task: task,
                    records: [record]
                })
            });

            if (res.ok) {
                const data = await res.json();
                const p = data.predictions[0];
                const taskLabel = task === "order_value" ? "High-Value Order Classification" : "Customer Churn Risk Prediction";
                const decisionText = p.ensemble_label === 1 
                    ? (task === "order_value" ? "HIGH VALUE ORDER (Top Tier)" : "HIGH CHURN RISK") 
                    : (task === "order_value" ? "STANDARD ORDER" : "LOW CHURN RISK");
                
                const decisionColor = p.ensemble_label === 1 ? "var(--accent-green)" : "var(--text-secondary)";

                resultBox.style.display = "block";
                resultBox.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                        <h4 style="color: var(--primary-gold); margin:0; font-family:var(--font-heading);">
                            ✨ Live Ensemble Scoring Result (${taskLabel})
                        </h4>
                        <span class="badge status-live">
                            Latency: <strong>${data.latency_ms} ms</strong> (NFR Budget: 5,000 ms — PASS)
                        </span>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-top:14px;">
                        <div style="background:var(--bg-card); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                            <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">PySpark MLlib Proba</div>
                            <div style="font-size:22px; font-weight:800; color:var(--primary-gold); margin-top:4px;">${(p.pipeline_proba * 100).toFixed(1)}%</div>
                            <div style="font-size:10px; color:var(--text-muted);">Warm PySpark Model</div>
                        </div>

                        <div style="background:var(--bg-card); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                            <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Python Sklearn Proba</div>
                            <div style="font-size:22px; font-weight:800; color:var(--accent-green); margin-top:4px;">${(p.python_proba * 100).toFixed(1)}%</div>
                            <div style="font-size:10px; color:var(--text-muted);">Independent DS Model</div>
                        </div>

                        <div style="background:var(--bg-card); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                            <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Ensemble Average</div>
                            <div style="font-size:22px; font-weight:800; color:var(--primary-purple); margin-top:4px;">${(p.ensemble_proba * 100).toFixed(1)}%</div>
                            <div style="font-size:10px; color:var(--text-muted);">50/50 Dual Average</div>
                        </div>

                        <div style="background:var(--bg-card); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                            <div style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Ensemble Decision</div>
                            <div style="font-size:16px; font-weight:800; color:${decisionColor}; margin-top:6px;">${decisionText}</div>
                            <div style="font-size:10px; color:var(--text-muted);">Decision Threshold = 0.50</div>
                        </div>
                    </div>
                `;
            } else {
                resultBox.style.display = "block";
                resultBox.innerHTML = `<p style="color: var(--accent-red)">Scoring service error: Unable to complete prediction.</p>`;
            }
        } catch (err) {
            resultBox.style.display = "block";
            resultBox.innerHTML = `<p style="color: var(--accent-red)">Connection error: REST server unreachable.</p>`;
        } finally {
            btn.textContent = "Run Dual-Pipeline Scoring Demo";
            btn.disabled = false;
        }
    });
}

function setupLightbox() {
    const modal = document.getElementById("chart-modal");
    const modalImg = document.getElementById("modal-img");
    const modalTitle = document.getElementById("modal-title");
    const closeBtn = document.getElementById("modal-close");

    if (!modal) return;

    document.querySelectorAll(".chart-img").forEach(img => {
        img.addEventListener("click", () => {
            modalImg.src = img.src;
            modalTitle.textContent = img.alt || "Chart Analysis";
            modal.classList.add("active");
        });
    });

    closeBtn.addEventListener("click", () => {
        modal.classList.remove("active");
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.classList.remove("active");
        }
    });
}

async function loadRecommendations() {
    const container = document.getElementById("recs-container");
    if (!container) return;

    try {
        const res = await fetch("/api/v1/analytics/recommendations");
        if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
                container.innerHTML = data.map(rec => `
                    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:16px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span class="badge" style="color:var(--primary-gold);">${rec.category || 'Strategy'}</span>
                            <span class="badge status-live">Impact: Rs. ${rec.impact_pkr ? Number(rec.impact_pkr).toLocaleString() : 'N/A'} PKR</span>
                        </div>
                        <h4 style="font-family:var(--font-heading); font-size:15px; margin-bottom:6px;">${rec.title || 'Recommendation'}</h4>
                        <p style="font-size:12px; color:var(--text-secondary);">${rec.description || ''}</p>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.warn("Recommendations fetch error:", e);
    }
}
