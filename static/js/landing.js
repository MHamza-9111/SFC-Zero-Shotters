




(function () {
    "use strict";

    const byId = (id) => document.getElementById(id);

    function setStat(id, value) {
        const el = byId(id);
        if (el) {
            el.textContent = value;
            el.removeAttribute("data-loading");
        }
    }

    function buildTicker(facts) {
        const track = byId("landing-ticker");
        if (!track || !facts.length) return;
        const items = facts.map((f) => `<span>${f}</span>`).join("");
        track.innerHTML = items + items;
    }

    function modelSummary(models) {
        let ready = 0;
        let total = 0;
        Object.values(models || {}).forEach((m) => {
            if (!m || typeof m !== "object") return;
            total += 1;
            if (m.python && m.big_data) ready += 1;
        });
        return total ? { ready, total } : null;
    }

    async function loadStatus() {
        try {
            const res = await fetch("/api/v1/status", { headers: { Accept: "application/json" } });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);

            setStat("ls-status", body.status || "Unknown");
            const statusSub = byId("ls-status-sub");
            if (statusSub) {
                statusSub.textContent = body.status === "OPERATIONAL"
                    ? "All systems reporting"
                    : body.status === "DEGRADED"
                        ? "Running in degraded mode"
                        : "Status reported by the API";
            }

            const agreement = body.dual_pipeline_agreement;
            const agreementKnown = agreement && agreement !== "unavailable";
            setStat("ls-agreement", agreementKnown ? agreement : "—");
            const agreementSub = byId("ls-agreement-sub");
            if (agreementSub) {
                agreementSub.textContent = agreementKnown
                    ? "Spark vs Python on unseen cases"
                    : "Not reported by the pipeline";
            }

            const summary = modelSummary(body.models);
            setStat("ls-models", summary ? `${summary.ready} / ${summary.total}` : "—");
            const modelsSub = byId("ls-models-sub");
            if (modelsSub) {
                modelsSub.textContent = body.engine && body.engine !== "unavailable"
                    ? `Engine: ${body.engine}`
                    : "Engine unavailable";
            }

            const facts = [];
            if (body.pipeline_version) facts.push(`Pipeline v${body.pipeline_version}`);
            if (agreementKnown) facts.push(`Dual-pipeline agreement ${agreement}`);
            if (body.nfr_latency_ms !== null && body.nfr_latency_ms !== undefined) {
                const verdict = body.nfr_pass === true ? " · within budget"
                    : body.nfr_pass === false ? " · over budget" : "";
                facts.push(`Serving latency ${body.nfr_latency_ms} ms${verdict}`);
            }
            if (body.engine && body.engine !== "unavailable") facts.push(`Engine: ${body.engine}`);
            if (body.status) facts.push(`Service status: ${body.status}`);
            buildTicker(facts);
        } catch (err) {
            setStat("ls-status", "Unavailable");
            const statusSub = byId("ls-status-sub");
            if (statusSub) statusSub.textContent = "Could not reach the analytics API";
            setStat("ls-agreement", "—");
            setStat("ls-models", "—");
            const agreementSub = byId("ls-agreement-sub");
            if (agreementSub) agreementSub.textContent = "API unreachable";
            const modelsSub = byId("ls-models-sub");
            if (modelsSub) modelsSub.textContent = "API unreachable";
            buildTicker(["Live platform metrics are unavailable — the analytics API did not respond."]);
        }
    }

    loadStatus();
})();
