"use strict";

let kmcPerformanceMap = null;
let kmcPerformanceMarker = null;
let kmcPerformanceAutocomplete = null;

window.initializeKmcPerformanceMap = function initializeKmcPerformanceMap() {
    const mapElement = document.getElementById("performance-location-map");
    const locationInput = document.getElementById("performance-location");
    const locationNameInput = document.getElementById("performance-location-name");
    const locationAddressInput = document.getElementById("performance-location-address");
    if (!mapElement || !locationInput || !locationNameInput || !locationAddressInput || !window.google?.maps?.places) return;

    kmcPerformanceMap = new google.maps.Map(mapElement, {
        center: { lat: 34.0522, lng: -118.2437 },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    kmcPerformanceMarker = new google.maps.Marker({ map: kmcPerformanceMap });
    kmcPerformanceAutocomplete = new google.maps.places.Autocomplete(locationInput, {
        fields: ["formatted_address", "geometry", "name", "place_id"]
    });

    kmcPerformanceAutocomplete.addListener("place_changed", () => {
        const place = kmcPerformanceAutocomplete.getPlace();
        if (!place.geometry?.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const locationName = place.name || place.formatted_address || locationInput.value.trim();
        const locationAddress = place.formatted_address || "";

        // Show only the venue/place name in the form and across the website.
        locationInput.value = locationName;
        locationNameInput.value = locationName;
        locationAddressInput.value = locationAddress;
        document.getElementById("performance-location-place-id").value = place.place_id || "";
        document.getElementById("performance-location-lat").value = String(lat);
        document.getElementById("performance-location-lng").value = String(lng);

        kmcPerformanceMap.setCenter({ lat, lng });
        kmcPerformanceMap.setZoom(16);
        kmcPerformanceMarker.setPosition({ lat, lng });
    });

    // If the administrator edits the text after choosing a suggestion,
    // clear the saved Google place details so an outdated address is not stored.
    locationInput.addEventListener("input", () => {
        if (locationInput.value === locationNameInput.value) return;
        locationNameInput.value = "";
        locationAddressInput.value = "";
        document.getElementById("performance-location-place-id").value = "";
        document.getElementById("performance-location-lat").value = "";
        document.getElementById("performance-location-lng").value = "";
    });
};

document.addEventListener("DOMContentLoaded", () => {
    const { auth, db, storage } = window.kmcFirebase || {};
    const tools = window.kmcAdminTools;
    const imageOptimizer = window.kmcImageOptimizer;
    const get = (id) => document.getElementById(id);

    const page = get("performances-admin");
    const loading = get("performances-loading");
    const email = get("admin-user-email");
    const logout = get("admin-logout");
    const form = get("performance-form");
    const formTitle = get("performance-form-title");
    const idInput = get("performance-id");
    const dateInput = get("performance-date");
    const timeInput = get("performance-time");
    const timezoneInput = get("performance-timezone");
    const timeTbd = get("performance-time-tbd");
    const locationInput = get("performance-location");
    const locationTbd = get("performance-location-tbd");
    const arrangementsTbd = get("performance-arrangements-tbd");
    const arrangementsList = get("performance-arrangements-list");
    const membersTbd = get("performance-members-tbd");
    const membersList = get("performance-members-list");
    const highlightInput = get("performance-highlight");
    const highlightTbd = get("performance-highlight-tbd");
    const highlightExisting = get("performance-highlight-existing");
    const highlightPreviewWrap = get("performance-highlight-preview-wrap");
    const highlightPreview = get("performance-highlight-preview");
    const highlightRemove = get("performance-highlight-remove");
    const galleryInput = get("performance-gallery");
    const galleryList = get("performance-gallery-list");
    const gallerySummary = get("performance-gallery-summary");
    const linksTbd = get("performance-links-tbd");
    const linksList = get("performance-links-list");
    const addLinkButton = get("performance-link-add");
    const submitButton = get("performance-submit");
    const cancelButton = get("performance-cancel");
    const status = get("performance-status");
    const list = get("performance-list");
    const empty = get("performance-empty");
    const count = get("performance-count");
    const modal = get("performance-modal");
    const modalDialog = modal?.querySelector(".performance-modal-dialog");
    const modalClose = get("performance-modal-close");
    const addPerformanceButton = get("performance-add-button");
    let modalCloseTimer = null;
    let lastModalTrigger = null;

    let unsubscribePerformances = null;
    let performanceRecords = [];
    let memberRecords = [];
    let arrangementRecords = [];
    let previewObjectUrl = "";
    let removeExistingHighlight = false;
    let galleryItems = [];
    let pendingGalleryFiles = [];
    let galleryPathsToDelete = [];
    const thumbnailRepairAttempted = new Set();
    let thumbnailRepairRunning = false;

    const returnToLogin = () => location.replace("login.html");
    if (!auth || !db || !storage) {
        returnToLogin();
        return;
    }

    function setStatus(message = "", type = "") {
        status.textContent = message;
        status.className = "login-status";
        if (type) status.classList.add(`is-${type}`);
    }

    function setGroupDisabled(containerId, disabled) {
        const container = get(containerId);
        if (!container) return;
        container.classList.toggle("fieldset-disabled", disabled);
        container.querySelectorAll("input, select, button").forEach((field) => {
            field.disabled = disabled;
        });
    }

    function syncTbdStates() {
        timeInput.disabled = timeTbd.checked;
        timezoneInput.disabled = timeTbd.checked;
        setGroupDisabled("performance-location-fields", locationTbd.checked);
        setGroupDisabled("performance-arrangement-fields", arrangementsTbd.checked);
        setGroupDisabled("performance-member-fields", membersTbd.checked);
        setGroupDisabled("performance-highlight-fields", highlightTbd.checked);
        setGroupDisabled("performance-links-fields", linksTbd.checked);
    }

    function selectedValues(name) {
        return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
    }

    function arrangementLabel(arrangement) {
        return `${arrangement.name || "Arrangement"} ${arrangement.koreanName || ""}`.trim();
    }

    function getRecordArrangementIds(record) {
        if (Array.isArray(record.arrangementIds)) return record.arrangementIds;
        const legacyNames = Array.isArray(record.arrangements) ? record.arrangements : [];
        return arrangementRecords
            .filter((arrangement) => legacyNames.includes(arrangementLabel(arrangement)))
            .map((arrangement) => arrangement.id);
    }

    function getRecordArrangementLabels(record) {
        if (record.arrangementsTbd) return [];
        const ids = getRecordArrangementIds(record);
        const resolved = ids.map((id) => arrangementRecords.find((item) => item.id === id))
            .filter(Boolean)
            .map(arrangementLabel);
        if (resolved.length) return resolved;
        return Array.isArray(record.arrangements) ? record.arrangements : [];
    }

    function renderArrangementOptions(selectedIds = []) {
        arrangementsList.replaceChildren();
        if (!arrangementRecords.length) {
            const message = document.createElement("p");
            message.className = "admin-help-text";
            message.textContent = "No arrangements were found. Add one on the Admin Arrangements page.";
            arrangementsList.appendChild(message);
            return;
        }
        arrangementRecords.forEach((arrangement) => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = "arrangements";
            checkbox.value = arrangement.id;
            checkbox.checked = selectedIds.includes(arrangement.id);
            const span = document.createElement("span");
            span.textContent = arrangementLabel(arrangement);
            label.append(checkbox, span);
            arrangementsList.appendChild(label);
        });
    }

    async function loadArrangements() {
        try {
            const snapshot = await db.collection("siteContent").doc("arrangements").get();
            const data = snapshot.exists ? snapshot.data() : {};
            arrangementRecords = Array.isArray(data.arrangements)
                ? [...data.arrangements].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                : [];
        } catch (error) {
            console.error("Unable to load arrangements:", error);
            arrangementRecords = [];
        }
        renderArrangementOptions();
    }

    function externalLinks() {
        return [...linksList.querySelectorAll(".external-link-row")].map((row) => ({
            label: row.querySelector('[data-field="label"]').value.trim(),
            url: row.querySelector('[data-field="url"]').value.trim()
        })).filter((link) => link.label || link.url);
    }

    function addExternalLink(link = {}) {
        const row = document.createElement("div");
        row.className = "external-link-row";
        row.innerHTML = `
            <input data-field="label" type="text" maxlength="80" placeholder="Link name" value="${escapeAttribute(link.label || "")}">
            <input data-field="url" type="url" maxlength="500" placeholder="https://..." value="${escapeAttribute(link.url || "")}">
            <button class="admin-danger-button admin-small-button" type="button">Remove</button>
        `;
        row.querySelector("button").addEventListener("click", () => row.remove());
        linksList.appendChild(row);
    }

    function escapeAttribute(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }

    function getRecordMemberIds(record) {
        if (Array.isArray(record.memberIds)) return record.memberIds;
        const legacyNames = Array.isArray(record.members) ? record.members : [];
        return memberRecords.filter(member => legacyNames.includes(member.name)).map(member => member.id);
    }

    function renderMembers(selected = []) {
        membersList.replaceChildren();
        if (!memberRecords.length) {
            const message = document.createElement("p");
            message.className = "admin-help-text";
            message.textContent = "No members were found. Add members on the Admin Team page.";
            membersList.appendChild(message);
            return;
        }
        const selectedIds = selected.map(String);
        memberRecords.forEach((member) => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = "members";
            checkbox.value = member.id;
            checkbox.checked = selectedIds.includes(member.id) || selectedIds.includes(member.name);
            const span = document.createElement("span");
            span.textContent = member.name;
            label.append(checkbox, span);
            membersList.appendChild(label);
        });
    }

    async function loadMembers() {
        try {
            const snapshot = await db.collection("siteContent").doc("team").get();
            const data = snapshot.exists ? snapshot.data() : {};
            memberRecords = Array.isArray(data.members) ? [...data.members].sort((a,b)=>(a.order??0)-(b.order??0)).map((member,index)=>({ ...member, id:member.id || `legacy-member-${index}` })) : [];
        } catch (error) {
            console.error("Unable to load members:", error);
            memberRecords = [];
        }
        renderMembers();
    }

    function clearPreview() {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
        highlightPreview.removeAttribute("src");
        highlightPreviewWrap.hidden = true;
    }

    function showPreview(src) {
        highlightPreview.src = src;
        highlightPreviewWrap.hidden = false;
    }

    function isVideoFile(file) {
        return file?.type === "video" || /^video\//i.test(file?.type || file?.mimeType || "") || /\.(mp4|mov|webm)$/i.test(file?.name || file?.url || "");
    }

    function sortGalleryItems(items) {
        return items
            .map((item, index) => ({ item, index }))
            .sort((a, b) => {
                const videoOrder = Number(isVideoFile(b.item)) - Number(isVideoFile(a.item));
                if (videoOrder) return videoOrder;
                const nameOrder = String(a.item.name || "").localeCompare(String(b.item.name || ""), undefined, {
                    numeric: true,
                    sensitivity: "base"
                });
                return nameOrder || a.index - b.index;
            })
            .map(({ item }) => item);
    }

    function getVideoDuration(file) {
        return new Promise((resolve) => {
            const video = document.createElement("video");
            const url = URL.createObjectURL(file);
            let settled = false;
            const finish = (duration = 0) => {
                if (settled) return;
                settled = true;
                URL.revokeObjectURL(url);
                resolve(Number.isFinite(duration) ? Math.round(duration) : 0);
            };
            video.preload = "metadata";
            video.onloadedmetadata = () => finish(video.duration);
            video.onerror = () => finish();
            video.src = url;
            window.setTimeout(() => finish(), 5000);
        });
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise((resolve) => {
            try {
                canvas.toBlob((blob) => resolve(blob || null), type, quality);
            } catch (_) {
                resolve(null);
            }
        });
    }

    async function exportGalleryThumbnail(canvas) {
        let blob = await canvasToBlob(canvas, "image/webp", 0.68);
        if (blob?.size && blob.type === "image/webp") {
            return { blob, extension: "webp", contentType: "image/webp", width: canvas.width, height: canvas.height };
        }
        blob = await canvasToBlob(canvas, "image/jpeg", 0.72);
        if (!blob?.size) throw new Error("A preview image could not be created for this video.");
        return { blob, extension: "jpg", contentType: "image/jpeg", width: canvas.width, height: canvas.height };
    }

    function createVideoThumbnail(source) {
        return new Promise((resolve, reject) => {
            const video = document.createElement("video");
            const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
            let settled = false;
            const cleanup = () => {
                video.pause();
                video.removeAttribute("src");
                video.load();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
            };
            const finish = (error, result) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeout);
                cleanup();
                if (error) reject(error);
                else resolve(result);
            };
            const capture = async () => {
                try {
                    const sourceWidth = video.videoWidth;
                    const sourceHeight = video.videoHeight;
                    if (!sourceWidth || !sourceHeight) throw new Error("The first video frame could not be read.");
                    const scale = Math.min(1, 480 / sourceWidth, 480 / sourceHeight);
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
                    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
                    const context = canvas.getContext("2d", { alpha: false });
                    if (!context) throw new Error("Video previews are not supported by this browser.");
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const exported = await exportGalleryThumbnail(canvas);
                    canvas.width = 1;
                    canvas.height = 1;
                    finish(null, exported);
                } catch (error) {
                    finish(error);
                }
            };
            const seekOrCapture = () => {
                const target = Number.isFinite(video.duration) && video.duration > 0.08
                    ? Math.min(0.08, video.duration / 10)
                    : 0;
                if (!target) return capture();
                video.addEventListener("seeked", capture, { once: true });
                try {
                    video.currentTime = target;
                } catch (_) {
                    capture();
                }
            };
            const timeout = window.setTimeout(() => finish(new Error("The video preview took too long to prepare.")), 20000);
            video.muted = true;
            video.playsInline = true;
            video.preload = "auto";
            if (!objectUrl) video.crossOrigin = "anonymous";
            video.addEventListener("loadeddata", seekOrCapture, { once: true });
            video.addEventListener("error", () => finish(new Error("This video could not be opened to create its first-frame preview.")), { once: true });
            video.src = objectUrl || String(source || "");
            video.load();
        });
    }

    async function createImageThumbnail(source) {
        if (!imageOptimizer) throw new Error("The image optimizer could not be loaded. Refresh the page and try again.");
        let blob = source;
        if (typeof source === "string") {
            const response = await fetch(source);
            if (!response.ok) throw new Error("An existing gallery photo could not be downloaded to create its preview.");
            blob = await response.blob();
        }
        return imageOptimizer.optimize(blob, {
            maxWidth: 480,
            maxHeight: 480,
            quality: 0.66,
            jpegQuality: 0.7,
            maxInputBytes: 500 * 1024 * 1024
        });
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("The gallery preview could not be saved."));
            reader.readAsDataURL(blob);
        });
    }

    async function createInlineGalleryThumbnail(thumbnail) {
        try {
            const compact = await imageOptimizer.optimize(thumbnail.blob, {
                maxWidth: 160,
                maxHeight: 160,
                quality: 0.45,
                jpegQuality: 0.5,
                maxInputBytes: 500 * 1024 * 1024
            });
            return blobToDataUrl(compact.blob);
        } catch (error) {
            console.warn("The gallery preview could not be compressed further; using the prepared preview:", error);
            return blobToDataUrl(thumbnail.blob);
        }
    }

    async function createExistingGalleryThumbnail(item) {
        const savedPreview = item.thumbnailUrl || item.thumbnailURL || item.thumbUrl || item.previewUrl || "";
        if (savedPreview) {
            try {
                return await createImageThumbnail(savedPreview);
            } catch (error) {
                console.warn("The old gallery preview could not be recovered; rebuilding it from the original media:", error);
            }
        }
        return isVideoFile(item)
            ? createVideoThumbnail(item.url)
            : createImageThumbnail(item.url);
    }

    async function uploadGalleryThumbnail(documentId, thumbnail, token) {
        // Keep a tiny preview directly with the gallery record. This remains
        // available even if an older Firebase Storage preview URL expires or
        // the site's Storage rules have not yet been updated.
        const thumbnailDataUrl = await createInlineGalleryThumbnail(thumbnail);
        const path = `performance-highlights/${documentId}/gallery-thumb-${Date.now()}-${token}.${thumbnail.extension}`;
        const result = {
            thumbnailDataUrl,
            thumbnailWidth: Number(thumbnail.width) || 0,
            thumbnailHeight: Number(thumbnail.height) || 0
        };
        try {
            const snapshot = await storage.ref(path).put(thumbnail.blob, {
                contentType: thumbnail.contentType,
                cacheControl: "public,max-age=31536000,immutable"
            });
            result.thumbnailUrl = await snapshot.ref.getDownloadURL();
            result.thumbnailPath = path;
        } catch (error) {
            console.warn("The Storage copy of this gallery preview could not be saved; using the embedded lightweight preview instead:", error);
        }
        return result;
    }

    async function ensureGalleryThumbnails(documentId, items) {
        const nextItems = new Array(items.length);
        let nextIndex = 0;
        let completed = 0;

        async function prepareNext() {
            const index = nextIndex++;
            if (index >= items.length) return;
            const item = items[index];
            if (item.thumbnailDataUrl) {
                nextItems[index] = item;
            } else {
                try {
                    setStatus(`Preparing gallery previews… ${completed} of ${items.length} complete`);
                    const thumbnail = await createExistingGalleryThumbnail(item);
                    const uploaded = await uploadGalleryThumbnail(documentId, thumbnail, `existing-${index}`);
                    nextItems[index] = { ...item, ...uploaded };
                } catch (error) {
                    console.warn(`Unable to create a preview for ${item.name || "gallery item"}:`, error);
                    nextItems[index] = item;
                }
            }
            completed += 1;
            await prepareNext();
        }

        const workerCount = Math.min(3, items.length);
        await Promise.all(Array.from({ length: workerCount }, () => prepareNext()));
        return nextItems;
    }

    async function repairMissingGalleryThumbnails(records) {
        if (thumbnailRepairRunning) return;
        thumbnailRepairRunning = true;
        try {
            for (const record of records) {
                const items = Array.isArray(record.galleryItems) ? record.galleryItems : [];
                const needsRepair = items.some(item => item?.url && !item.thumbnailDataUrl);
                if (!record.id || !needsRepair || thumbnailRepairAttempted.has(record.id)) continue;
                thumbnailRepairAttempted.add(record.id);
                const repaired = await ensureGalleryThumbnails(record.id, items);
                const repairedCount = repaired.filter(item => item.thumbnailDataUrl).length;
                const originalCount = items.filter(item => item.thumbnailDataUrl).length;
                if (repairedCount > originalCount) {
                    await db.collection("performances").doc(record.id).update({
                        galleryItems: sortGalleryItems(repaired),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        } catch (error) {
            console.warn("Unable to finish repairing gallery previews:", error);
        } finally {
            thumbnailRepairRunning = false;
        }
    }

    function renderGalleryFiles() {
        const items = sortGalleryItems([
            ...galleryItems.map((item, index) => ({ ...item, source: "saved", index })),
            ...pendingGalleryFiles.map((item, index) => ({ ...item, source: "pending", index }))
        ]);
        const photos = items.filter(item => !isVideoFile(item)).length;
        const videos = items.length - photos;
        gallerySummary.textContent = items.length
            ? `${items.length} item${items.length === 1 ? "" : "s"} · ${photos} photo${photos === 1 ? "" : "s"} · ${videos} video${videos === 1 ? "" : "s"}`
            : "No gallery items selected.";
        galleryList.replaceChildren();
        items.forEach(item => {
            const row = document.createElement("li");
            row.className = "performance-gallery-admin-item";
            const name = document.createElement("span");
            name.textContent = `${isVideoFile(item) ? "Video" : "Photo"} · ${item.name || "Untitled file"}`;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "admin-danger-button admin-small-button";
            remove.textContent = "Delete";
            remove.addEventListener("click", () => {
                if (item.source === "saved") {
                    const removed = galleryItems.splice(item.index, 1)[0];
                    if (removed?.path) galleryPathsToDelete.push(removed.path);
                    if (removed?.thumbnailPath) galleryPathsToDelete.push(removed.thumbnailPath);
                } else {
                    pendingGalleryFiles.splice(item.index, 1);
                }
                renderGalleryFiles();
            });
            row.append(name, remove);
            galleryList.appendChild(row);
        });
    }

    function openPerformanceModal(trigger = null) {
        if (!modal) return;

        window.clearTimeout(modalCloseTimer);
        lastModalTrigger = trigger || document.activeElement;
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("performance-modal-open");

        requestAnimationFrame(() => {
            modal.classList.remove("is-closing");
            modal.classList.add("is-open");

            window.setTimeout(() => {
                if (window.google?.maps && kmcPerformanceMap) {
                    google.maps.event.trigger(kmcPerformanceMap, "resize");

                    const lat = Number(get("performance-location-lat").value);
                    const lng = Number(get("performance-location-lng").value);

                    if (Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) {
                        kmcPerformanceMap.setCenter({ lat, lng });
                    }
                }

                dateInput.focus({ preventScroll: true });
            }, 140);
        });
    }

    function closePerformanceModal() {
        if (!modal || modal.hidden) return;

        modal.classList.remove("is-open");
        modal.classList.add("is-closing");
        document.body.classList.remove("performance-modal-open");

        modalCloseTimer = window.setTimeout(() => {
            modal.hidden = true;
            modal.classList.remove("is-closing");
            modal.setAttribute("aria-hidden", "true");

            if (lastModalTrigger && typeof lastModalTrigger.focus === "function") {
                lastModalTrigger.focus({ preventScroll: true });
            }
        }, 360);
    }

    function trapModalFocus(event) {
        if (!modalDialog || modal.hidden) return;

        if (event.key === "Escape") {
            event.preventDefault();
            closePerformanceModal();
            return;
        }

        if (event.key !== "Tab") return;

        const focusable = [...modalDialog.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
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

    function resetForm() {
        form.reset();
        idInput.value = "";
        highlightExisting.value = "";
        get("performance-location-name").value = "";
        get("performance-location-address").value = "";
        get("performance-location-place-id").value = "";
        get("performance-location-lat").value = "";
        get("performance-location-lng").value = "";
        removeExistingHighlight = false;
        galleryItems = [];
        pendingGalleryFiles = [];
        galleryPathsToDelete = [];
        galleryInput.value = "";
        renderGalleryFiles();
        clearPreview();
        linksList.replaceChildren();
        addExternalLink();
        renderMembers();
        renderArrangementOptions();
        formTitle.textContent = "Add Performance";
        submitButton.textContent = "Add Performance";
        cancelButton.hidden = true;
        setStatus();
        syncTbdStates();
    }

    function formatDate(dateValue) {
        if (!dateValue) return "Date unavailable";
        const date = new Date(`${dateValue}T12:00:00`);
        if (Number.isNaN(date.getTime())) return dateValue;
        return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
    }

    function formatTime(record) {
        if (record.timeTbd) return "Time TBD";
        if (!record.time) return "Time unavailable";
        const [hour, minute] = record.time.split(":").map(Number);
        const date = new Date(2000, 0, 1, hour, minute);
        return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
    }

    function createPerformanceCard(record) {
        const article = document.createElement("article");
        article.className = "performance-admin-card";

        const main = document.createElement("div");
        main.className = "performance-admin-card-main";

        if (record.highlightPhotoUrl) {
            const image = document.createElement("img");
            image.loading = "lazy";
            image.decoding = "async";
            image.className = "performance-admin-photo";
            image.src = record.highlightPhotoUrl;
            image.alt = "";
            main.appendChild(image);
        }

        const content = document.createElement("div");
        content.className = "performance-admin-card-content";
        const date = document.createElement("p");
        date.className = "performance-admin-date";
        date.textContent = `${formatDate(record.date)} · ${formatTime(record)}`;
        const location = document.createElement("h3");
        location.textContent = record.locationTbd
            ? "Location TBD"
            : record.locationName || record.location || "Location unavailable";
        const arrangements = document.createElement("p");
        arrangements.className = "performance-admin-arrangements";
        const arrangementLabels = getRecordArrangementLabels(record);
        arrangements.textContent = record.arrangementsTbd ? "Arrangements TBD" : (arrangementLabels.join(" · ") || "No arrangements selected");
        content.append(date, location, arrangements);
        main.appendChild(content);

        const actions = document.createElement("div");
        actions.className = "performance-card-actions";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "admin-secondary-button admin-small-button";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => beginEdit(record));
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "admin-danger-button admin-small-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => deletePerformance(record));
        actions.append(editButton, deleteButton);
        article.append(main, actions);
        return article;
    }

    function renderPerformances() {
        list.replaceChildren();
        count.textContent = String(performanceRecords.length);
        empty.hidden = performanceRecords.length !== 0;
        performanceRecords.forEach((record) => list.appendChild(createPerformanceCard(record)));
    }

    function beginEdit(record) {
        resetForm();
        idInput.value = record.id;
        dateInput.value = record.date;
        timeInput.value = record.time || "";
        timezoneInput.value = record.timezone || "America/Los_Angeles";
        timeTbd.checked = Boolean(record.timeTbd);
        locationTbd.checked = Boolean(record.locationTbd);
        const savedLocationName = record.locationName || record.location || "";
        locationInput.value = savedLocationName;
        get("performance-location-name").value = savedLocationName;
        get("performance-location-address").value = record.locationAddress || "";
        get("performance-location-place-id").value = record.locationPlaceId || "";
        get("performance-location-lat").value = record.locationLat ?? "";
        get("performance-location-lng").value = record.locationLng ?? "";
        arrangementsTbd.checked = Boolean(record.arrangementsTbd);
        membersTbd.checked = Boolean(record.membersTbd);
        highlightTbd.checked = Boolean(record.highlightTbd);
        linksTbd.checked = Boolean(record.linksTbd);

        renderArrangementOptions(getRecordArrangementIds(record));
        renderMembers(getRecordMemberIds(record));

        highlightExisting.value = record.highlightPhotoUrl || "";
        if (record.highlightPhotoUrl) showPreview(record.highlightPhotoUrl);

        galleryItems = Array.isArray(record.galleryItems) ? record.galleryItems.map(item => ({ ...item })) : [];
        pendingGalleryFiles = [];
        galleryPathsToDelete = [];
        galleryInput.value = "";
        renderGalleryFiles();

        linksList.replaceChildren();
        (record.externalLinks?.length ? record.externalLinks : [{}]).forEach(addExternalLink);

        if (kmcPerformanceMap && record.locationLat && record.locationLng) {
            const position = { lat: Number(record.locationLat), lng: Number(record.locationLng) };
            kmcPerformanceMap.setCenter(position);
            kmcPerformanceMap.setZoom(16);
            kmcPerformanceMarker.setPosition(position);
        }

        syncTbdStates();
        formTitle.textContent = "Edit Performance";
        submitButton.textContent = "Save Changes";
        cancelButton.hidden = false;
        setStatus();
        openPerformanceModal();
    }

    async function deletePerformance(record) {
        const label = `${formatDate(record.date)} performance`;
        if (!await tools.confirmAction({ title:"Delete performance?", message:`Delete the ${label}? You can undo this for a few seconds.`, confirmText:"Delete" })) return;
        try {
            await db.collection("performances").doc(record.id).delete();
            if (idInput.value === record.id) resetForm();
            await tools.logActivity(db, auth, "Deleted", "performance", record.id, label);
            tools.showUndo(`${label} deleted.`, async () => {
                const restored = { ...record }; delete restored.id;
                await db.collection("performances").doc(record.id).set(restored);
                await tools.logActivity(db, auth, "Restored", "performance", record.id, label);
            }, { onExpire: () => Promise.all([
                tools.deleteStoragePath(storage, record.highlightPhotoPath),
                ...(Array.isArray(record.galleryItems)
                    ? record.galleryItems.flatMap(item => [item.path, item.thumbnailPath]).filter(Boolean).map(path => tools.deleteStoragePath(storage, path))
                    : [])
            ]) });
        } catch (error) {
            console.error("Unable to delete performance:", error);
            setStatus("The performance could not be deleted.", "error");
        }
    }

    function subscribeToPerformances() {
        unsubscribePerformances = db.collection("performances").orderBy("date", "desc").onSnapshot((snapshot) => {
            performanceRecords = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
            renderPerformances();
            repairMissingGalleryThumbnails(performanceRecords);
        }, (error) => {
            console.error("Unable to load performances:", error);
            empty.hidden = false;
            empty.textContent = "Performances could not be loaded.";
        });
    }

    async function uploadHighlight(documentId) {
        const file = highlightInput.files[0];
        if (!file) return null;
        if (!imageOptimizer) throw new Error("The image optimizer could not be loaded. Refresh the page and try again.");
        setStatus("Optimizing highlight image…");
        const optimized = await imageOptimizer.optimize(file, {
            maxWidth: 1800,
            maxHeight: 1350,
            quality: 0.82
        });
        setStatus(`Uploading optimized image (${imageOptimizer.formatBytes(optimized.optimizedBytes)})…`);
        const path = `performance-highlights/${documentId}/${Date.now()}-${optimized.fileName}`;
        const snapshot = await storage.ref(path).put(optimized.blob, {
            contentType: optimized.contentType,
            customMetadata: {
                originalBytes: String(optimized.originalBytes),
                optimizedBytes: String(optimized.optimizedBytes),
                optimizedWidth: String(optimized.width),
                optimizedHeight: String(optimized.height)
            }
        });
        return { url: await snapshot.ref.getDownloadURL(), path, optimization: optimized };
    }

    async function uploadGalleryFiles(documentId) {
        const queue = [...pendingGalleryFiles];
        const uploaded = new Array(queue.length);
        let nextIndex = 0;
        let completed = 0;

        async function uploadNext() {
            const index = nextIndex++;
            if (index >= queue.length) return;
            const entry = queue[index];
            const file = entry.file;
            const video = entry.type === "video";
            let blob = file;
            let fileName = file.name;
            let mimeType = file.type || (video ? "video/mp4" : "image/jpeg");
            if (!video) {
                if (!imageOptimizer) throw new Error("The image optimizer could not be loaded. Refresh the page and try again.");
                setStatus(`Preparing gallery files… ${completed} of ${queue.length} complete`);
                const optimized = await imageOptimizer.optimize(file, {
                    maxWidth: 2000,
                    maxHeight: 2000,
                    quality: 0.84,
                    maxInputBytes: 500 * 1024 * 1024
                });
                blob = optimized.blob;
                fileName = optimized.fileName;
                mimeType = optimized.contentType;
            } else {
                setStatus(`Uploading gallery files… ${completed} of ${queue.length} complete`);
            }
            // Gallery assets share the approved performance-highlights prefix.
            // The site's current Firebase Storage policy already allows admins to
            // write there, while a new top-level performance-gallery prefix is
            // denied by that policy.
            const path = `performance-highlights/${documentId}/gallery-${Date.now()}-${index}-${fileName}`;
            const assetUpload = storage.ref(path).put(blob, {
                contentType: mimeType,
                cacheControl: "public,max-age=31536000,immutable"
            });
            const thumbnailUpload = (video ? createVideoThumbnail(file) : createImageThumbnail(blob))
                .then(thumbnail => uploadGalleryThumbnail(documentId, thumbnail, `new-${index}`));
            const [snapshot, thumbnail] = await Promise.all([assetUpload, thumbnailUpload]);
            uploaded[index] = {
                id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                url: await snapshot.ref.getDownloadURL(),
                path,
                ...thumbnail,
                name: file.name,
                type: video ? "video" : "image",
                mimeType,
                duration: video ? entry.duration || 0 : 0
            };
            completed += 1;
            setStatus(`Uploading gallery files… ${completed} of ${queue.length} complete`);
            await uploadNext();
        }

        const workerCount = Math.min(4, queue.length);
        await Promise.all(Array.from({ length: workerCount }, () => uploadNext()));
        return uploaded;
    }

    auth.onAuthStateChanged(async (user) => {
        if (!user) return returnToLogin();
        try {
            if (!await tools.verifyAdmin(auth, db, user)) {
                await tools.signOut(auth);
                return returnToLogin();
            }
            email.textContent = user.email || "Administrator";
            await Promise.all([loadMembers(), loadArrangements()]);
            loading.hidden = true;
            page.hidden = false;
            subscribeToPerformances();
            resetForm();
        } catch (error) {
            console.error("Unable to verify administrator:", error);
            loading.textContent = "Unable to verify administrator access. Check your connection and refresh.";
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const documentId = idInput.value;
        const arrangementIds = selectedValues("arrangements");
        const arrangementNames = arrangementIds
            .map((id) => arrangementRecords.find((item) => item.id === id))
            .filter(Boolean)
            .map(arrangementLabel);
        const memberIds = selectedValues("members");
        const members = memberIds.map(id => memberRecords.find(member => member.id === id)).filter(Boolean).map(member => member.name);
        const links = externalLinks();

        if (!dateInput.value) return setStatus("Enter a date.", "error");
        if (!timeTbd.checked && !timeInput.value) return setStatus("Enter a time or select Time is TBD.", "error");
        if (!locationTbd.checked && !locationInput.value.trim()) return setStatus("Choose a location or select Location is TBD.", "error");
        if (!locationTbd.checked && !get("performance-location-name").value.trim()) {
            return setStatus("Choose a location from the Google Maps suggestions.", "error");
        }
        if (!arrangementsTbd.checked && arrangementIds.length === 0) return setStatus("Select an arrangement or choose TBD.", "error");
        if (!membersTbd.checked && memberIds.length === 0) return setStatus("Select attending members or choose TBD.", "error");
        if (!highlightTbd.checked && !highlightInput.files[0] && !highlightExisting.value) return setStatus("Upload a highlight photo or choose TBD.", "error");
        if (!linksTbd.checked && links.some((link) => !link.label || !link.url)) return setStatus("Each external link needs both a name and URL.", "error");

        submitButton.disabled = true;
        cancelButton.disabled = true;
        setStatus(documentId ? "Saving changes…" : "Adding performance…");

        try {
            const reference = documentId
                ? db.collection("performances").doc(documentId)
                : db.collection("performances").doc();
            const oldRecord = performanceRecords.find((record) => record.id === documentId) || {};

            let highlightPhotoUrl = highlightTbd.checked ? "" : highlightExisting.value;
            let highlightPhotoPath = highlightTbd.checked ? "" : oldRecord.highlightPhotoPath || "";
            let imageOptimization = null;

            const pathToDeleteAfterSave = (highlightTbd.checked || removeExistingHighlight) ? oldRecord.highlightPhotoPath || "" : "";
            if (highlightTbd.checked || removeExistingHighlight) {
                highlightPhotoUrl = "";
                highlightPhotoPath = "";
            }

            if (!highlightTbd.checked && highlightInput.files[0]) {
                const uploaded = await uploadHighlight(reference.id, oldRecord.highlightPhotoPath || "");
                highlightPhotoUrl = uploaded.url;
                highlightPhotoPath = uploaded.path;
                imageOptimization = uploaded.optimization || null;
                if (oldRecord.highlightPhotoPath && oldRecord.highlightPhotoPath !== uploaded.path) await tools.deleteStoragePath(storage, oldRecord.highlightPhotoPath);
            }

            const uploadedGallery = await uploadGalleryFiles(reference.id);
            const savedGallery = Array.isArray(galleryItems) ? galleryItems : [];
            const nextGalleryItems = sortGalleryItems(await ensureGalleryThumbnails(reference.id, [...savedGallery, ...uploadedGallery]));

            const data = {
                date: dateInput.value,
                time: timeTbd.checked ? "" : timeInput.value,
                timeTbd: timeTbd.checked,
                timezone: timeTbd.checked ? "" : timezoneInput.value,
                // Keep the legacy location field for older pages, but store the
                // place name and full address separately from now on.
                location: locationTbd.checked ? "" : get("performance-location-name").value.trim(),
                locationName: locationTbd.checked ? "" : get("performance-location-name").value.trim(),
                locationAddress: locationTbd.checked ? "" : get("performance-location-address").value.trim(),
                locationTbd: locationTbd.checked,
                locationPlaceId: locationTbd.checked ? "" : get("performance-location-place-id").value,
                locationLat: locationTbd.checked ? null : Number(get("performance-location-lat").value) || null,
                locationLng: locationTbd.checked ? null : Number(get("performance-location-lng").value) || null,
                arrangementIds: arrangementsTbd.checked ? [] : arrangementIds,
                // Keep a readable snapshot for backwards compatibility; public pages resolve IDs first.
                arrangements: arrangementsTbd.checked ? [] : arrangementNames,
                arrangementsTbd: arrangementsTbd.checked,
                memberIds: membersTbd.checked ? [] : memberIds,
                members: membersTbd.checked ? [] : members,
                membersTbd: membersTbd.checked,
                highlightPhotoUrl,
                highlightPhotoPath,
                highlightTbd: highlightTbd.checked,
                galleryItems: nextGalleryItems,
                externalLinks: linksTbd.checked ? [] : links,
                linksTbd: linksTbd.checked,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (documentId) {
                await reference.update(data);
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await reference.set(data);
            }
            if (pathToDeleteAfterSave) await tools.deleteStoragePath(storage, pathToDeleteAfterSave);
            await Promise.all(galleryPathsToDelete.map(path => tools.deleteStoragePath(storage, path)));
            await tools.logActivity(db, auth, documentId ? "Updated" : "Created", "performance", reference.id, `${formatDate(data.date)} performance`);

            resetForm();
            const savedMessage = documentId ? "Performance updated successfully." : "Performance added successfully.";
            setStatus(imageOptimization ? `${savedMessage} ${imageOptimizer.summary(imageOptimization)}` : savedMessage, "success");
            closePerformanceModal();
        } catch (error) {
            console.error("Unable to save performance:", error);
            setStatus(error.message || "The performance could not be saved.", "error");
        } finally {
            submitButton.disabled = false;
            cancelButton.disabled = false;
        }
    });

    [timeTbd, locationTbd, arrangementsTbd, membersTbd, highlightTbd, linksTbd]
        .forEach((checkbox) => checkbox.addEventListener("change", syncTbdStates));

    highlightInput.addEventListener("change", () => {
        const file = highlightInput.files[0];
        if (!file) return;
        clearPreview();
        previewObjectUrl = URL.createObjectURL(file);
        showPreview(previewObjectUrl);
        removeExistingHighlight = false;
    });

    highlightRemove.addEventListener("click", () => {
        highlightInput.value = "";
        highlightExisting.value = "";
        removeExistingHighlight = true;
        clearPreview();
    });

    galleryInput.addEventListener("change", async () => {
        const selected = [...galleryInput.files];
        galleryInput.value = "";
        const accepted = selected.filter(file => file.size <= 500 * 1024 * 1024);
        if (accepted.length !== selected.length) setStatus("Files larger than 500 MB were not added to the gallery.", "error");
        const next = await Promise.all(accepted.map(async file => ({
            file,
            name: file.name,
            type: isVideoFile(file) ? "video" : "image",
            duration: isVideoFile(file) ? await getVideoDuration(file) : 0
        })));
        pendingGalleryFiles.push(...next);
        renderGalleryFiles();
    });

    addLinkButton.addEventListener("click", () => addExternalLink());

    addPerformanceButton?.addEventListener("click", () => {
        resetForm();
        openPerformanceModal(addPerformanceButton);
    });

    modalClose?.addEventListener("click", closePerformanceModal);
    modal?.addEventListener("keydown", trapModalFocus);

    // Keep backdrop clicks from closing the editor.
    modal?.querySelector(".performance-modal-backdrop")?.addEventListener("click", (event) => {
        event.preventDefault();
    });

    cancelButton.addEventListener("click", () => {
        resetForm();
        closePerformanceModal();
    });
    logout.addEventListener("click", async () => {
        logout.disabled = true;
        if (unsubscribePerformances) unsubscribePerformances();
        await tools.signOut(auth);
        returnToLogin();
    });
    window.addEventListener("beforeunload", () => {
        if (unsubscribePerformances) unsubscribePerformances();
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    });
});
