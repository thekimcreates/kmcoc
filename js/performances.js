"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const db = window.kmcFirebase?.db;
    const storage = window.kmcFirebase?.storage;
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
    const galleryViewerPrevious = document.getElementById("performance-gallery-viewer-previous");
    const galleryViewerNext = document.getElementById("performance-gallery-viewer-next");
    const galleryViewerMedia = document.getElementById("performance-gallery-viewer-media");
    const galleryVideoControls = document.getElementById("performance-gallery-video-controls");
    const galleryVideoToggle = document.getElementById("performance-gallery-video-toggle");
    const galleryVideoProgress = document.getElementById("performance-gallery-video-progress");
    const galleryVideoElapsed = document.getElementById("performance-gallery-video-elapsed");
    const galleryVideoDuration = document.getElementById("performance-gallery-video-duration");
    const galleryFilmstripTrack = document.getElementById("performance-gallery-filmstrip-track");

    let records = [];
    let arrangementRecords = [];
    let memberRecords = [];
    let activeRecord = null;
    let lastFocusedElement = null;
    let closeTimer = null;
    let galleryRecord = null;
    let activeGalleryVideo = null;
    let activeGalleryLoadToken = 0;
    let activeGalleryIndex = -1;
    let galleryTransitioning = false;
    let galleryOpeningReady = Promise.resolve();
    let finishGalleryOpening = null;
    const selectedArrangements = new Set();
    const CACHE_KEYS = {
        performances: "kmc-public-performances-v3",
        arrangements: "kmc-public-performance-arrangements-v2",
        members: "kmc-public-performance-members-v2"
    };
    const GALLERY_CACHE_NAMES = {
        thumbnails: "kmc-performance-gallery-thumbnails-v2",
        fullImages: "kmc-performance-gallery-full-images-v1"
    };
    const galleryImageSources = new Map();
    const galleryObjectUrls = new Set();
    const galleryLegacyPreviewPromises = new Map();
    const galleryLegacyPreviewQueue = [];
    let galleryLegacyPreviewWorkers = 0;

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
        if (key === CACHE_KEYS.performances) data = data.map(({ galleryItems, ...record }) => ({ ...record, _summaryOnly: true }));
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
        if (!Array.isArray(record?.galleryItems)) return [];
        return record.galleryItems
            .filter((item) => item?.url)
            .map((item, index) => ({ item, index }))
            .sort((a, b) => {
                const videoOrder = Number(isGalleryVideo(b.item)) - Number(isGalleryVideo(a.item));
                if (videoOrder) return videoOrder;
                const nameOrder = String(a.item.name || "").localeCompare(String(b.item.name || ""), undefined, {
                    numeric: true,
                    sensitivity: "base"
                });
                return nameOrder || a.index - b.index;
            })
            .map(({ item }) => item);
    }

    function isGalleryVideo(item) {
        return item?.type === "video" || /^video\//i.test(item?.mimeType || "") || /\.(mp4|mov|webm)$/i.test(item?.url || "");
    }

    function formatDuration(seconds) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    }

    function formatGalleryDate(value) {
        if (!value) return "Date TBD";
        const date = new Date(`${value}T12:00:00`);
        if (Number.isNaN(date.getTime())) return value;
        return new Intl.DateTimeFormat("en-US", {
            month: "numeric",
            day: "numeric",
            year: "numeric"
        }).format(date);
    }

    function galleryThumbnailCandidates(item) {
        return [
            item?.thumbnailDataUrl,
            item?.thumbnailUrl,
            item?.thumbnailURL,
            item?.thumbUrl,
            item?.previewUrl
        ].map(value => String(value || "").trim()).filter((value, index, values) => value && values.indexOf(value) === index);
    }

    function createGalleryPlaceholder(item) {
        const placeholder = document.createElement("span");
        placeholder.className = "performance-gallery-placeholder";
        const spinner = document.createElement("span");
        spinner.className = "performance-gallery-loader";
        placeholder.appendChild(spinner);
        placeholder.setAttribute("aria-hidden", "true");
        return placeholder;
    }

    async function cachedImageSource(url, cacheName) {
        if (!url || /^(data:|blob:)/i.test(url)) return url || "";
        const memoryKey = `${cacheName}:${url}`;
        if (galleryImageSources.has(memoryKey)) return galleryImageSources.get(memoryKey);
        try {
            let response = null;
            let cache = null;
            if ("caches" in window) {
                cache = await window.caches.open(cacheName);
                response = await cache.match(url);
            }
            if (!response) {
                response = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
                if (!response.ok) throw new Error(`Image request failed with ${response.status}.`);
                if (cache) {
                    try { await cache.put(url, response.clone()); } catch (_) { /* Browser cache remains available. */ }
                }
            }
            const blob = await response.blob();
            if (!blob.size || !/^image\//i.test(blob.type || "")) throw new Error("The cached response was not an image.");
            const objectUrl = URL.createObjectURL(blob);
            galleryImageSources.set(memoryKey, objectUrl);
            galleryObjectUrls.add(objectUrl);
            return objectUrl;
        } catch (error) {
            console.warn("Unable to cache gallery image:", error);
            galleryImageSources.set(memoryKey, url);
            return url;
        }
    }

    function exportGalleryPreview(canvas) {
        return new Promise((resolve, reject) => {
            const finish = (blob) => {
                if (blob?.size) return resolve(blob);
                canvas.toBlob((fallback) => fallback?.size
                    ? resolve(fallback)
                    : reject(new Error("This gallery preview could not be created.")), "image/jpeg", 0.62);
            };
            try {
                canvas.toBlob(finish, "image/webp", 0.56);
            } catch (_) {
                finish(null);
            }
        });
    }

    function loadGalleryBlobImage(blob) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(blob);
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("This gallery photo could not be decoded."));
            };
            image.src = objectUrl;
        });
    }

    async function compactGalleryImageBlob(blob) {
        const image = await loadGalleryBlobImage(blob);
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) throw new Error("This gallery photo has no readable dimensions.");
        const scale = Math.min(1, 360 / sourceWidth, 360 / sourceHeight);
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Gallery previews are not supported by this browser.");
        context.fillStyle = "#000";
        context.fillRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, width, height);
        const preview = await exportGalleryPreview(canvas);
        canvas.width = 1;
        canvas.height = 1;
        return { blob: preview, width, height };
    }

    function captureGalleryVideoPreview(url, item) {
        return window.KMCVideoPreview.capture(url, {
            maxEdge: 360, quality: 0.56, jpegQuality: 0.62,
            resolveSource: item?.path && storage
                ? () => storage.ref(item.path).getDownloadURL() : undefined
        });
    }

    function runGalleryLegacyPreviewQueue() {
        while (galleryLegacyPreviewWorkers < 3 && galleryLegacyPreviewQueue.length) {
            const job = galleryLegacyPreviewQueue.shift();
            galleryLegacyPreviewWorkers += 1;
            Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
                galleryLegacyPreviewWorkers -= 1;
                runGalleryLegacyPreviewQueue();
            });
        }
    }

    function queueGalleryLegacyPreview(task) {
        return new Promise((resolve, reject) => {
            galleryLegacyPreviewQueue.push({ task, resolve, reject });
            runGalleryLegacyPreviewQueue();
        });
    }

    function resolveLegacyGalleryPreview(item) {
        const url = String(item?.url || "").trim();
        if (!url) return Promise.resolve("");
        if (galleryLegacyPreviewPromises.has(url)) return galleryLegacyPreviewPromises.get(url);
        const promise = queueGalleryLegacyPreview(async () => {
            const memoryKey = `legacy-preview:${GALLERY_CACHE_NAMES.thumbnails}:${url}`;
            if (galleryImageSources.has(memoryKey)) return galleryImageSources.get(memoryKey);
            let cache = null;
            let cached = null;
            if ("caches" in window) {
                try {
                    cache = await window.caches.open(GALLERY_CACHE_NAMES.thumbnails);
                    cached = await cache.match(url);
                } catch (_) { /* A blocked cache must not prevent frame extraction. */ }
            }
            let preview = null;
            if (cached?.headers.get("x-kmc-gallery-preview") === "1") {
                const blob = await cached.blob();
                preview = {
                    blob,
                    width: Number(cached.headers.get("x-kmc-preview-width")) || 0,
                    height: Number(cached.headers.get("x-kmc-preview-height")) || 0
                };
            }
            if (preview) {
                try { await loadGalleryBlobImage(preview.blob); }
                catch (_) { preview = null; cached = null; }
            }
            if (!preview && isGalleryVideo(item)) {
                // Stop loading as soon as the first frame has been compressed.
                // The browser can use byte ranges when the server supports them.
                preview = await captureGalleryVideoPreview(url, item);
            } else if (!preview) {
                // Legacy records were saved without a thumbnail. Download the
                // original once, create a tiny preview, and retain only that
                // preview in the thumbnail cache for future gallery visits.
                let sourceBlob = cached ? await cached.blob() : null;
                if (!sourceBlob?.size) {
                    const response = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
                    if (!response.ok) throw new Error(`Gallery photo request failed with ${response.status}.`);
                    sourceBlob = await response.blob();
                }
                preview = await compactGalleryImageBlob(sourceBlob);
            }
            if (!preview?.blob?.size) throw new Error("This gallery preview is empty.");
            if (cache && cached?.headers.get("x-kmc-gallery-preview") !== "1") {
                try {
                    await cache.put(url, new Response(preview.blob, {
                        headers: {
                            "content-type": preview.blob.type || "image/webp",
                            "cache-control": "public,max-age=31536000,immutable",
                            "x-kmc-gallery-preview": "1",
                            "x-kmc-preview-width": String(preview.width || 0),
                            "x-kmc-preview-height": String(preview.height || 0)
                        }
                    }));
                } catch (_) { /* The in-memory preview still works for this visit. */ }
            }
            if (!item.thumbnailWidth && preview.width) item.thumbnailWidth = preview.width;
            if (!item.thumbnailHeight && preview.height) item.thumbnailHeight = preview.height;
            const objectUrl = URL.createObjectURL(preview.blob);
            galleryImageSources.set(memoryKey, objectUrl);
            galleryObjectUrls.add(objectUrl);
            return objectUrl;
        }).catch((error) => {
            console.warn("Unable to create a lightweight preview for this legacy gallery item:", error);
            // Keep the spinner on failure. Allow another gallery opening to
            // retry instead of memoizing a failed preview for this visit.
            // Never use an uncompressed original as the low-quality preview.
            galleryLegacyPreviewPromises.delete(url);
            return "";
        });
        galleryLegacyPreviewPromises.set(url, promise);
        return promise;
    }

    function loadAndDecodeImage(image, source, timeoutMs = 0, requireDecode = false) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let timer;
            const finish = (error) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                image.onload = image.onerror = null;
                if (error) {
                    image.removeAttribute("src");
                    reject(error);
                } else resolve(image);
            };
            image.onload = async () => {
                try {
                    if (typeof image.decode === "function") await image.decode();
                } catch (error) {
                    if (requireDecode) return finish(error);
                    // Thumbnails may still use a completed load on browsers
                    // whose optional decode() rejects a usable image.
                }
                if (requireDecode && (!image.complete || !image.naturalWidth || !image.naturalHeight)) {
                    return finish(new Error("The full gallery image is not ready to display."));
                }
                finish();
            };
            image.onerror = () => finish(new Error("This gallery image could not be loaded."));
            if (timeoutMs) timer = window.setTimeout(() => finish(new Error("Gallery thumbnail timed out.")), timeoutMs);
            image.src = source;
        });
    }

    async function* resolveGalleryThumbnails(item) {
        const candidates = galleryThumbnailCandidates(item);
        // Use embedded/saved images before making any Firebase request.
        yield* candidates;
        if (item?.thumbnailPath && storage) {
            let timeout;
            try {
                const refreshed = await Promise.race([
                    storage.ref(item.thumbnailPath).getDownloadURL(),
                    new Promise((_, reject) => {
                        timeout = window.setTimeout(() => reject(new Error("Preview URL lookup timed out.")), 5000);
                    })
                ]);
                if (refreshed && !candidates.includes(refreshed)) yield refreshed;
            } catch (error) {
                console.warn("Unable to load gallery preview:", error);
            } finally {
                window.clearTimeout(timeout);
            }
        }
    }

    function attachGalleryThumbnail(container, item, className = "") {
        const placeholder = createGalleryPlaceholder(item);
        if (className) placeholder.classList.add(className);
        container.appendChild(placeholder);
        const promise = (async () => {
            for await (const candidate of resolveGalleryThumbnails(item)) {
                const image = document.createElement("img");
                image.alt = "";
                image.decoding = "async";
                // The image is decoded before it replaces the placeholder, so
                // it must not be lazy-loaded while detached from the document.
                image.loading = "eager";
                if (className) image.classList.add(className);
                try {
                    // Native image loading can display cross-origin thumbnails
                    // even when a CORS fetch/cache request is unavailable.
                    const source = candidate;
                    await loadAndDecodeImage(image, source, 12000);
                    if (placeholder.isConnected) placeholder.replaceWith(image);
                    return source;
                } catch (error) {
                    console.warn("Unable to display a gallery thumbnail candidate:", error);
                }
            }
            const fallback = await resolveLegacyGalleryPreview(item);
            if (fallback) {
                const image = document.createElement("img");
                image.alt = "";
                image.decoding = "async";
                image.loading = "eager";
                if (className) image.classList.add(className);
                try {
                    await loadAndDecodeImage(image, fallback, 12000);
                    if (placeholder.isConnected) placeholder.replaceWith(image);
                    return fallback;
                } catch (error) {
                    console.warn("Unable to display the generated gallery preview:", error);
                }
            }
            if (!isGalleryVideo(item)) {
                placeholder.replaceChildren();
                placeholder.textContent = "Preview unavailable";
            }
            return "";
        })().catch((error) => {
            console.warn("Unable to prepare gallery thumbnail:", error);
            if (!isGalleryVideo(item)) {
                placeholder.replaceChildren();
                placeholder.textContent = "Preview unavailable";
            }
            return "";
        });
        return { placeholder, promise };
    }

    function createGalleryTile(item, className, index) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = className;
        tile.dataset.galleryIndex = String(index);
        tile.setAttribute("aria-label", `Open ${item.name || (isGalleryVideo(item) ? "video" : "photo")}`);
        attachGalleryThumbnail(tile, item);
        if (isGalleryVideo(item)) {
            const badge = document.createElement("span");
            badge.className = "performance-gallery-video-badge";
            badge.textContent = item.duration ? formatDuration(item.duration) : "Video";
            tile.appendChild(badge);
        }
        return tile;
    }

    let galleryDetailRequest = 0;
    function renderGallery(record) {
        const request = ++galleryDetailRequest;
        if (record._summaryOnly) {
            gallerySection.hidden = false;
            galleryShowAll.hidden = true;
            const message = document.createElement("p");
            message.textContent = "Loading gallery…";
            message.setAttribute("role", "status");
            galleryPreview.replaceChildren(message);
            window.KMCPerformanceList.detail(record).then(full => {
                if (request !== galleryDetailRequest || activeRecord?.id !== record.id || detail.classList.contains("is-closing")) return;
                activeRecord = full;
                renderGallery(full);
            }).catch(error => {
                if (request !== galleryDetailRequest || activeRecord?.id !== record.id) return;
                message.textContent = "The gallery could not be loaded. ";
                const retry = document.createElement("button");
                retry.type = "button";
                retry.textContent = "Try again";
                retry.addEventListener("click", () => renderGallery(record));
                message.appendChild(retry);
                console.warn("Unable to load this performance gallery:", error);
            });
            return;
        }
        galleryShowAll.hidden = false;
        const items = galleryItemsFor(record);
        gallerySection.hidden = items.length === 0;
        galleryPreview.replaceChildren();
        if (!items.length) return;
        galleryRecord = record;
        galleryPreview.replaceChildren(...items.slice(0, 16).map((item, index) => {
            const tile = createGalleryTile(item, "performance-gallery-preview-tile", index);
            tile.addEventListener("click", () => openGallery(record, index, tile));
            return tile;
        }));
    }

    function waitForAnimationFrames(count = 1) {
        return new Promise((resolve) => {
            const next = () => count-- > 1 ? requestAnimationFrame(next) : requestAnimationFrame(resolve);
            next();
        });
    }

    function stopActiveGalleryVideo() {
        activeGalleryLoadToken += 1;
        activeGalleryVideo?.pause();
        if (activeGalleryVideo) {
            activeGalleryVideo.removeAttribute("src");
            activeGalleryVideo.load();
        }
        activeGalleryVideo = null;
        galleryVideoControls.hidden = true;
        galleryVideoToggle.classList.remove("is-playing");
    }

    function hideGalleryViewerImmediately() {
        stopActiveGalleryVideo();
        finishGalleryOpening?.();
        finishGalleryOpening = null;
        galleryOpeningReady = Promise.resolve();
        galleryViewer.classList.remove("is-visible");
        galleryViewer.classList.remove("is-content-visible");
        galleryViewer.classList.remove("is-shared-transitioning");
        galleryModal?.classList.remove("is-viewing");
        document.body.classList.remove("performance-gallery-viewer-open");
        galleryViewer.hidden = true;
        galleryViewerMedia.replaceChildren();
        galleryFilmstripTrack.replaceChildren();
        activeGalleryIndex = -1;
        galleryTransitioning = false;
    }

    function updateViewerNavigation() {
        const items = galleryItemsFor(galleryRecord);
        galleryViewerPrevious.hidden = activeGalleryIndex <= 0;
        galleryViewerNext.hidden = activeGalleryIndex < 0 || activeGalleryIndex >= items.length - 1;
    }

    function centerFilmstripItem(index, smooth = true) {
        requestAnimationFrame(() => {
            const selected = galleryFilmstripTrack.querySelector(`[data-gallery-index="${index}"]`);
            if (!selected) return;
            const left = selected.offsetLeft + selected.offsetWidth / 2 - galleryFilmstripTrack.clientWidth / 2;
            galleryFilmstripTrack.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
        });
    }

    function updateFilmstripSelection(index, smooth = true) {
        galleryFilmstripTrack.querySelectorAll(".performance-gallery-filmstrip-item").forEach((button) => {
            const selected = Number(button.dataset.galleryIndex) === index;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-selected", String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        centerFilmstripItem(index, smooth);
    }

    function renderGalleryFilmstrip() {
        const items = galleryItemsFor(galleryRecord);
        galleryFilmstripTrack.replaceChildren(...items.map((item, index) => {
            const button = createGalleryTile(item, "performance-gallery-filmstrip-item", index);
            button.setAttribute("role", "option");
            button.addEventListener("click", () => selectGalleryItem(index));
            return button;
        }));
    }

    function renderExpandedGalleryItem(index) {
        const item = galleryItemsFor(galleryRecord)[index];
        if (!item) return;
        stopActiveGalleryVideo();
        activeGalleryIndex = index;
        const loadToken = activeGalleryLoadToken;
        const openingReady = galleryOpeningReady;
        galleryViewerMedia.replaceChildren();
        const previewLayer = document.createElement("div");
        previewLayer.className = "performance-gallery-progressive-preview";
        const thumbnail = attachGalleryThumbnail(previewLayer, item);
        galleryViewerMedia.appendChild(previewLayer);
        updateViewerNavigation();
        updateFilmstripSelection(index, galleryViewer.classList.contains("is-content-visible"));

        if (!isGalleryVideo(item)) {
            const image = document.createElement("img");
            image.className = "performance-gallery-progressive-full";
            image.alt = item.name || "Performance gallery photo";
            image.decoding = "async";
            image.loading = "eager";
            // Decode off-DOM: even a direct URL fallback can never paint
            // progressive/partial image data over the lightweight preview.
            (async () => {
                try {
                    // response.blob() resolves only after every byte has arrived.
                    // Keep the thumbnail visible through both transfer and decode.
                    const source = await cachedImageSource(item.url, GALLERY_CACHE_NAMES.fullImages);
                    await loadAndDecodeImage(image, source, 0, true);
                    await openingReady;
                    if (loadToken !== activeGalleryLoadToken || !previewLayer.isConnected) return;
                    image.classList.add("is-loaded");
                    // Replace in one DOM operation after transfer AND decode.
                    // Both layers occupy the same fitted viewport box.
                    previewLayer.replaceWith(image);
                } catch (error) {
                    console.warn("Unable to load full gallery image:", error);
                }
            })();
            return;
        }

        const video = document.createElement("video");
        video.className = "performance-gallery-streaming-video";
        video.playsInline = true;
        // Metadata plus play() lets the browser use HTTP range requests and
        // buffer only what playback needs instead of downloading the file first.
        video.preload = "metadata";
        thumbnail.promise.then((url) => {
            if (url && loadToken === activeGalleryLoadToken) video.poster = url;
        });
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
        const revealVideoFrame = () => {
            if (loadToken !== activeGalleryLoadToken) return;
            video.classList.add("is-loaded");
            previewLayer.remove();
        };
        video.addEventListener("loadeddata", () => {
            if (typeof video.requestVideoFrameCallback !== "function") revealVideoFrame();
        });
        video.addEventListener("playing", () => {
            if (loadToken === activeGalleryLoadToken) {
                if (typeof video.requestVideoFrameCallback === "function") {
                    video.requestVideoFrameCallback(revealVideoFrame);
                } else {
                    revealVideoFrame();
                }
            }
        });
        galleryVideoToggle.onclick = () => video.paused ? video.play() : video.pause();
        galleryVideoProgress.oninput = () => {
            if (Number.isFinite(video.duration)) video.currentTime = (Number(galleryVideoProgress.value) / 100) * video.duration;
        };
        syncVideoControls();
        video.src = item.url;
        video.play().catch(syncVideoControls);
    }

    function galleryAspectRatio(item, visual = null) {
        const width = Number(item?.thumbnailWidth) || Number(visual?.naturalWidth) || 1;
        const height = Number(item?.thumbnailHeight) || Number(visual?.naturalHeight) || 1;
        return width > 0 && height > 0 ? width / height : 1;
    }

    function containedMediaRect(item, visual = null) {
        const stage = galleryViewerMedia.getBoundingClientRect();
        const ratio = galleryAspectRatio(item, visual);
        let width = stage.width;
        let height = width / ratio;
        if (height > stage.height) {
            height = stage.height;
            width = height * ratio;
        }
        return {
            left: stage.left + (stage.width - width) / 2,
            top: stage.top + (stage.height - height) / 2,
            width,
            height
        };
    }

    function createSharedMediaProxy(tile, item) {
        const sourceVisual = tile?.querySelector("img, .performance-gallery-placeholder");
        const proxy = sourceVisual?.cloneNode(true) || createGalleryPlaceholder(item);
        proxy.classList.add("performance-gallery-shared-media");
        if (proxy instanceof HTMLImageElement) {
            proxy.removeAttribute("loading");
            proxy.alt = "";
        }
        document.body.appendChild(proxy);
        return { proxy, sourceVisual };
    }

    function setProxyRect(proxy, rect) {
        proxy.style.left = `${rect.left}px`;
        proxy.style.top = `${rect.top}px`;
        proxy.style.width = `${rect.width}px`;
        proxy.style.height = `${rect.height}px`;
    }

    async function animateSharedMedia(proxy, from, to, opening) {
        setProxyRect(proxy, from);
        if (!proxy.animate) {
            setProxyRect(proxy, to);
            await new Promise(resolve => window.setTimeout(resolve, 420));
            return;
        }
        const animation = proxy.animate([
            {
                left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
                borderRadius: opening ? "0px" : "2px"
            },
            {
                left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`,
                borderRadius: opening ? "2px" : "0px"
            }
        ], {
            duration: 470,
            easing: "cubic-bezier(.22,1,.36,1)",
            fill: "forwards"
        });
        let timeoutId = 0;
        const timeout = new Promise(resolve => {
            timeoutId = window.setTimeout(resolve, 560);
        });
        try {
            await Promise.race([animation.finished.catch(() => undefined), timeout]);
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    async function openGalleryViewer(index, sourceTile = null) {
        const item = galleryItemsFor(galleryRecord)[index];
        if (!item || galleryTransitioning) return;
        if (!galleryViewer.hidden) return selectGalleryItem(index);
        galleryTransitioning = true;
        galleryOpeningReady = new Promise(resolve => { finishGalleryOpening = resolve; });
        galleryViewer.hidden = false;
        galleryViewer.classList.add("is-shared-transitioning");
        galleryModal.classList.add("is-viewing");
        document.body.classList.add("performance-gallery-viewer-open");
        renderGalleryFilmstrip();
        renderExpandedGalleryItem(index);
        await waitForAnimationFrames(2);

        let proxy = null;
        try {
            const tile = sourceTile || galleryGrid.querySelector(`[data-gallery-index="${index}"]`);
            const from = tile?.getBoundingClientRect();
            const shared = createSharedMediaProxy(tile, item);
            proxy = shared.proxy;
            const to = containedMediaRect(item, shared.sourceVisual);
            galleryViewer.classList.add("is-visible");
            if (from?.width && from?.height) await animateSharedMedia(proxy, from, to, true);
        } finally {
            proxy?.remove();
            galleryViewerMedia.getAnimations?.().forEach(animation => animation.cancel());
            galleryViewerMedia.style.opacity = "1";
            galleryViewerMedia.style.transform = "none";
            galleryViewer.classList.remove("is-shared-transitioning");
            galleryViewer.classList.add("is-visible");
            galleryViewer.classList.add("is-content-visible");
            // Let the fully expanded preview paint before revealing a decoded original.
            await waitForAnimationFrames(2);
            finishGalleryOpening?.();
            finishGalleryOpening = null;
            galleryTransitioning = false;
            galleryViewerClose.focus({ preventScroll: true });
        }
    }

    async function selectGalleryItem(index) {
        const items = galleryItemsFor(galleryRecord);
        if (galleryTransitioning || index < 0 || index >= items.length || index === activeGalleryIndex) return;
        galleryTransitioning = true;
        galleryViewerMedia.getAnimations?.().forEach(animation => animation.cancel());
        galleryViewerMedia.style.opacity = "1";
        galleryViewerMedia.style.transform = "none";
        const outgoing = galleryViewerMedia.animate?.([
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(.985)" }
        ], { duration: 120, easing: "ease-out", fill: "forwards" });
        try { await outgoing?.finished; } catch (_) { /* Selection changed quickly. */ }
        outgoing?.cancel();
        renderExpandedGalleryItem(index);
        const incoming = galleryViewerMedia.animate?.([
            { opacity: 0, transform: "scale(1.015)" },
            { opacity: 1, transform: "scale(1)" }
        ], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" });
        try { await incoming?.finished; } catch (_) { /* Selection changed quickly. */ }
        incoming?.cancel();
        galleryViewerMedia.style.opacity = "1";
        galleryViewerMedia.style.transform = "none";
        galleryTransitioning = false;
    }

    async function closeGalleryViewer() {
        if (galleryViewer.hidden || galleryTransitioning) return;
        galleryTransitioning = true;
        // A late image decode must not replace the outgoing thumbnail proxy.
        activeGalleryLoadToken += 1;
        galleryViewerMedia.getAnimations?.().forEach(animation => animation.cancel());
        galleryViewerMedia.style.opacity = "1";
        galleryViewerMedia.style.transform = "none";
        activeGalleryVideo?.pause();
        const item = galleryItemsFor(galleryRecord)[activeGalleryIndex];
        const tile = galleryGrid.querySelector(`[data-gallery-index="${activeGalleryIndex}"]`);
        tile?.scrollIntoView({ block: "nearest", inline: "nearest" });
        await waitForAnimationFrames(2);

        let proxy = null;
        try {
            const target = tile?.getBoundingClientRect();
            const shared = createSharedMediaProxy(tile, item);
            proxy = shared.proxy;
            const from = containedMediaRect(item, shared.sourceVisual);
            galleryViewer.classList.add("is-shared-transitioning");
            galleryViewer.classList.remove("is-content-visible");
            galleryViewer.classList.remove("is-visible");
            if (target?.width && target?.height) await animateSharedMedia(proxy, from, target, false);
            else await new Promise(resolve => window.setTimeout(resolve, 420));
        } finally {
            proxy?.remove();
            hideGalleryViewerImmediately();
            tile?.focus({ preventScroll: true });
        }
    }

    function openGallery(record, initialIndex = null, sourceTile = null) {
        if (!galleryModal) return;
        galleryRecord = record;
        const items = galleryItemsFor(record);
        if (!items.length) return;
        hideGalleryViewerImmediately();
        galleryModalTitle.textContent = `${getLocation(record)} ${formatGalleryDate(record.date)} - Gallery`;
        galleryGrid.replaceChildren(...items.map((item, index) => {
            const tile = createGalleryTile(item, "performance-gallery-tile", index);
            tile.addEventListener("click", () => openGalleryViewer(index, tile));
            return tile;
        }));
        galleryModal.hidden = false;
        galleryModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("performance-gallery-open");
        requestAnimationFrame(() => galleryModal.classList.add("is-open"));
        if (Number.isInteger(initialIndex)) openGalleryViewer(initialIndex, sourceTile);
        else galleryModalClose.focus({ preventScroll: true });
    }

    function closeGallery() {
        if (!galleryModal || galleryModal.hidden) return;
        hideGalleryViewerImmediately();
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
    galleryViewerPrevious?.addEventListener("click", () => selectGalleryItem(activeGalleryIndex - 1));
    galleryViewerNext?.addEventListener("click", () => selectGalleryItem(activeGalleryIndex + 1));
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
        if (!galleryViewer?.hidden && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.preventDefault();
            const direction = event.key === "ArrowLeft" ? -1 : 1;
            selectGalleryItem(activeGalleryIndex + direction);
            return;
        }
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

    // Retire the old full-gallery caches so thumbnails cannot exhaust localStorage.
    try {
        localStorage.removeItem("kmc-public-performances-v2");
        localStorage.removeItem("kmc-shared-data-v2:performances");
    } catch (_) { /* Storage may be unavailable in private browsing. */ }
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
        const performancesRequest = window.KMCPerformanceList.list();
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
