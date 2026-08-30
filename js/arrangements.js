"use strict";

(() => {
    const CACHE_KEY = "kmc-public-arrangements-v3";
    const CACHE_VERSION = 3;
    const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A"]);

    document.addEventListener("DOMContentLoaded", () => {
        const list = document.getElementById("arrangements-list");
        const detailRoot = document.getElementById("arrangement-detail-root");
        const backdrop = document.getElementById("arrangement-backdrop");
        if (!list || !detailRoot || !backdrop) return;

        const fallback = normalizeData(window.KMC_ARRANGEMENT_DEFAULTS || {});
        const dataStore = window.KMCDataStore;
        const requestedId = safeDecode(location.hash.slice(1));

        let currentData = readCache() || fallback;
        let renderedSignature = "";
        let activeCard = null;
        let activePanel = null;
        let activeId = "";
        let scrollY = 0;
        let queuedData = null;
        let ignoreBackdropUntil = 0;

        renderCards(currentData);
        openRequestedArrangement();

        // Let the browser paint the cached/local cards before starting Firestore work.
        window.setTimeout(refreshFromFirestore, 0);

        // Safari may restore this page from its back-forward cache without rerunning
        // DOMContentLoaded. Refresh again whenever the restored tab becomes active.
        window.addEventListener("pageshow", event => {
            if (event.persisted) refreshFromFirestore();
        });

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") refreshFromFirestore();
        });

        function normalizeData(raw) {
            const instruments = Array.isArray(raw?.instruments) ? raw.instruments : [];
            const arrangements = Array.isArray(raw?.arrangements) ? raw.arrangements : [];
            return {
                instruments: instruments.map(item => ({ ...item })),
                arrangements: arrangements.map(item => ({
                    ...item,
                    instruments: Array.isArray(item?.instruments) ? item.instruments.map(selection => ({ ...selection })) : []
                }))
            };
        }

        function safeDecode(value) {
            try { return decodeURIComponent(value || ""); }
            catch { return value || ""; }
        }

        function escapeId(value) {
            return String(value || "arrangement").replace(/[^a-zA-Z0-9_-]/g, "-");
        }

        function signature(data) {
            try { return JSON.stringify(data); }
            catch { return String(Date.now()); }
        }

        function readCache() {
            try {
                const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
                if (!parsed || parsed.version !== CACHE_VERSION || !parsed.data) return null;
                return normalizeData(parsed.data);
            } catch {
                return null;
            }
        }

        function writeCache(data) {
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    version: CACHE_VERSION,
                    savedAt: Date.now(),
                    data
                }));
            } catch {
                // Storage can be unavailable in private browsing; the page still works.
            }
        }

        function sanitizeHtml(html) {
            const template = document.createElement("template");
            template.innerHTML = String(html || "");

            const walk = node => [...node.childNodes].forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (!allowedTags.has(child.tagName)) {
                        child.replaceWith(...child.childNodes);
                        return;
                    }

                    const href = child.tagName === "A" ? child.getAttribute("href") || "" : "";
                    [...child.attributes].forEach(attribute => child.removeAttribute(attribute.name));

                    if (child.tagName === "A" && (/^https?:\/\//i.test(href) || /^mailto:/i.test(href))) {
                        child.setAttribute("href", href);
                        child.setAttribute("target", "_blank");
                        child.setAttribute("rel", "noopener noreferrer");
                    }
                    walk(child);
                } else if (child.nodeType !== Node.TEXT_NODE) {
                    child.remove();
                }
            });

            walk(template.content);
            return template.innerHTML;
        }

        function sortedArrangements(data) {
            return [...data.arrangements].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        }

        function renderCards(data) {
            const nextSignature = signature(data);
            if (nextSignature === renderedSignature) return;

            currentData = data;
            renderedSignature = nextSignature;
            list.replaceChildren();

            const fragment = document.createDocumentFragment();
            sortedArrangements(data).forEach((arrangement, index) => {
                const id = escapeId(arrangement.id);
                const card = document.createElement("button");
                card.className = "arrangement-card arrangement-page-card reveal visible";
                card.type = "button";
                card.dataset.arrangement = id;
                card.setAttribute("aria-haspopup", "dialog");
                card.setAttribute("aria-controls", `arrangement-${id}`);
                card.setAttribute("aria-expanded", "false");

                const image = document.createElement("img");
                image.src = arrangement.photoUrl || "";
                image.alt = arrangement.name || "Arrangement";
                image.loading = index === 0 ? "eager" : "lazy";
                image.decoding = "async";
                if (index === 0) image.fetchPriority = "high";

                const content = document.createElement("span");
                content.className = "card-content";
                const title = document.createElement("span");
                title.className = "arrangement-title";
                title.textContent = arrangement.name || "Arrangement";
                const korean = document.createElement("span");
                korean.className = "arrangement-korean";
                korean.textContent = arrangement.koreanName || "";
                content.append(title, korean);

                const arrow = document.createElement("span");
                arrow.className = "arrangement-card-arrow";
                arrow.setAttribute("aria-hidden", "true");
                arrow.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 5l7 7-7 7"></path></svg>';

                card.append(image, content, arrow);
                fragment.appendChild(card);
            });
            list.appendChild(fragment);
        }

        function arrangementById(id) {
            return currentData.arrangements.find(item => escapeId(item.id) === id) || null;
        }

        function buildPanel(arrangement) {
            const id = escapeId(arrangement.id);
            const instrumentMap = new Map(currentData.instruments.map(item => [item.id, item]));
            const panel = document.createElement("section");
            panel.className = "arrangement-detail";
            panel.id = `arrangement-${id}`;
            panel.dataset.arrangementPanel = id;
            panel.setAttribute("role", "dialog");
            panel.setAttribute("aria-modal", "true");
            panel.setAttribute("aria-hidden", "true");
            panel.tabIndex = -1;

            panel.innerHTML = '<div class="arrangement-detail-shell"><button class="arrangement-close" type="button" aria-label="Close details"><span></span><span></span></button><div class="arrangement-detail-scroll"><header class="arrangement-detail-hero"><img decoding="async"><div class="arrangement-detail-overlay"><h2></h2><p></p></div><span class="arrangement-detail-arrow" aria-hidden="true">↓</span></header><div class="arrangement-detail-content"><h3>Instruments Used</h3><div class="instrument-list"></div></div></div></div>';

            const heroImage = panel.querySelector(".arrangement-detail-hero img");
            heroImage.src = arrangement.photoUrl || "";
            heroImage.alt = arrangement.name || "Arrangement";
            panel.querySelector("h2").textContent = arrangement.name || "Arrangement";
            panel.querySelector(".arrangement-detail-overlay p").textContent = arrangement.koreanName || "";

            const instrumentList = panel.querySelector(".instrument-list");
            const rows = [...arrangement.instruments]
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

            const fragment = document.createDocumentFragment();
            rows.forEach(selection => {
                const instrument = instrumentMap.get(selection.instrumentId);
                if (!instrument) return;

                const article = document.createElement("article");
                article.className = "instrument-row";
                article.innerHTML = '<div class="instrument-image"><img loading="lazy" decoding="async"></div><div class="instrument-copy"><h4></h4></div>';

                const image = article.querySelector("img");
                image.src = instrument.photoUrl || "";
                image.alt = `${instrument.name || "Instrument"} ${instrument.koreanName || ""}`.trim();

                const heading = article.querySelector("h4");
                heading.append(document.createTextNode(instrument.name || "Instrument"));
                if (instrument.koreanName) {
                    const korean = document.createElement("span");
                    korean.textContent = instrument.koreanName;
                    heading.append(" ", korean);
                }

                fragment.appendChild(article);
            });
            instrumentList.appendChild(fragment);
            return panel;
        }

        function open(card, fromDeepLink = false) {
            const id = card.dataset.arrangement;
            if (!id || activeId === id) return;

            const arrangement = arrangementById(id);
            if (!arrangement) return;

            detailRoot.replaceChildren();
            const panel = buildPanel(arrangement);
            detailRoot.appendChild(panel);

            activeCard = card;
            activePanel = panel;
            activeId = id;
            scrollY = window.scrollY;
            ignoreBackdropUntil = performance.now() + (fromDeepLink ? 700 : 200);

            document.body.classList.add("arrangement-open");
            Object.assign(document.body.style, {
                position: "fixed",
                top: `-${scrollY}px`,
                left: "0",
                right: "0",
                width: "100%"
            });

            card.setAttribute("aria-expanded", "true");
            backdrop.classList.add("is-active");
            backdrop.setAttribute("aria-hidden", "false");
            panel.setAttribute("aria-hidden", "false");
            requestAnimationFrame(() => panel.classList.add("is-open"));

            history.replaceState(null, "", `${location.pathname}${location.search}#${encodeURIComponent(id)}`);
            window.setTimeout(() => panel.querySelector(".arrangement-close")?.focus({ preventScroll: true }), 100);
        }

        function close() {
            if (!activePanel) return;

            activePanel.classList.remove("is-open");
            activePanel.setAttribute("aria-hidden", "true");
            activeCard?.setAttribute("aria-expanded", "false");
            backdrop.classList.remove("is-active");
            backdrop.setAttribute("aria-hidden", "true");

            const restoreY = scrollY;
            const previousScrollBehavior = document.documentElement.style.scrollBehavior;
            document.documentElement.style.scrollBehavior = "auto";

            // Remove the deep-link hash while the document is still locked so the
            // browser cannot scroll the selected card into view during close.
            history.replaceState(null, "", location.pathname + location.search);

            document.body.classList.remove("arrangement-open");
            Object.assign(document.body.style, { position: "", top: "", left: "", right: "", width: "" });

            const restoreScrollPosition = () => window.scrollTo({ top: restoreY, left: 0, behavior: "auto" });
            restoreScrollPosition();
            requestAnimationFrame(() => {
                restoreScrollPosition();
                requestAnimationFrame(() => {
                    restoreScrollPosition();
                    document.documentElement.style.scrollBehavior = previousScrollBehavior;
                });
            });

            activeCard = null;
            activePanel = null;
            activeId = "";
            detailRoot.replaceChildren();

            if (queuedData) {
                const next = queuedData;
                queuedData = null;
                renderCards(next);
            }
        }

        function openRequestedArrangement() {
            if (!requestedId) return;
            const card = [...list.querySelectorAll("[data-arrangement]")]
                .find(item => item.dataset.arrangement === requestedId);
            if (card) requestAnimationFrame(() => open(card, true));
        }

        async function refreshFromFirestore() {
            if (!dataStore) return;
            try {
                const data = await dataStore.getArrangements();
                if (!data) return;

                const remote = normalizeData({ ...fallback, ...data });
                writeCache(remote);
                if (signature(remote) === renderedSignature) return;

                if (activePanel) queuedData = remote;
                else renderCards(remote);
            } catch (error) {
                console.error("Unable to refresh arrangements from Firestore:", error);
            }
        }

        list.addEventListener("click", event => {
            const card = event.target.closest("[data-arrangement]");
            if (card) open(card);
        });

        detailRoot.addEventListener("click", event => {
            if (event.target.closest(".arrangement-close")) close();
        });

        backdrop.addEventListener("click", () => {
            if (performance.now() < ignoreBackdropUntil) return;
            close();
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") close();
        });
    });
})();
