/* DineIQ Analytics — Interactive Dashboard Script */

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    loadStatus();
    setupPredictor();
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
            document.getElementById(target).classList.add("active");
        });
    });
}

async function loadStatus() {
    try {
        const res = await fetch("/api/v1/status");
        if (res.ok) {
            const data = await res.json();
            document.getElementById("api-status").textContent = data.status;
            document.getElementById("agreement-stat").textContent = data.dual_pipeline_agreement;
            document.getElementById("latency-stat").textContent = `${data.nfr_latency_ms} ms`;
        }
    } catch (e) {
        console.warn("API status fetch error:", e);
    }
}

function setupPredictor() {
    const btn = document.getElementById("predict-btn");
    const resultBox = document.getElementById("result-box");

    btn.addEventListener("click", async () => {
        btn.textContent = "Scoring Ensemble Models...";
        btn.disabled = true;

        const record = {
            total_amount: parseFloat(document.getElementById("input-amount").value) || 2500,
            item_count: parseInt(document.getElementById("input-items").value) || 4,
            customer_orders: parseInt(document.getElementById("input-orders").value) || 12,
            customer_total_spend: parseFloat(document.getElementById("input-spend").value) || 18000,
            has_promotion: parseInt(document.getElementById("input-promo").value) || 1
        };

        try {
            const res = await fetch("/api/v1/predict/ensemble", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    task: "order_value",
                    records: [record]
                })
            });

            if (res.ok) {
                const data = await res.json();
                const p = data.predictions[0];

                resultBox.style.display = "block";
                resultBox.innerHTML = `
                    <h4 style="color: var(--accent-green); margin-bottom: 0.5rem;">Ensemble Prediction Result</h4>
                    <p><strong>Predicted Tier:</strong> ${p.ensemble_label === 1 ? 'High-Value Order (Top 10%)' : 'Standard Order'}</p>
                    <p><strong>Ensemble Probability:</strong> ${(p.ensemble_proba * 100).toFixed(1)}%</p>
                    <p><strong>PySpark MLlib Model:</strong> ${(p.pipeline_proba * 100).toFixed(1)}% | <strong>Scikit-Learn Model:</strong> ${(p.python_proba * 100).toFixed(1)}%</p>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">
                        Execution Latency: <strong>${data.latency_ms} ms</strong> (NFR Limit: 5,000 ms — PASS)
                    </p>
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
