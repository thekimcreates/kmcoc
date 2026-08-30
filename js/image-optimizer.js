"use strict";

(() => {
  const DEFAULTS = Object.freeze({
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.82,
    jpegQuality: 0.84,
    maxInputBytes: 25 * 1024 * 1024
  });

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB"];
    let size = value / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && size >= 1024; index += 1) {
      size /= 1024;
      unit = units[index];
    }
    return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
  }

  function safeBaseName(name) {
    return String(name || "image")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "image";
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("This image could not be read from your device."));
      reader.readAsDataURL(file);
    });
  }

  async function loadImage(file) {
    // Data URLs are slower than object URLs, but are much more reliable for
    // photos selected from iOS Photos and Safari's temporary file providers.
    const dataUrl = await readAsDataURL(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(
        "This photo format could not be opened by the browser. Try exporting it as JPEG or PNG first."
      ));
      image.src = dataUrl;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => {
      try {
        canvas.toBlob(blob => resolve(blob || null), type, quality);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(",");
    if (parts.length < 2) return null;
    const match = parts[0].match(/^data:([^;]+);base64$/i);
    if (!match) return null;
    try {
      const binary = atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new Blob([bytes], { type: match[1] });
    } catch (_) {
      return null;
    }
  }

  async function exportCanvas(canvas, settings) {
    if (settings.preserveTransparency) {
      const png = await canvasToBlob(canvas, "image/png");
      if (png && png.size > 0) return { blob: png, extension: "png", contentType: "image/png" };
    }
    let blob = await canvasToBlob(canvas, "image/webp", settings.quality);
    if (blob && blob.size > 0 && blob.type === "image/webp") {
      return { blob, extension: "webp", contentType: "image/webp" };
    }

    blob = await canvasToBlob(canvas, "image/jpeg", settings.jpegQuality);
    if (!blob || !blob.size) {
      try {
        blob = dataUrlToBlob(canvas.toDataURL("image/jpeg", settings.jpegQuality));
      } catch (_) {
        blob = null;
      }
    }

    if (!blob || !blob.size) {
      throw new Error("This browser could not prepare the image for upload. Try a smaller JPEG or PNG image.");
    }

    return { blob, extension: "jpg", contentType: "image/jpeg" };
  }

  async function optimize(file, options = {}) {
    if (!(file instanceof Blob)) throw new Error("Select an image file.");
    if (!String(file.type || "").startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name || "")) {
      throw new Error("Select an image file.");
    }

    const settings = { ...DEFAULTS, ...options };
    if (file.size > settings.maxInputBytes) {
      throw new Error(`The original image must be ${formatBytes(settings.maxInputBytes)} or smaller.`);
    }

    const image = await loadImage(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error("The image dimensions could not be detected.");

    const scale = Math.min(1, settings.maxWidth / sourceWidth, settings.maxHeight / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: Boolean(settings.preserveTransparency) });
    if (!context) throw new Error("Image optimization is not supported by this browser.");
    if (!settings.preserveTransparency) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const exported = await exportCanvas(canvas, settings);
    canvas.width = 1;
    canvas.height = 1;

    const reduction = file.size > 0
      ? Math.max(0, Math.round((1 - exported.blob.size / file.size) * 100))
      : 0;

    return {
      blob: exported.blob,
      fileName: `${safeBaseName(file.name)}-${width}x${height}.${exported.extension}`,
      extension: exported.extension,
      contentType: exported.contentType,
      originalBytes: file.size,
      optimizedBytes: exported.blob.size,
      sourceWidth,
      sourceHeight,
      width,
      height,
      reduction
    };
  }

  function summary(result) {
    if (!result) return "";
    return `Optimized ${formatBytes(result.originalBytes)} → ${formatBytes(result.optimizedBytes)} (${result.reduction}% smaller, ${result.width}×${result.height}, ${result.extension.toUpperCase()}).`;
  }

  window.kmcImageOptimizer = Object.freeze({ optimize, formatBytes, summary });
})();
