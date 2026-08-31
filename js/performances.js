"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const db = window.kmcFirebase?.db;
    const dataStore = window.KMCDataStore;
    const grid = document.getElementById("performances-grid");
    const emptyState = document.getElementById("performance-empty");
    const count = document.getElementById("performance-count");
    const yearFilter = document.getElementById("performance-year");
    const arrangementFilter = document.getElementById("performance-arrangement-filter");
    const arrangementTrigger = document.getElementById("performance-arrangement-trigger");
    const arrangementPopover = document.getElementById("performance-arrangement-popover");
    const arrangementSummary = document.getElementById("performance-arrangement-summary");
    const arrangementOptions = document.getElementById("performance-filter-options");
    const allArrangementsInput = document.getElementById("performance-filter-all");

    const detail = document.getElementById("performance-detail");
    const detailShell = detail?.querySelector(".performance-detail-shell");
    const detailClose = document.getElementById("performance-detail-close");
    const detailHero = document.getElementById("performance-detail-hero");
    const detailTitle = document.getElementById("performance-detail-title");
    const detailDateTime = document.getElementById("performance-detail-date-time");
    const detailLocation = document.getElementById("performance-detail-location");
    const detailAddress = document.getElementById("performance-detail-address");
    const detailAddressUnavailable = document.getElementById("performance-detail-address-unavailable");
    const detailArrangements = document.getElementById("performance-detail-arrangements");
    const detailMembers = document.getElementById("performance-detail-members");
    const linksSection = document.getElementById("performance-links-section");
    const detailLinks = document.getElementById("performance-detail-links");
    const linksEmpty = document.getElementById("performance-links-empty");
    const gallerySection = document.getElementById("performance-gallery-section");
    const galleryPreview = document.getElementById("performance-gallery-preview");
    const galleryShowAll = document.getElementById("performance-gallery-show-all");
    const galleryModal = document.getElementById("performance-gallery-modal");
    const galleryModalTitle = document.getElementById("performance-gallery-modal-title");
    const galleryModalClose = document.getElementById("performance-gallery-modal-close");
    const galleryGrid = document.getElementById("performance-gallery-grid");
    const galleryViewer = document.getElementById("performance-gallery-viewer");
    const galleryViewerClose = document.getElementById("performance-gallery-viewer-close");
    const galleryViewerMedia = document.getElementById("performance-gallery-viewer-media");
    const galleryVideoControls = document.getElementById("performance-gallery-video-controls");
    const galleryVideoToggle = document.getElementById("performance-gallery-video-toggle");
    const galleryVideoProgress = document.getElementById("performance-gallery-video-progress");
    const galleryVideoElapsed = document.getElementById("performance-gallery-video-elapsed");
    const galleryVideoDuration = document.getElementById("performance-gallery-video-duration");

    let records = [];
    let arrangementRecords = [];
    let memberRecords = [];
    let activeRecord = null;
    let lastFocusedElement = null;
    let closeTimer = null;
    let galleryRecord = null;
    let activeGalleryVideo = null;
    const selectedArrangements = new Set();
    const CACHE_KEYS = {
        performances: "kmc-public-performances-v2",
        arrangements: "kmc-public-performance-arrangements-v2",
        members: "kmc-public-performance-members-v2"
    };

    if (!grid) return;

    function readCache(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "null");
            return Array.isArray(parsed?.data) ? parsed.data : [];
        } catch (error) {
            console.warn("Unable to read performance cache:", error);
            return [];
        }
    }

    function writeCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({
                savedAt: Date.now(),
                data
            }));
        } catch (error) {
            console.warn("Unable to save performance cache:", error);
        }
    }

    function stableStringify(value) {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return "";
        }
    }

    function safeImageUrl(value) {
        return String(value || "").replaceAll('"', "%22");
    }

    function formatDate(value) {
        if (!value) return "Date TBD";
        const date = new Date(`${value}T12:00:00`);
        if (Number.isNaN(date.getTime())) return value;

        return new Intl.DateTimeFormat("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
        }).format(date);
    }

    function formatTime(record) {
        if (record.timeTbd) return "Time TBD";
        if (!record.time) return "Time unavailable";

        const [hour, minute] = record.time.split(":").map(Number);
        const date = new Date(2000, 0, 1, hour, minute);

        return new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit"
        }).format(date);
    }

    function getLocation(record) {
        if (record.locationTbd) return "Location TBD";
        return record.locationName || record.location || "Location unavailable";
    }

    function arrangementLabel(arrangement) {
        return `${arrangement.name || "Arrangement"} ${arrangement.koreanName || ""}`.trim();
    }

    function getArrangementLabels(record) {
        if (record.arrangementsTbd) return [];
        const ids = Array.isArray(record.arrangementIds) ? record.arrangementIds : [];
        const resolved = ids.map((id) => arrangementRecords.find((item) => item.id === id))
            .filter(Boolean)
            .map(arrangementLabel);
        if (resolved.length) return resolved;
        return Array.isArray(record.arrangements) ? record.arrangements : [];
    }

    function getArrangements(record) {
        if (record.arrangementsTbd) return "Arrangements TBD";
        const items = getArrangementLabels(record);
        return items.length ? items.join(" · ") : "Arrangement details coming soon";
    }

    function createArrowIcon() {
        const span = document.createElement("span");
        span.className = "performance-card-arrow";
        span.setAttribute("aria-hidden", "true");
        span.innerHTML = `
            <svg viewBox="0 0 24 24" focusable="false">
                <path d="M8 5l7 7-7 7"></path>
            </svg>
        `;
        return span;
    }

    function createCard(record, index) {
        const button = document.createElement("button");
        button.className = "performance-card performance-public-card reveal visible";
        button.type = "button";
        button.dataset.performanceId = record.id;
        button.style.transitionDelay = `${Math.min(index * 55, 275)}ms`;

        if (record.highlightPhotoUrl) {
            window.KMCImageLoader?.observeBackground(button, record.highlightPhotoUrl);
            button.classList.add("has-highlight-photo");
        }

        const location = getLocation(record);
        button.setAttribute(
            "aria-label",
            `Open details for the ${formatDate(record.date)} performance at ${location}`
        );

        const content = document.createElement("span");
        content.className = "performance-card-content";

        const dateTime = document.createElement("span");
        dateTime.className = "performance-date-time";
        dateTime.textContent = `${formatDate(record.date)} • ${formatTime(record)}`;

        const locationHeading = document.createElement("span");
        locationHeading.className = "performance-location";
        locationHeading.textContent = location;

        const arrangements = document.createElement("span");
        arrangements.className = "performance-meta";
        arrangements.textContent = getArrangements(record).replaceAll(" · ", " • ");

        content.append(dateTime, locationHeading, arrangements);
        button.append(content, createArrowIcon());
        button.addEventListener("click", () => openDetail(record, button));

        return button;
    }

    function buildGoogleMapsUrl(record) {
        const address = String(record.locationAddress || "").trim();
        const name = getLocation(record);
        const query = address || name;

        if (!query || record.locationTbd) return "";

        const parameters = new URLSearchParams({
            api: "1",
            query
        });

        if (record.locationPlaceId) {
            parameters.set("query_place_id", record.locationPlaceId);
        }

        return `https://www.google.com/maps/search/?${parameters.toString()}`;
    }

    function renderLocation(record) {
        const locationName = getLocation(record);
        const address = String(record.locationAddress || "").trim();
        const mapsUrl = buildGoogleMapsUrl(record);

        detailLocation.textContent = locationName;

        if (address && mapsUrl) {
            detailAddress.textContent = address;
            detailAddress.href = mapsUrl;
            detailAddress.hidden = false;
            detailAddressUnavailable.hidden = true;
        } else {
            detailAddress.textContent = "";
            detailAddress.removeAttribute("href");
            detailAddress.hidden = true;
            detailAddressUnavailable.hidden = false;
        }
    }

    function renderMembers(record) {
        const ids = Array.isArray(record.memberIds) ? record.memberIds : [];
        const resolved = ids.map(id => memberRecords.find(member => member.id === id)).filter(Boolean).map(member => member.name);
        const members = resolved.length ? resolved : (Array.isArray(record.members)
            ? record.members.map((member) => String(member || "").trim()).filter(Boolean)
            : []);

        detailMembers.replaceChildren();

        if (record.membersTbd || members.length === 0) {
            const message = document.createElement("p");
            message.className = "performance-members-placeholder";
            message.textContent = record.membersTbd
                ? "Member list coming soon."
                : "No member list has been added yet.";
            detailMembers.appendChild(message);
            return;
        }

        const list = document.createElement("ul");
        members.forEach((member) => {
            const item = document.createElement("li");
            item.textContent = member;
            list.appendChild(item);
        });
        detailMembers.appendChild(list);
    }

    function galleryItemsFor(record) {
        return Array.isArray(record?.galleryItems)
            ? record.galleryItems.filter((item) => item?.url)
            : [];
    }

    function isGalleryVideo(item) {
        return item?.type === "video" || /^video\//i.test(item?.mimeType || "") || /\.(mp4|mov|webm)$/i.test(item?.url || "");
    }

    function formatDuration(seconds) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    }

    function createGalleryTile(item, className) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = className;
        tile.setAttribute("aria-label", `Open ${item.name || (isGalleryVideo(item) ? "video" : "photo")}`);
        if (isGalleryVideo(item)) {
            const video = document.createElement("video");
            video.src = item.url;
            video.muted = true;
            video.playsInline = true;
            video.preload = "metadata";
            tile.appendChild(video);
            const badge = document.createElement("span");
            badge.className = "performance-gallery-video-badge";
            badge.textContent = item.duration ? formatDuration(item.duration) : "Video";
            tile.appendChild(badge);
        } else {
            const image = document.createElement("img");
            image.src = item.url;
            image.alt = item.name || "Performance gallery photo";
            image.loading = "lazy";
            image.decoding = "async";
            tile.appendChild(image);
        }
        return tile;
    }

    function renderGallery(record) {
        const items = galleryItemsFor(record);
        gallerySection.hidden = items.length === 0;
        galleryPreview.replaceChildren();
        if (!items.length) return;
        galleryRecord = record;
        galleryPreview.replaceChildren(...items.slice(0, 16).map((item, index) => {
            const tile = createGalleryTile(item, "performance-gallery-preview-tile");
            tile.addEventListener("click", () => openGallery(record, index));
            return tile;
        }));
    }

    function closeGalleryViewer() {
        activeGalleryVideo?.pause();
        activeGalleryVideo = null;
        galleryViewer.hidden = true;
        galleryViewerMedia.replaceChildren();
        galleryVideoControls.hidden = true;
        galleryVideoToggle.classList.remove("is-playing");
    }

    function openGalleryViewer(index) {
        const item = galleryItemsFor(galleryRecord)[index];
        if (!item) return;
        closeGalleryViewer();
        galleryViewer.hidden = false;
        if (!isGalleryVideo(item)) {
            const image = document.createElement("img");
            image.src = item.url;
            image.alt = item.name || "Performance gallery photo";
            galleryViewerMedia.appendChild(image);
            return;
        }

        const video = document.createElement("video");
        video.src = item.url;
        video.playsInline = true;
        video.preload = "metadata";
        galleryViewerMedia.appendChild(video);
        activeGalleryVideo = video;
        galleryVideoControls.hidden = false;

        const syncVideoControls = () => {
            const duration = Number(video.duration) || Number(item.duration) || 0;
            galleryVideoProgress.value = duration ? String((video.currentTime / duration) * 100) : "0";
            galleryVideoElapsed.textContent = formatDuration(video.currentTime);
            galleryVideoDuration.textContent = formatDuration(duration);
            galleryVideoToggle.classList.toggle("is-playing", !video.paused);
            galleryVideoToggle.setAttribute("aria-label", video.paused ? "Play video" : "Pause video");
        };

        video.addEventListener("loadedmetadata", syncVideoControls);
        video.addEventListener("timeupdate", syncVideoControls);
        video.addEventListener("play", syncVideoControls);
        video.addEventListener("pause", syncVideoControls);
        video.addEventListener("ended", syncVideoControls);
        galleryVideoToggle.onclick = () => video.paused ? video.play() : video.pause();
        galleryVideoProgress.oninput = () => {
            if (Number.isFinite(video.duration)) video.currentTime = (Number(galleryVideoProgress.value) / 100) * video.duration;
        };
        syncVideoControls();
        video.play().catch(syncVideoControls);
    }

    function openGallery(record, initialIndex = null) {
        if (!galleryModal) return;
        galleryRecord = record;
        const items = galleryItemsFor(record);
        if (!items.length) return;
        closeGalleryViewer();
        galleryModalTitle.textContent = `${formatDate(record.date)} Gallery`;
        galleryGrid.replaceChildren(...items.map((item, index) => {
            const tile = createGalleryTile(item, "performance-gallery-tile");
            tile.addEventListener("click", () => openGalleryViewer(index));
            return tile;
        }));
        galleryModal.hidden = false;
        galleryModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("performance-gallery-open");
        requestAnimationFrame(() => galleryModal.classList.add("is-open"));
        if (Number.isInteger(initialIndex)) openGalleryViewer(initialIndex);
        else galleryModalClose.focus({ preventScroll: true });
    }

    function closeGallery() {
        if (!galleryModal || galleryModal.hidden) return;
        closeGalleryViewer();
        galleryModal.classList.remove("is-open");
        document.body.classList.remove("performance-gallery-open");
        window.setTimeout(() => {
            galleryModal.hidden = true;
            galleryModal.setAttribute("aria-hidden", "true");
        }, 180);
    }

    function createExternalLink(link) {
        const anchor = document.createElement("a");
        anchor.className = "performance-external-link";
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";

        const label = document.createElement("span");
        label.textContent = link.label || "Open Gallery";

        const icon = document.createElement("span");
        icon.className = "performance-external-link-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = `
            <svg viewBox="0 0 24 24" focusable="false">
                <path d="M8 16L16 8"></path>
                <path d="M9 8h7v7"></path>
            </svg>
        `;

        anchor.append(label, icon);
        return anchor;
    }

    function openDetail(record, trigger) {
        if (!detail) return;

        window.clearTimeout(closeTimer);
        activeRecord = record;
        lastFocusedElement = trigger || document.activeElement;

        detailTitle.textContent = getLocation(record);
        detailDateTime.textContent = `${formatDate(record.date)} • ${formatTime(record)}`;
        detailArrangements.textContent = getArrangements(record).replaceAll(" · ", " • ");

        renderLocation(record);
        renderMembers(record);
        renderGallery(record);

        const links = Array.isArray(record.externalLinks)
            ? record.externalLinks.filter((link) => link?.url)
            : [];

        detailLinks.replaceChildren(...links.map(createExternalLink));
        linksEmpty.hidden = links.length !== 0;
        linksSection.hidden = false;

        if (record.highlightPhotoUrl) {
            detailHero.style.setProperty(
                "--detail-image",
                `url("${safeImageUrl(record.highlightPhotoUrl)}")`
            );
            detailHero.classList.add("has-highlight-photo");
        } else {
            detailHero.style.removeProperty("--detail-image");
            detailHero.classList.remove("has-highlight-photo");
        }

        detail.hidden = false;
        detail.setAttribute("aria-hidden", "false");
        document.body.classList.add("performance-detail-open");

        requestAnimationFrame(() => {
            detail.classList.remove("is-closing");
            detail.classList.add("is-open");
            detailClose.focus({ preventScroll: true });
        });

        history.replaceState(null, "", `#${encodeURIComponent(record.id)}`);
    }

    function closeDetail({ restoreHash = true } = {}) {
        if (!detail || detail.hidden) return;

        detail.classList.remove("is-open");
        detail.classList.add("is-closing");
        document.body.classList.remove("performance-detail-open");

        closeTimer = window.setTimeout(() => {
            detail.hidden = true;
            detail.classList.remove("is-closing");
            detail.setAttribute("aria-hidden", "true");
            activeRecord = null;

            if (restoreHash && location.hash) {
                history.replaceState(null, "", location.pathname + location.search);
            }

            lastFocusedElement?.focus?.({ preventScroll: true });
        }, 300);
    }

    function trapDetailFocus(event) {
        if (!detailShell || detail.hidden) return;

        if (event.key === "Escape") {
            event.preventDefault();
            closeDetail();
            return;
        }

        if (event.key !== "Tab") return;

        const focusable = [...detailShell.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter((element) => element.offsetParent !== null);

        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function normalizeArrangement(value) {
        return String(value || "").trim().toLocaleLowerCase();
    }

    function getRecordArrangements(record) {
        return getArrangementLabels(record).map((item) => String(item || "").trim()).filter(Boolean);
    }

    function getRecordArrangementKeys(record) {
        const ids = Array.isArray(record.arrangementIds) ? record.arrangementIds.map(normalizeArrangement) : [];
        return [...ids, ...getRecordArrangements(record).map(normalizeArrangement)];
    }

    function updateArrangementSummary() {
        const selectedInputs = [...arrangementOptions.querySelectorAll('input[type="checkbox"]:checked')];
        const selectedLabels = selectedInputs.map((input) => input.dataset.label || input.value);

        if (selectedLabels.length === 0) {
            arrangementSummary.textContent = "All";
            allArrangementsInput.checked = true;
            return;
        }

        allArrangementsInput.checked = false;

        if (selectedLabels.length === 1) {
            arrangementSummary.textContent = selectedLabels[0];
        } else if (selectedLabels.length === 2) {
            arrangementSummary.textContent = `${selectedLabels[0]} + ${selectedLabels[1]}`;
        } else {
            arrangementSummary.textContent = `${selectedLabels.length} selected`;
        }
    }

    function setAllArrangements() {
        selectedArrangements.clear();

        arrangementOptions.querySelectorAll('input[type="checkbox"]').forEach((input) => {
            input.checked = false;
        });

        allArrangementsInput.checked = true;
        updateArrangementSummary();
        render();
    }

    function createArrangementFilterOption(option) {
        const arrangement = option.label;
        const label = document.createElement("label");
        label.className = "performance-check-option";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = option.key;
        input.dataset.label = arrangement;

        const checkmark = document.createElement("span");
        checkmark.className = "performance-checkmark";
        checkmark.setAttribute("aria-hidden", "true");

        const text = document.createElement("span");
        text.textContent = arrangement;

        input.addEventListener("change", () => {
            const key = normalizeArrangement(option.key);

            if (input.checked) {
                selectedArrangements.add(key);
            } else {
                selectedArrangements.delete(key);
            }

            if (selectedArrangements.size === 0) {
                setAllArrangements();
                return;
            }

            allArrangementsInput.checked = false;
            updateArrangementSummary();
            render();
        });

        label.append(input, checkmark, text);
        return label;
    }

    function populateArrangementFilter() {
        const usedIds = new Set(records.flatMap((record) => Array.isArray(record.arrangementIds) ? record.arrangementIds : []));
        const catalogOptions = arrangementRecords
            .filter((item) => usedIds.has(item.id))
            .map((item) => ({ key: item.id, label: arrangementLabel(item) }));
        const legacyLabels = [...new Set(records
            .filter((record) => !Array.isArray(record.arrangementIds) || record.arrangementIds.length === 0)
            .flatMap(getRecordArrangements))]
            .filter((label) => !catalogOptions.some((option) => option.label === label))
            .map((label) => ({ key: label, label }));
        const arrangements = [...catalogOptions, ...legacyLabels]
            .sort((a, b) => a.label.localeCompare(b.label));

        arrangementOptions.replaceChildren(
            ...arrangements.map(createArrangementFilterOption)
        );

        arrangementTrigger.disabled = arrangements.length === 0;
        allArrangementsInput.checked = true;
        updateArrangementSummary();
    }

    function openArrangementPopover() {
        if (arrangementTrigger.disabled) return;
        arrangementPopover.hidden = false;
        arrangementTrigger.setAttribute("aria-expanded", "true");
        arrangementFilter.classList.add("is-open");
    }

    function closeArrangementPopover() {
        arrangementPopover.hidden = true;
        arrangementTrigger.setAttribute("aria-expanded", "false");
        arrangementFilter.classList.remove("is-open");
    }

    function toggleArrangementPopover() {
        if (arrangementPopover.hidden) {
            openArrangementPopover();
        } else {
            closeArrangementPopover();
        }
    }

    function recordMatchesArrangementFilter(record) {
        if (selectedArrangements.size === 0) return true;

        const recordArrangements = getRecordArrangementKeys(record);

        return recordArrangements.some((arrangement) =>
            selectedArrangements.has(arrangement)
        );
    }

    function updateCount(visibleCount) {
        const total = records.length;

        if (!total) {
            count.textContent = "No performances published";
            return;
        }

        count.textContent = visibleCount === total
            ? `${total} ${total === 1 ? "performance" : "performances"}`
            : `${visibleCount} of ${total} performances`;
    }

    function render() {
        const selectedYear = yearFilter.value;
        const visible = records.filter((record) => {
            const matchesYear = selectedYear === "all" ||
                String(record.date || "").startsWith(selectedYear);

            return matchesYear && recordMatchesArrangementFilter(record);
        });

        grid.replaceChildren(...visible.map(createCard));
        grid.setAttribute("aria-busy", "false");
        emptyState.hidden = visible.length !== 0;
        grid.hidden = visible.length === 0;
        updateCount(visible.length);

        requestAnimationFrame(() => {
            grid.querySelectorAll(".reveal").forEach((element) => {
                element.classList.add("visible");
            });
        });
    }

    function populateYearFilter() {
        const years = [...new Set(
            records
                .map((record) => String(record.date || "").slice(0, 4))
                .filter((year) => /^\d{4}$/.test(year))
        )].sort((a, b) => Number(b) - Number(a));

        yearFilter.replaceChildren(new Option("All", "all"));
        years.forEach((year) => yearFilter.add(new Option(year, year)));
        yearFilter.disabled = years.length === 0;
    }

    function showLoadError() {
        const error = document.createElement("div");
        error.className = "performance-load-error";

        const heading = document.createElement("h2");
        heading.textContent = "Performances are temporarily unavailable";

        const paragraph = document.createElement("p");
        paragraph.textContent = "Please refresh the page and try again.";

        error.append(heading, paragraph);
        grid.replaceChildren(error);
        grid.setAttribute("aria-busy", "false");
        count.textContent = "Unable to load performances";
    }

    function openHashRecord() {
        const rawId = location.hash.slice(1);
        if (!rawId) return;

        let id = rawId;

        try {
            id = decodeURIComponent(rawId);
        } catch (error) {
            console.warn("Unable to decode performance link:", error);
        }

        const record = records.find((item) => item.id === id);
        if (!record) return;

        const matchingCard = [...grid.querySelectorAll(".performance-card")]
            .find((card) => card.dataset.performanceId === id);

        matchingCard?.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        window.setTimeout(() => {
            openDetail(record, matchingCard || null);
        }, matchingCard ? 360 : 0);
    }

    detailClose?.addEventListener("click", () => closeDetail());
    detail?.querySelector(".performance-detail-backdrop")?.addEventListener("click", () => closeDetail());
    detail?.addEventListener("keydown", trapDetailFocus);
    galleryShowAll?.addEventListener("click", () => activeRecord && openGallery(activeRecord));
    galleryModalClose?.addEventListener("click", closeGallery);
    galleryModal?.querySelector(".performance-gallery-modal-backdrop")?.addEventListener("click", closeGallery);
    galleryViewerClose?.addEventListener("click", closeGalleryViewer);
    yearFilter.addEventListener("change", render);

    arrangementTrigger?.addEventListener("click", toggleArrangementPopover);

    allArrangementsInput?.addEventListener("change", () => {
        if (allArrangementsInput.checked) {
            setAllArrangements();
        } else if (selectedArrangements.size === 0) {
            allArrangementsInput.checked = true;
        }
    });

    document.addEventListener("click", (event) => {
        if (!arrangementFilter?.contains(event.target)) {
            closeArrangementPopover();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (!galleryModal?.hidden && event.key === "Escape") {
            event.preventDefault();
            if (!galleryViewer.hidden) closeGalleryViewer();
            else closeGallery();
            return;
        }
        if (event.key === "Escape" && !arrangementPopover.hidden) {
            closeArrangementPopover();
            arrangementTrigger.focus();
        }
    });

    window.addEventListener("hashchange", openHashRecord);

    function refreshControlsAndCards({ reopenHash = false } = {}) {
        const selectedYear = yearFilter.value || "all";
        const selectedKeys = new Set(selectedArrangements);

        populateYearFilter();
        if ([...yearFilter.options].some((option) => option.value === selectedYear)) {
            yearFilter.value = selectedYear;
        }

        populateArrangementFilter();
        selectedArrangements.clear();
        arrangementOptions.querySelectorAll('input[type="checkbox"]').forEach((input) => {
            const key = normalizeArrangement(input.value);
            const checked = selectedKeys.has(key);
            input.checked = checked;
            if (checked) selectedArrangements.add(key);
        });
        allArrangementsInput.checked = selectedArrangements.size === 0;
        updateArrangementSummary();
        render();

        if (activeRecord) {
            const updated = records.find((record) => record.id === activeRecord.id);
            if (updated) {
                activeRecord = updated;
                detailTitle.textContent = getLocation(updated);
                detailDateTime.textContent = `${formatDate(updated.date)} • ${formatTime(updated)}`;
                detailArrangements.textContent = getArrangements(updated).replaceAll(" · ", " • ");
                renderLocation(updated);
                renderMembers(updated);
                renderGallery(updated);
            }
        } else if (reopenHash) {
            openHashRecord();
        }
    }

    const cachedPerformances = readCache(CACHE_KEYS.performances);
    arrangementRecords = readCache(CACHE_KEYS.arrangements);
    memberRecords = readCache(CACHE_KEYS.members);

    if (cachedPerformances.length) {
        records = cachedPerformances;
        refreshControlsAndCards({ reopenHash: true });
    }

    if (!db || !dataStore) {
        if (!records.length) showLoadError();
        return;
    }

    const startBackgroundLoad = () => {
        const performancesRequest = dataStore.getPerformances();
        const arrangementRequest = dataStore.getArrangements();
        const teamRequest = dataStore.getTeam();

        performancesRequest
            .then((freshRecords) => {

                const changed = stableStringify(freshRecords) !== stableStringify(records);
                records = freshRecords;
                writeCache(CACHE_KEYS.performances, records);

                if (changed || !grid.querySelector(".performance-card")) {
                    refreshControlsAndCards({ reopenHash: true });
                }
            })
            .catch((error) => {
                console.error("Unable to load performances:", error);
                if (!records.length) showLoadError();
            });

        Promise.allSettled([arrangementRequest, teamRequest]).then((results) => {
            const [arrangementResult, teamResult] = results;
            let metadataChanged = false;

            if (arrangementResult.status === "fulfilled") {
                const data = arrangementResult.value || {};
                const freshArrangements = Array.isArray(data.arrangements)
                    ? [...data.arrangements].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    : [];
                metadataChanged = metadataChanged || stableStringify(freshArrangements) !== stableStringify(arrangementRecords);
                arrangementRecords = freshArrangements;
                writeCache(CACHE_KEYS.arrangements, arrangementRecords);
            }

            if (teamResult.status === "fulfilled") {
                const data = teamResult.value || {};
                const freshMembers = Array.isArray(data.members)
                    ? data.members.map((member, index) => ({
                        ...member,
                        id: member.id || `legacy-member-${index}`
                    }))
                    : [];
                metadataChanged = metadataChanged || stableStringify(freshMembers) !== stableStringify(memberRecords);
                memberRecords = freshMembers;
                writeCache(CACHE_KEYS.members, memberRecords);
            }

            if (metadataChanged && records.length) {
                refreshControlsAndCards();
            }
        });
    };

    if (cachedPerformances.length) {
        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(startBackgroundLoad, { timeout: 900 });
        } else {
            window.setTimeout(startBackgroundLoad, 40);
        }
    } else {
        startBackgroundLoad();
    }

});
