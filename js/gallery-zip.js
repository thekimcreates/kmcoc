"use strict";

(() => {
    function galleryTitle(record) {
        const name = record.locationTbd ? "Location TBD"
            : record.locationName || record.location || "Location unavailable";
        let date = record.date || "Date TBD";
        if (record.date) {
            const parsed = new Date(`${record.date}T12:00:00`);
            if (!Number.isNaN(parsed.getTime())) {
                date = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", year: "numeric" }).format(parsed);
            }
        }
        return `${name} ${date} - Gallery`;
    }

    function safeName(value, fallback = "Gallery") {
        const name = String(value || "").normalize("NFC")
            .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-")
            .replace(/\s+/g, " ").replace(/^[. ]+|[. ]+$/g, "").slice(0, 180);
        return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name) ? fallback : name;
    }

    function uniqueName(item, index, used) {
        const mime = item.file?.type || item.mimeType || "";
        const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
            "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }[mime] || "bin";
        let name = safeName(item.name || item.path?.split("/").pop(), `File ${index + 1}.${extension}`);
        // Uploaded photos may have been converted to WebP while their original
        // display name still ends in .jpg. Match the actual stored media type.
        if (extension !== "bin") {
            const current = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
            if (current !== extension && !(extension === "jpg" && current === "jpeg")) {
                name = `${current ? name.slice(0, name.lastIndexOf(".")) : name}.${extension}`;
            }
        }
        const dot = name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const suffix = dot > 0 ? name.slice(dot) : "";
        let next = name, number = 2;
        while (used.has(next.toLowerCase())) next = `${stem} (${number++})${suffix}`;
        used.add(next.toLowerCase());
        return next;
    }

    function checkAbort(signal) {
        if (signal?.aborted) throw new DOMException("Download canceled.", "AbortError");
    }

    async function withTimeout(task, milliseconds, signal) {
        checkAbort(signal);
        let timer, cancel;
        try {
            return await Promise.race([
                Promise.resolve().then(task),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("The file request timed out. Please try again.")), milliseconds);
                    cancel = () => reject(new DOMException("Download canceled.", "AbortError"));
                    signal?.addEventListener("abort", cancel, { once: true });
                })
            ]);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
        }
    }

    async function fetchBytes(url, signal) {
        checkAbort(signal);
        const controller = new AbortController();
        const cancel = () => controller.abort();
        signal?.addEventListener("abort", cancel, { once: true });
        const timer = setTimeout(() => controller.abort(), 180000);
        try {
            const response = await fetch(url, { mode: "cors", credentials: "omit", signal: controller.signal });
            if (!response.ok) throw new Error(`The file could not be downloaded (${response.status}).`);
            const bytes = await response.arrayBuffer();
            checkAbort(signal);
            return bytes;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
        }
    }

    async function fileBytes(item, storage, signal) {
        if (item.file instanceof Blob) {
            const bytes = await item.file.arrayBuffer();
            checkAbort(signal);
            return bytes;
        }
        try {
            if (!item.url) throw new Error("The gallery file URL is missing.");
            return await fetchBytes(item.url, signal);
        } catch (error) {
            checkAbort(signal);
            if (!item.path || !storage) throw error;
            const url = await withTimeout(() => storage.ref(item.path).getDownloadURL(), 15000, signal);
            return fetchBytes(url, signal);
        }
    }

    async function create(items, { storage, signal, onProgress = () => {} } = {}) {
        checkAbort(signal);
        if (!items.length) throw new Error("This gallery has no files to download.");
        if (!window.JSZip) throw new Error("The ZIP download could not start. Refresh the page and try again.");
        if (items.length >= 65535) throw new Error("This gallery has too many files for one ZIP download.");
        const zip = new window.JSZip();
        const used = new Set();
        const total = items.length;
        let bytes = 0;
        onProgress({ processed: 0, total, percent: 0, phase: "files" });
        // Sequential transfers keep the browser responsive and avoid downloading
        // many large videos simultaneously. Original media quality is preserved.
        for (let index = 0; index < total; index++) {
            checkAbort(signal);
            const item = items[index];
            let data;
            try { data = await fileBytes(item, storage, signal); }
            catch (error) {
                checkAbort(signal);
                throw new Error(`Could not download “${item.name || `File ${index + 1}`}”. ${error.message}`);
            }
            bytes += data.byteLength;
            // JSZip writes classic ZIP offsets. Fail clearly instead of creating
            // an invalid archive if media plus its directory would exceed 4 GiB.
            if (bytes + total * 1024 + 65536 >= 0xffffffff) {
                throw new Error("This gallery is too large for one browser ZIP download (4 GB limit).");
            }
            zip.file(uniqueName(item, index, used), data, { binary: true, compression: "STORE" });
            onProgress({ processed: index + 1, total, percent: Math.floor((index + 1) / total * 90), phase: "files" });
        }
        const blob = await new Promise((resolve, reject) => {
            const stream = zip.generateInternalStream({ type: "uint8array", compression: "STORE", streamFiles: true });
            let chunks = [], settled = false;
            const finish = (error) => {
                if (settled) return;
                settled = true;
                stream.pause();
                signal?.removeEventListener("abort", cancel);
                try {
                    if (error) reject(error);
                    else resolve(new Blob(chunks, { type: "application/zip" }));
                } catch (failure) { reject(failure); }
                chunks = [];
            };
            const cancel = () => finish(new DOMException("Download canceled.", "AbortError"));
            signal?.addEventListener("abort", cancel, { once: true });
            stream.on("data", (chunk, metadata) => {
                if (settled) return;
                try {
                    checkAbort(signal);
                    chunks.push(chunk);
                    onProgress({ processed: total, total, percent: Math.min(99, 90 + Math.floor(metadata.percent * 0.09)), phase: "zip" });
                } catch (error) { finish(error); }
            });
            stream.on("error", finish);
            stream.on("end", () => finish());
            if (signal?.aborted) cancel();
            else stream.resume();
        });
        checkAbort(signal);
        return blob;
    }

    window.KMCGalleryZip = { create, galleryTitle, filename: record => `${safeName(galleryTitle(record))}.zip` };
})();
