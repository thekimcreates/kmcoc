"use strict";
(() => {
    // Project only the fields used by cards, filters, and the detail heading.
    // In particular, never fetch galleryItems for the initial performance list.
    const fields = ["date", "time", "timezone", "timeTbd", "location", "locationName", "locationAddress", "locationPlaceId", "locationTbd", "arrangementIds", "arrangements", "arrangementsTbd", "memberIds", "members", "membersTbd", "externalLinks", "highlightPhotoUrl", "updatedAt"];
    const details = new Map();
    const pending = new Map();
    function decode(value) {
        if ("nullValue" in value) return null;
        if ("stringValue" in value) return value.stringValue;
        if ("booleanValue" in value) return value.booleanValue;
        if ("integerValue" in value) return Number(value.integerValue);
        if ("doubleValue" in value) return Number(value.doubleValue);
        if ("timestampValue" in value) return value.timestampValue;
        if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
        if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
        return null;
    }
    async function list() {
        const config = window.KMC_CONFIG.firebase;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents:runQuery?key=${encodeURIComponent(config.apiKey)}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
                body: JSON.stringify({ structuredQuery: {
                    from: [{ collectionId: "performances" }],
                    select: { fields: fields.map(fieldPath => ({ fieldPath })) },
                    orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }]
                } })
            });
            if (!response.ok) throw new Error(`Performance list request failed (${response.status}).`);
            const rows = await response.json();
            if (!Array.isArray(rows) || rows.some(row => row.error)) throw new Error("Invalid performance list response.");
            return rows.filter(row => row.document).map(({ document }) => ({
                ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])),
                id: document.name.split("/").pop(), _summaryOnly: true, _version: document.updateTime || ""
            }));
        } catch (error) {
            // Preserve compatibility with deployments that require SDK-specific
            // credentials or do not permit this REST request.
            console.warn("Using the standard performance loader:", error);
            return window.KMCDataStore.getPerformances();
        } finally { clearTimeout(timer); }
    }
    function detail(record) {
        const key = `${record.id}:${record._version || ""}`;
        if (details.has(key)) return Promise.resolve(details.get(key));
        if (pending.has(key)) return pending.get(key);
        const task = window.kmcFirebase.db.collection("performances").doc(record.id).get({ source: "server" }).then(snapshot => {
            if (!snapshot.exists) throw new Error("This performance is no longer available.");
            const result = { ...snapshot.data(), id: snapshot.id };
            details.set(key, result);
            return result;
        }).finally(() => pending.delete(key));
        pending.set(key, task);
        return task;
    }
    window.KMCPerformanceList = { list, detail };
})();
