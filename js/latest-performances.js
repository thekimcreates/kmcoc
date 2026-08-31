"use strict";

(() => {
    const state = {
        performances: [],
        arrangements: [],
        performancesReady: false,
        signature: ""
    };

    function formatDate(value) {
        if (!value) return "Date unavailable";
        const date = new Date(`${value}T12:00:00`);
        return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-US", {
            month: "long", day: "numeric", year: "numeric"
        }).format(date);
    }

    function formatTime(performance) {
        if (performance.timeTbd) return "Time TBD";
        if (!performance.time) return "";
        const [hour, minute] = String(performance.time).split(":").map(Number);
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return String(performance.time);
        return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
            .format(new Date(2000, 0, 1, hour, minute));
    }

    function arrangementLabels(performance) {
        const byId = new Map(state.arrangements.map(item => [item.id, item]));
        const resolved = (Array.isArray(performance.arrangementIds) ? performance.arrangementIds : [])
            .map(id => byId.get(id))
            .filter(Boolean)
            .map(item => `${item.name || "Arrangement"} ${item.koreanName || ""}`.trim());
        return resolved.length ? resolved : (Array.isArray(performance.arrangements) ? performance.arrangements.filter(Boolean) : []);
    }

    function message(text) {
        const paragraph = document.createElement("p");
        paragraph.className = "performance-message";
        paragraph.textContent = text;
        return paragraph;
    }

    function cardArrow() {
        const arrow = document.createElement("span");
        arrow.className = "home-card-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 5l7 7-7 7"></path></svg>';
        return arrow;
    }

    function card(record) {
        const performance = record.data || {};
        const article = document.createElement("article");
        article.className = "performance-card reveal visible";
        if (performance.highlightPhotoUrl) {
            window.KMCImageLoader?.observeBackground(article, performance.highlightPhotoUrl);
            article.classList.add("has-highlight-photo");
        }
        const locationText = performance.locationTbd ? "Location TBD" : performance.locationName || performance.location || "Location unavailable";
        const link = document.createElement("a");
        link.className = "performance-card-link";
        link.href = `performances.html#${encodeURIComponent(record.id)}`;
        link.setAttribute("aria-label", `View the ${formatDate(performance.date)} performance at ${locationText}`);
        const content = document.createElement("div");
        content.className = "performance-card-content";
        const dateTime = document.createElement("p");
        dateTime.className = "performance-date-time";
        dateTime.textContent = [formatDate(performance.date), formatTime(performance)].filter(Boolean).join(" • ");
        const location = document.createElement("h3");
        location.className = "performance-location";
        location.textContent = locationText;
        const details = document.createElement("p");
        details.className = "performance-meta";
        const labels = arrangementLabels(performance);
        details.textContent = performance.arrangementsTbd ? "Arrangements TBD" : labels.length ? labels.join(" • ") : "Arrangement details coming soon";
        content.append(dateTime, location, details);
        article.append(link, content, cardArrow());
        return article;
    }

    function render() {
        const container = document.getElementById("latest-performances");
        if (!container) return;
        const signature = JSON.stringify([state.performances, state.arrangements.map(item => [item.id, item.name, item.koreanName])]);
        if (signature === state.signature && container.childElementCount) return;
        state.signature = signature;
        container.removeAttribute("aria-busy");
        if (!state.performancesReady) {
            container.setAttribute("aria-busy", "true");
            return;
        }
        container.replaceChildren(...(state.performances.length
            ? state.performances.map(card)
            : [message("No performances have been published yet.")]));
    }

    function hydrateCached() {
        const api = window.KMCHomeData;
        const cachedPerformances = api?.cachedValue("latest-performances-2");
        const cachedArrangements = api?.cachedValue("arrangements");
        if (Array.isArray(cachedPerformances)) {
            state.performances = cachedPerformances;
            state.performancesReady = true;
        }
        if (Array.isArray(cachedArrangements?.arrangements)) state.arrangements = cachedArrangements.arrangements;
        render();
    }

    function refresh() {
        const api = window.KMCHomeData;
        hydrateCached();
        if (!api) return;
        api.getLatestPerformances(2)
            .then(records => {
                state.performances = Array.isArray(records) ? records : [];
                state.performancesReady = true;
                state.signature = "";
                render();
            })
            .catch(error => {
                console.warn("Unable to refresh latest performances:", error);
                if (!state.performancesReady) {
                    state.performancesReady = true;
                    state.signature = "";
                    const container = document.getElementById("latest-performances");
                    if (container) container.replaceChildren(message("Latest performances could not be loaded."));
                }
            });
        api.getArrangements()
            .then(data => {
                state.arrangements = Array.isArray(data?.arrangements) ? data.arrangements : [];
                state.signature = "";
                render();
            })
            .catch(() => {});
    }

    document.addEventListener("DOMContentLoaded", refresh);
    window.addEventListener("kmc:home-sections-rendered", () => {
        state.signature = "";
        render();
    });
})();
