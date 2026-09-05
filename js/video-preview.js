"use strict";

// Shared by the public gallery and admin uploader so repaired/new records use
// the same first-frame recovery path. Only the compressed still is retained.
(() => {
    function withTimeout(task, milliseconds) {
        let timer;
        return Promise.race([
            Promise.resolve().then(task),
            new Promise((_, reject) => {
                timer = window.setTimeout(() => reject(new Error("Video preview request timed out.")), milliseconds);
            })
        ]).finally(() => window.clearTimeout(timer));
    }

    function canvasBlob(canvas, type, quality) {
        return new Promise((resolve) => {
            try { canvas.toBlob(resolve, type, quality); }
            catch (_) { resolve(null); }
        });
    }

    function captureFrame(source, options) {
        return new Promise((resolve, reject) => {
            const video = document.createElement("video");
            const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
            let settled = false;
            let capturing = false;
            let timeout, poll, seekTimer;
            const events = ["loadeddata", "seeked", "canplay", "progress", "loadedmetadata"];
            const finish = (error, result) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeout);
                window.clearTimeout(seekTimer);
                window.clearInterval(poll);
                events.forEach(event => video.removeEventListener(event, capture));
                video.removeEventListener("error", onError);
                video.pause();
                video.removeAttribute("src");
                video.load();
                video.remove();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                if (error) reject(error);
                else resolve(result);
            };
            const onError = () => finish(new Error("This browser could not decode the video's first frame."));
            const capture = async () => {
                if (settled || capturing || video.readyState < 2 || video.seeking) return;
                if (!video.videoWidth || !video.videoHeight) return;
                capturing = true;
                video.pause();
                const canvas = document.createElement("canvas");
                try {
                    const scale = Math.min(1, options.maxEdge / video.videoWidth, options.maxEdge / video.videoHeight);
                    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
                    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
                    const context = canvas.getContext("2d", { alpha: false });
                    if (!context) throw new Error("Video previews are not supported by this browser.");
                    context.imageSmoothingEnabled = true;
                    context.imageSmoothingQuality = "high";
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    let blob = await canvasBlob(canvas, "image/webp", options.quality);
                    if (!blob?.size || blob.type !== "image/webp") {
                        blob = await canvasBlob(canvas, "image/jpeg", options.jpegQuality);
                    }
                    if (!blob?.size) throw new Error("The first-frame preview could not be compressed.");
                    finish(null, {
                        blob, width: canvas.width, height: canvas.height,
                        contentType: blob.type,
                        extension: blob.type === "image/webp" ? "webp" : "jpg"
                    });
                } catch (error) {
                    finish(error);
                } finally {
                    canvas.width = canvas.height = 1;
                }
            };
            video.muted = true;
            video.defaultMuted = true;
            video.playsInline = true;
            video.preload = "auto";
            video.setAttribute("playsinline", "");
            video.setAttribute("aria-hidden", "true");
            video.tabIndex = -1;
            // Keep a rendered element for browsers that defer detached media.
            video.style.cssText = "position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none";
            if (!objectUrl) video.crossOrigin = "anonymous";
            events.forEach(event => video.addEventListener(event, capture));
            video.addEventListener("error", onError);
            document.body.appendChild(video);
            timeout = window.setTimeout(() => finish(new Error("The first video frame took too long to decode.")), 25000);
            // readyState polling also covers browsers that omit loadeddata.
            poll = window.setInterval(capture, 200);
            seekTimer = window.setTimeout(() => {
                if (settled || capturing) return;
                // Remain inside the opening frame; never seek to a later scene.
                const target = Number.isFinite(video.duration) && video.duration > 0
                    ? Math.min(0.001, video.duration / 2) : 0;
                try { video.currentTime = target; } catch (_) { /* Continue waiting for decoded data. */ }
                capture();
            }, 1500);
            video.src = objectUrl || String(source || "");
            video.load();
        });
    }

    async function capture(source, settings = {}) {
        const options = { maxEdge: 360, quality: 0.56, jpegQuality: 0.62, ...settings };
        try { return await captureFrame(source, options); }
        catch (error) {
            if (source instanceof Blob) {
                // Retry local uploads with a fresh decoder/object URL as well.
                return captureFrame(source, options);
            }
        }
        let url = String(source || "");
        if (typeof options.resolveSource === "function") {
            try {
                const refreshed = await withTimeout(options.resolveSource, 8000);
                if (refreshed) url = refreshed;
                // A new media element also retries a transient failure when the
                // freshly resolved URL has the same value as the saved URL.
                if (refreshed) return await captureFrame(url, options);
            } catch (_) { /* Try a complete local copy next. */ }
        }
        // Last resort: some media cannot be decoded via remote byte ranges.
        // Do not retain the full video in our thumbnail cache.
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 60000);
        let blob;
        try {
            const response = await fetch(url, {
                mode: "cors", credentials: "omit", cache: "reload", signal: controller.signal
            });
            if (!response.ok) throw new Error(`Video download failed with ${response.status}.`);
            blob = await response.blob();
            if (!blob.size) throw new Error("The video download was empty.");
        } finally {
            window.clearTimeout(timer);
        }
        return captureFrame(blob, options);
    }

    window.KMCVideoPreview = { capture };
})();
