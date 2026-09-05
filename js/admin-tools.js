"use strict";

(() => {
  const allowedTags = new Set(["P","BR","STRONG","B","EM","I","U","UL","OL","LI","A"]);

  function sanitizeHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (!allowedTags.has(child.tagName)) {
            child.replaceWith(...child.childNodes);
            return;
          }
          const href = child.tagName === "A" ? child.getAttribute("href") || "" : "";
          [...child.attributes].forEach(attribute => child.removeAttribute(attribute.name));
          if (child.tagName === "A") {
            if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) child.removeAttribute("href");
            else {
              child.setAttribute("target", "_blank");
              child.setAttribute("rel", "noopener noreferrer");
            }
          }
          walk(child);
        } else if (child.nodeType !== Node.TEXT_NODE) child.remove();
      });
    };
    walk(template.content);
    return template.innerHTML;
  }

  function plainTextToHtml(text) {
    return String(text || "").split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
      .map(part => `<p>${part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>`).join("");
  }

  function createRichEditor(initialHtml = "", ariaLabel = "Rich text editor") {
    const wrapper = document.createElement("div");
    wrapper.className = "rich-editor";
    wrapper.innerHTML = `<div class="rich-editor-toolbar" role="toolbar" aria-label="Text formatting">
      <button type="button" data-command="bold" title="Bold"><strong>B</strong></button>
      <button type="button" data-command="italic" title="Italic"><em>I</em></button>
      <button type="button" data-command="underline" title="Underline"><u>U</u></button>
      <button type="button" data-command="insertUnorderedList" title="Bulleted list">• List</button>
      <button type="button" data-command="insertOrderedList" title="Numbered list">1. List</button>
      <button type="button" data-command="createLink" title="Add link">Link</button>
      <button type="button" data-command="removeFormat" title="Clear formatting">Clear</button>
    </div><div class="rich-editor-surface" contenteditable="true" role="textbox" aria-multiline="true"></div>`;
    const surface = wrapper.querySelector(".rich-editor-surface");
    surface.setAttribute("aria-label", ariaLabel);
    surface.innerHTML = sanitizeHtml(initialHtml);
    wrapper.querySelectorAll("[data-command]").forEach(button => button.addEventListener("click", () => {
      surface.focus({ preventScroll: true });
      const command = button.dataset.command;
      if (command === "createLink") {
        const url = window.prompt("Enter a full link beginning with https://");
        if (!url) return;
        if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) return;
        document.execCommand(command, false, url);
      } else document.execCommand(command, false, null);
    }));
    wrapper.getHtml = () => sanitizeHtml(surface.innerHTML);
    wrapper.setHtml = value => { surface.innerHTML = sanitizeHtml(value); };
    wrapper.getText = () => surface.textContent.trim();
    return wrapper;
  }

  function ensureDialog() {
    let modal = document.getElementById("admin-confirm-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "admin-confirm-modal";
    modal.className = "admin-confirm-modal";
    modal.hidden = true;
    modal.innerHTML = `<div class="admin-confirm-backdrop"></div><section class="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title"><h2 id="admin-confirm-title">Confirm action</h2><p id="admin-confirm-message"></p><div class="admin-confirm-actions"><button class="admin-secondary-button" data-cancel type="button">Cancel</button><button class="admin-danger-button" data-confirm type="button">Confirm</button></div></section>`;
    document.body.appendChild(modal);
    return modal;
  }

  function confirmAction({ title = "Confirm action", message = "Are you sure?", confirmText = "Confirm", danger = true } = {}) {
    const modal = ensureDialog();
    modal.querySelector("h2").textContent = title;
    modal.querySelector("p").textContent = message;
    const confirmButton = modal.querySelector("[data-confirm]");
    confirmButton.textContent = confirmText;
    confirmButton.className = danger ? "admin-danger-button" : "admin-submit";
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    confirmButton.focus({ preventScroll: true });
    return new Promise(resolve => {
      const finish = result => {
        modal.classList.remove("is-open");
        setTimeout(() => { modal.hidden = true; }, 180);
        confirmButton.onclick = null;
        modal.querySelector("[data-cancel]").onclick = null;
        document.removeEventListener("keydown", onKey);
        resolve(result);
      };
      const onKey = event => { if (event.key === "Escape") finish(false); };
      confirmButton.onclick = () => finish(true);
      modal.querySelector("[data-cancel]").onclick = () => finish(false);
      document.addEventListener("keydown", onKey);
    });
  }

  function showUndo(message, undo, { duration = 8000, onExpire } = {}) {
    let toast = document.getElementById("admin-undo-toast");
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.id = "admin-undo-toast";
    toast.className = "admin-undo-toast";
    toast.innerHTML = `<span></span><button type="button">Undo</button>`;
    toast.querySelector("span").textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    let completed = false;
    const close = async expired => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 220);
      if (expired && onExpire) await onExpire();
    };
    toast.querySelector("button").onclick = async () => { await undo(); await close(false); };
    const timer = setTimeout(() => close(true), duration);
    return () => close(true);
  }

  async function logActivity(db, auth, action, entity, entityId = "", label = "") {
    try {
      const user = auth?.currentUser;
      await db.collection("adminActivity").add({
        action, entity, entityId, label,
        userId: user?.uid || "",
        userEmail: user?.email || "Administrator",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.warn("Unable to record admin activity:", error);
    }
  }

  async function deleteStoragePath(storage, path) {
    if (!path) return;
    try { await storage.ref(path).delete(); }
    catch (error) { if (error?.code !== "storage/object-not-found") console.warn("Unable to remove old image:", error); }
  }

  const ADMIN_CACHE_PREFIX = "kmc-admin-access:";
  const pendingAdminChecks = new Map();

  function adminCacheKey(user) {
    return `${ADMIN_CACHE_PREFIX}${user?.uid || "unknown"}`;
  }

  function clearAdminAccessCache(user) {
    try {
      if (user?.uid) sessionStorage.removeItem(adminCacheKey(user));
      else {
        Object.keys(sessionStorage)
          .filter(key => key.startsWith(ADMIN_CACHE_PREFIX))
          .forEach(key => sessionStorage.removeItem(key));
      }
    } catch (error) {
      console.info("Administrator session cache is unavailable:", error);
    }
  }

  function readCachedAdminAccess(user, ttl) {
    try {
      const raw = sessionStorage.getItem(adminCacheKey(user));
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (cached?.active === true && Date.now() - Number(cached.checkedAt || 0) < ttl) return true;
      sessionStorage.removeItem(adminCacheKey(user));
    } catch (error) {
      clearAdminAccessCache(user);
    }
    return null;
  }

  function cacheAdminAccess(user) {
    try {
      sessionStorage.setItem(adminCacheKey(user), JSON.stringify({ active: true, checkedAt: Date.now() }));
    } catch (error) {
      console.info("Administrator session cache could not be saved:", error);
    }
  }

  async function verifyAdmin(auth, db, user, { force = false, ttl = 5 * 60 * 1000 } = {}) {
    if (window.KMCAdminSession && !await window.KMCAdminSession.check(user)) return false;
    if (!auth || !db || !user?.uid) return false;
    if (!force && readCachedAdminAccess(user, ttl) === true) return true;

    const key = user.uid;
    if (!force && pendingAdminChecks.has(key)) return pendingAdminChecks.get(key);

    const check = (async () => {
      // Admin authorization must come directly from Firestore's server. This avoids
      // the long delay caused by waiting for an IndexedDB-backed client to recover.
      const record = await db.collection("admins").doc(user.uid).get({ source: "server" });
      const active = record.exists && record.data()?.active === true;
      if (active) cacheAdminAccess(user);
      else clearAdminAccessCache(user);
      return active;
    })();

    pendingAdminChecks.set(key, check);
    try {
      return await check;
    } finally {
      pendingAdminChecks.delete(key);
    }
  }

  async function signOut(auth) {
    const user = auth?.currentUser;
    clearAdminAccessCache(user);
    if (auth) await auth.signOut();
  }

  window.kmcAdminTools = {
    sanitizeHtml, plainTextToHtml, createRichEditor, confirmAction, showUndo,
    logActivity, deleteStoragePath, verifyAdmin, clearAdminAccessCache, signOut
  };
})();
