"use strict";

(() => {
    let currentSignature = "";

    function normalize(data) {
        const fallback = window.KMC_ARRANGEMENT_DEFAULTS || { arrangements: [] };
        const merged = data ? { ...fallback, ...data } : fallback;
        return [...(merged.arrangements || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    }

    function render(data) {
        const grid = document.getElementById("home-arrangement-grid");
        if (!grid) return;
        // The home page is a preview; the full collection remains available on
        // the Arrangements page via the "See All Arrangements" link.
        const arrangements = normalize(data).slice(0, 2);
        const signature = JSON.stringify(arrangements.map(item => [item.id, item.name, item.koreanName, item.photoUrl, item.order]));
        if (signature === currentSignature && grid.childElementCount) return;
        currentSignature = signature;

        const fragment = document.createDocumentFragment();
        arrangements.forEach((item, index) => {
            const link = document.createElement("a");
            link.className = "arrangement-card reveal arrangement-card-link visible";
            link.href = `arrangements.html#${encodeURIComponent(item.id)}`;
            link.setAttribute("aria-label", `View ${item.name || "arrangement"} details`);
            const image = document.createElement("img");
            image.src = item.photoUrl || "";
            image.alt = item.name || "Arrangement";
            image.loading = index < 2 ? "eager" : "lazy";
            image.fetchPriority = index === 0 ? "high" : "auto";
            image.decoding = "async";
            const content = document.createElement("div");
            content.className = "card-content";
            const heading = document.createElement("h3");
            heading.textContent = item.name || "Arrangement";
            const koreanName = document.createElement("p");
            koreanName.textContent = item.koreanName || "";
            content.append(heading, koreanName);
            const arrow = document.createElement("span");
            arrow.className = "home-card-arrow";
            arrow.setAttribute("aria-hidden", "true");
            arrow.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 5l7 7-7 7"></path></svg>';
            link.append(image, content, arrow);
            fragment.appendChild(link);
        });
        grid.replaceChildren(fragment);
    }

    function refresh() {
        const dataApi = window.KMCHomeData;
        render(dataApi?.cachedValue("arrangements"));
        dataApi?.getArrangements()
            .then(render)
            .catch(error => console.warn("Unable to refresh home arrangements:", error));
    }

    document.addEventListener("DOMContentLoaded", refresh);
    window.addEventListener("kmc:home-sections-rendered", refresh);
})();
