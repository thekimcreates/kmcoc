"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const { auth, db, storage } = window.kmcFirebase || {};
  const tools = window.kmcAdminTools;
  const imageOptimizer = window.kmcImageOptimizer;
  const defaults = window.KMC_ARRANGEMENT_DEFAULTS || { arrangements: [], instruments: [] };
  const docRef = db?.collection("siteContent").doc("arrangements");
  const q = id => document.getElementById(id);
  const loading = q("arrangements-loading");
  const main = q("arrangements-admin");
  const email = q("admin-user-email");
  const logout = q("admin-logout");
  const list = q("arrangement-admin-list");
  const pageStatus = q("arrangement-page-status");
  const editor = q("arrangement-editor-modal");
  const instrumentModal = q("instrument-modal");
  const saveBar = q("arrangements-save-bar");
  const saveMessage = q("arrangements-save-message");
  const saveButton = q("save-arrangements");
  const revertButton = q("revert-arrangements");
  let state = structuredClone(defaults);
  let removeArrangementPhoto = false;
  let draggedArrangementId = null;
  let savedTimer = null;
  const storagePathsToDelete = new Set();

  const slug = value => String(value || "item").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `item-${Date.now()}`;
  const status = (el, msg, type = "") => { el.textContent = msg; el.className = `login-status${type ? ` is-${type}` : ""}`; };
  const displayUrl = url => String(url || "").startsWith("assets/") ? `../${url}` : url;
  const instrumentById = id => state.instruments.find(item => item.id === id);
  const saveState = async () => docRef.set({ ...state, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: auth.currentUser?.uid || null });
  const setDirty = (dirty = true) => {
    clearTimeout(savedTimer);
    saveBar.classList.toggle("is-visible", dirty);
    saveBar.setAttribute("aria-hidden", String(!dirty));
    saveBar.inert = !dirty;
    if (!dirty) return;
    saveMessage.textContent = "Your changes are not saved. Press the button to save changes.";
    saveMessage.classList.remove("is-saved");
    revertButton.hidden = false;
    saveButton.disabled = false;
    saveButton.classList.remove("is-saving", "is-saved");
    saveButton.textContent = "Save Changes";
    saveButton.removeAttribute("aria-label");
  };
  const showSaving = () => {
    saveBar.classList.add("is-visible");
    saveBar.setAttribute("aria-hidden", "false");
    saveBar.inert = false;
    revertButton.hidden = true;
    saveButton.disabled = true;
    saveButton.classList.add("is-saving");
    saveButton.innerHTML = '<span class="arrangements-save-spinner" aria-hidden="true"></span>';
    saveButton.setAttribute("aria-label", "Saving changes");
  };
  const showSaved = () => {
    saveMessage.textContent = "Changes saved successfully.";
    saveMessage.classList.add("is-saved");
    revertButton.hidden = true;
    saveButton.classList.remove("is-saving");
    saveButton.classList.add("is-saved");
    saveButton.disabled = true;
    saveButton.textContent = "✓";
    saveButton.setAttribute("aria-label", "Changes saved successfully");
    savedTimer = window.setTimeout(() => setDirty(false), 3000);
  };
  const openModal = modal => { modal.hidden = false; modal.setAttribute("aria-hidden", "false"); requestAnimationFrame(() => modal.classList.add("is-open")); document.body.style.overflow = "hidden"; };
  const closeModal = modal => { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); setTimeout(() => { modal.hidden = true; }, 250); document.body.style.overflow = ""; };
  const preview = (img, wrap, url) => { if (url) { img.src = displayUrl(url); wrap.hidden = false; } else { img.removeAttribute("src"); wrap.hidden = true; } };
  const upload = async (file, folder, id, statusElement = pageStatus) => {
    if (!file) return null;
    if (!imageOptimizer) throw new Error("The image optimizer could not be loaded. Refresh the page and try again.");
    const isInstrument = folder === "instrument-photos";
    status(statusElement, "Optimizing image…");
    const optimized = await imageOptimizer.optimize(file, {
      maxWidth: isInstrument ? 900 : 1600,
      maxHeight: isInstrument ? 900 : 1200,
      quality: isInstrument ? 0.80 : 0.82
    });
    status(statusElement, `Uploading optimized image (${imageOptimizer.formatBytes(optimized.optimizedBytes)})…`);
    const path = `${folder}/${id}/${Date.now()}-${optimized.fileName}`;
    const snapshot = await storage.ref(path).put(optimized.blob, {
      contentType: optimized.contentType,
      customMetadata: {
        originalBytes: String(optimized.originalBytes),
        optimizedBytes: String(optimized.optimizedBytes),
        optimizedWidth: String(optimized.width),
        optimizedHeight: String(optimized.height)
      }
    });
    return {
      photoUrl: await snapshot.ref.getDownloadURL(),
      photoPath: path,
      optimization: optimized
    };
  };

  function normalizeArrangementOrder() {
    state.arrangements.forEach((item, index) => { item.order = index; });
  }

  function persistArrangementOrder() {
    normalizeArrangementOrder();
    setDirty();
  }

  function renderList() {
    state.arrangements.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    list.replaceChildren();
    state.arrangements.forEach(item => {
      const card = document.createElement("article");
      card.className = "performance-admin-card sortable-admin-card";
      card.dataset.arrangementId = item.id;
      card.innerHTML = `<button class="admin-drag-handle" type="button" aria-label="Drag ${item.name || "arrangement"} to reorder" title="Drag to reorder"><span></span><span></span><span></span></button><div class="arrangement-admin-card-main"><img class="arrangement-admin-thumb" alt="" loading="lazy" decoding="async"><div><h3></h3><p></p></div></div><div class="performance-admin-actions"><button class="admin-secondary-button admin-small-button" data-edit type="button">Edit</button><button class="admin-danger-button admin-small-button" data-delete type="button">Delete</button></div>`;
      card.querySelector("img").src = displayUrl(item.photoUrl);
      card.querySelector("img").alt = item.name || "Arrangement";
      card.querySelector("h3").textContent = `${item.name || "Arrangement"} ${item.koreanName || ""}`.trim();
      card.querySelector("p").textContent = `${(item.instruments || []).length} instrument${(item.instruments || []).length === 1 ? "" : "s"}`;
      card.querySelector("[data-edit]").onclick = () => editArrangement(item.id);
      card.querySelector("[data-delete]").onclick = async () => {
        if (!await tools.confirmAction({ title:"Delete arrangement?", message:`Delete ${item.name}? You can undo this for a few seconds.`, confirmText:"Delete" })) return;
        const index = state.arrangements.findIndex(entry => entry.id === item.id);
        state.arrangements = state.arrangements.filter(entry => entry.id !== item.id);
        normalizeArrangementOrder();
        renderList();
        setDirty();
        tools.showUndo(`${item.name} deleted.`, () => {
          state.arrangements.splice(Math.max(0,index),0,item); normalizeArrangementOrder(); renderList(); setDirty();
        });
      };
      list.appendChild(card);
    });
    enableArrangementSorting();
  }

  function enableArrangementSorting() {
    const handles = [...list.querySelectorAll(".admin-drag-handle")];
    handles.forEach(handle => {
      handle.addEventListener("pointerdown", beginArrangementDrag);
      handle.addEventListener("keydown", event => {
        if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const card = handle.closest(".sortable-admin-card");
        const sibling = event.key === "ArrowUp" ? card.previousElementSibling : card.nextElementSibling;
        if (!sibling) return;
        if (event.key === "ArrowUp") list.insertBefore(card, sibling);
        else list.insertBefore(sibling, card);
        syncArrangementStateFromDom();
        persistArrangementOrder();
        handle.focus();
      });
    });
  }

  function syncArrangementStateFromDom() {
    const byId = new Map(state.arrangements.map(item => [item.id, item]));
    state.arrangements = [...list.querySelectorAll(".sortable-admin-card")]
      .map(card => byId.get(card.dataset.arrangementId))
      .filter(Boolean);
    normalizeArrangementOrder();
  }

  function beginArrangementDrag(event) {
    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") return;
    event.preventDefault();

    const handle = event.currentTarget;
    const card = handle.closest(".sortable-admin-card");
    if (!card) return;

    const pointerId = event.pointerId;
    const originalRect = card.getBoundingClientRect();
    const pointerOffsetY = event.clientY - originalRect.top;

    const placeholder = document.createElement("div");
    placeholder.className = "arrangement-sort-placeholder";
    placeholder.style.height = `${originalRect.height}px`;
    card.before(placeholder);

    const previewCard = card.cloneNode(true);
    previewCard.classList.add("arrangement-drag-preview");
    previewCard.querySelectorAll("button").forEach(button => { button.tabIndex = -1; });
    previewCard.style.width = `${Math.min(originalRect.width, window.innerWidth - 24)}px`;
    previewCard.style.left = `${Math.max(12, Math.min(originalRect.left, window.innerWidth - originalRect.width - 12))}px`;
    document.body.appendChild(previewCard);

    card.classList.add("is-sort-source");
    document.body.classList.add("admin-sorting-active");

    let lastClientY = event.clientY;
    let finished = false;
    let autoScrollFrame = 0;

    const positionPreview = clientY => {
      const previewHeight = previewCard.offsetHeight || originalRect.height;
      const maxTop = Math.max(12, window.innerHeight - previewHeight - 12);
      previewCard.style.top = `${Math.max(12, Math.min(maxTop, clientY - pointerOffsetY))}px`;
    };

    const positionPlaceholder = clientY => {
      const cards = [...list.querySelectorAll(".sortable-admin-card:not(.is-sort-source)")];
      let inserted = false;

      for (const candidate of cards) {
        const rect = candidate.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          list.insertBefore(placeholder, candidate);
          inserted = true;
          break;
        }
      }

      if (!inserted) list.appendChild(placeholder);
    };

    const onPointerMove = moveEvent => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      lastClientY = moveEvent.clientY;
      positionPreview(lastClientY);
      positionPlaceholder(lastClientY);
    };

    const stopDrag = async releaseEvent => {
      if (finished || (releaseEvent?.pointerId != null && releaseEvent.pointerId !== pointerId)) return;
      finished = true;

      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", stopDrag, true);
      document.removeEventListener("pointercancel", stopDrag, true);
      window.removeEventListener("blur", stopDrag);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);

      placeholder.replaceWith(card);
      previewCard.remove();
      card.classList.remove("is-sort-source");
      document.body.classList.remove("admin-sorting-active");

      syncArrangementStateFromDom();
      await persistArrangementOrder();
      handle.focus({ preventScroll: true });
    };

    const onVisibilityChange = () => {
      if (document.hidden) stopDrag();
    };

    const autoScroll = () => {
      const edgeSize = Math.min(120, window.innerHeight * 0.2);
      let delta = 0;
      if (lastClientY < edgeSize) {
        delta = -Math.max(4, Math.round((edgeSize - lastClientY) / 8));
      } else if (lastClientY > window.innerHeight - edgeSize) {
        delta = Math.max(4, Math.round((lastClientY - (window.innerHeight - edgeSize)) / 8));
      }

      if (delta !== 0) {
        window.scrollBy(0, delta);
        positionPlaceholder(lastClientY);
      }
      autoScrollFrame = requestAnimationFrame(autoScroll);
    };

    positionPreview(lastClientY);
    positionPlaceholder(lastClientY);
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", stopDrag, true);
    document.addEventListener("pointercancel", stopDrag, true);
    window.addEventListener("blur", stopDrag);
    document.addEventListener("visibilitychange", onVisibilityChange);
    autoScrollFrame = requestAnimationFrame(autoScroll);
  }

  function renderInstrumentChecklist(selected = []) {
    const checklist = q("instrument-checklist");
    checklist.replaceChildren();
    state.instruments.forEach(inst => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox"><span></span>`;
      const input = label.querySelector("input");
      input.value = inst.id;
      input.checked = selected.some(entry => entry.instrumentId === inst.id);
      label.querySelector("span").textContent = `${inst.name} ${inst.koreanName || ""}`.trim();
      input.onchange = renderSelectedInstruments;
      checklist.appendChild(label);
    });
  }

  function renderSelectedInstruments() {
    const box = q("selected-instruments");
    box.replaceChildren();
    [...q("instrument-checklist").querySelectorAll("input:checked")].forEach(input => {
      const inst = instrumentById(input.value);
      if (!inst) return;
      const row = document.createElement("article");
      row.className = "selected-instrument-card";
      row.dataset.instrumentId = inst.id;
      row.innerHTML = `<img alt="" loading="lazy" decoding="async"><div class="selected-instrument-copy"><h3></h3></div>`;
      row.querySelector("img").src = displayUrl(inst.photoUrl);
      row.querySelector("img").alt = inst.name || "Instrument";
      row.querySelector("h3").textContent = `${inst.name} ${inst.koreanName || ""}`.trim();
      box.appendChild(row);
    });
  }

  function editArrangement(id = null) {
    const item = state.arrangements.find(entry => entry.id === id) || { id: "", name: "", koreanName: "", photoUrl: "", photoPath: "", instruments: [] };
    removeArrangementPhoto = false;
    q("arrangement-editor-title").textContent = id ? "Edit Arrangement" : "Add Arrangement";
    q("arrangement-id").value = item.id;
    q("arrangement-name").value = item.name;
    q("arrangement-korean").value = item.koreanName || "";
    q("arrangement-photo-existing").value = item.photoUrl || "";
    q("arrangement-photo-path").value = item.photoPath || "";
    q("arrangement-photo").value = "";
    preview(q("arrangement-photo-preview"), q("arrangement-photo-preview-wrap"), item.photoUrl);
    renderInstrumentChecklist(item.instruments || []);
    renderSelectedInstruments();
    status(q("arrangement-form-status"), "");
    openModal(editor);
  }

  q("arrangement-form").onsubmit = async event => {
    event.preventDefault();
    const oldId = q("arrangement-id").value;
    const old = state.arrangements.find(item => item.id === oldId);
    let id = oldId || slug(q("arrangement-name").value);
    if (!oldId && state.arrangements.some(item => item.id === id)) id += `-${Date.now()}`;
    let photoUrl = removeArrangementPhoto ? "" : q("arrangement-photo-existing").value;
    let photoPath = removeArrangementPhoto ? "" : q("arrangement-photo-path").value;
    try {
      const uploaded = await upload(q("arrangement-photo").files[0], "arrangement-photos", id, q("arrangement-form-status"));
      if (uploaded) ({ photoUrl, photoPath } = uploaded);
      if (!photoUrl) throw new Error("Please upload an arrangement photo.");
      const instruments = [...q("selected-instruments").children].map((row, order) => ({ instrumentId: row.dataset.instrumentId, order }));
      const record = { id, name: q("arrangement-name").value.trim(), koreanName: q("arrangement-korean").value.trim(), photoUrl, photoPath, order: old?.order ?? state.arrangements.length, instruments };
      state.arrangements = old ? state.arrangements.map(item => item.id === oldId ? record : item) : [...state.arrangements, record];
      normalizeArrangementOrder();
      if (uploaded && old?.photoPath && old.photoPath !== uploaded.photoPath) storagePathsToDelete.add(old.photoPath);
      if (removeArrangementPhoto && old?.photoPath) storagePathsToDelete.add(old.photoPath);
      renderList();
      closeModal(editor);
      status(pageStatus, "");
      setDirty();
    } catch (error) {
      console.error(error);
      status(q("arrangement-form-status"), error.message || "Unable to save.", "error");
    }
  };

  function resetAddInstrumentForm() {
    q("instrument-id").value = "";
    q("instrument-name").value = "";
    q("instrument-korean").value = "";
    q("instrument-photo-existing").value = "";
    q("instrument-photo-path").value = "";
    q("instrument-photo").value = "";
    preview(q("instrument-photo-preview"), q("instrument-photo-preview-wrap"), "");
  }

  async function saveInstrument({ oldId = "", name, koreanName, file, existingUrl = "", existingPath = "" }) {
    let id = oldId || slug(name);
    if (!oldId && state.instruments.some(item => item.id === id)) id += `-${Date.now()}`;
    let photoUrl = existingUrl;
    let photoPath = existingPath;
    const uploaded = await upload(file, "instrument-photos", id, q("instrument-status"));
    if (uploaded) ({ photoUrl, photoPath } = uploaded);
    if (!photoUrl) throw new Error("Please upload an instrument photo.");
    const record = { id, name: name.trim(), koreanName: koreanName.trim(), photoUrl, photoPath };
    state.instruments = oldId ? state.instruments.map(item => item.id === oldId ? record : item) : [...state.instruments, record];
    if (uploaded && existingPath && existingPath !== uploaded.photoPath) storagePathsToDelete.add(existingPath);
    return uploaded;
  }

  function renderInstrumentLibrary(expandedId = "") {
    const out = q("instrument-admin-list");
    out.replaceChildren();
    state.instruments.forEach(inst => {
      const row = document.createElement("article");
      row.className = `instrument-library-card${expandedId === inst.id ? " is-expanded" : ""}`;
      row.innerHTML = `<div class="instrument-library-summary"><img alt="" loading="lazy" decoding="async"><div><h3></h3><p>Used by <span></span> arrangement(s)</p></div><div class="performance-admin-actions"><button data-edit class="admin-secondary-button admin-small-button" type="button">Edit</button><button data-delete class="admin-danger-button admin-small-button" type="button">Delete</button></div></div><form class="instrument-inline-editor" ${expandedId === inst.id ? "" : "hidden"}><div class="team-editor-grid"><div class="admin-field"><label>English name</label><input data-name required></div><div class="admin-field"><label>Korean name</label><input data-korean></div></div><div class="admin-field"><label>Instrument photo</label><input data-photo type="file" accept="image/*,.heic,.heif"></div><div class="performance-form-actions"><button class="admin-submit" type="submit">Apply Changes</button><button data-cancel class="admin-secondary-button" type="button">Cancel</button></div></form>`;
      row.querySelector("img").src = displayUrl(inst.photoUrl);
      row.querySelector("img").alt = inst.name;
      row.querySelector("h3").textContent = `${inst.name} ${inst.koreanName || ""}`.trim();
      row.querySelector("span").textContent = state.arrangements.filter(arrangement => (arrangement.instruments || []).some(entry => entry.instrumentId === inst.id)).length;
      row.querySelector("[data-edit]").onclick = () => renderInstrumentLibrary(expandedId === inst.id ? "" : inst.id);
      row.querySelector("[data-delete]").onclick = async () => {
        if (state.arrangements.some(arrangement => (arrangement.instruments || []).some(entry => entry.instrumentId === inst.id))) return status(q("instrument-status"), "Remove this instrument from all arrangements before deleting it.", "error");
        if (!await tools.confirmAction({ title:"Delete instrument?", message:`Delete ${inst.name}? You can undo this for a few seconds.`, confirmText:"Delete" })) return;
        const index = state.instruments.findIndex(item => item.id === inst.id);
        state.instruments = state.instruments.filter(item => item.id !== inst.id);
        renderInstrumentLibrary();
        setDirty();
        tools.showUndo(`${inst.name} deleted.`, () => {
          state.instruments.splice(Math.max(0,index),0,inst); renderInstrumentLibrary(); setDirty();
        });
      };
      const form = row.querySelector("form");
      form.querySelector("[data-name]").value = inst.name;
      form.querySelector("[data-korean]").value = inst.koreanName || "";
      form.querySelector("[data-cancel]").onclick = () => renderInstrumentLibrary();
      form.onsubmit = async event => {
        event.preventDefault();
        try {
          const uploaded = await saveInstrument({ oldId: inst.id, name: form.querySelector("[data-name]").value, koreanName: form.querySelector("[data-korean]").value, file: form.querySelector("[data-photo]").files[0], existingUrl: inst.photoUrl, existingPath: inst.photoPath });
          renderInstrumentLibrary();
          status(q("instrument-status"), "");
          setDirty();
        } catch (error) {
          status(q("instrument-status"), error.message || "Unable to save.", "error");
        }
      };
      out.appendChild(row);
    });
  }

  q("instrument-form").onsubmit = async event => {
    event.preventDefault();
    try {
      const uploaded = await saveInstrument({ name: q("instrument-name").value, koreanName: q("instrument-korean").value, file: q("instrument-photo").files[0] });
      q("instrument-form").hidden = true;
      resetAddInstrumentForm();
      renderInstrumentLibrary();
      status(q("instrument-status"), "");
      setDirty();
    } catch (error) {
      status(q("instrument-status"), error.message || "Unable to save.", "error");
    }
  };

  q("add-instrument").onclick = () => {
    resetAddInstrumentForm();
    q("instrument-form").hidden = false;
    q("instrument-name").focus();
    q("instrument-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  q("cancel-instrument-add").onclick = () => { q("instrument-form").hidden = true; resetAddInstrumentForm(); };
  q("add-arrangement").onclick = () => editArrangement();
  q("manage-instruments").onclick = () => { q("instrument-form").hidden = true; resetAddInstrumentForm(); renderInstrumentLibrary(); openModal(instrumentModal); };
  q("remove-arrangement-photo").onclick = () => { removeArrangementPhoto = true; q("arrangement-photo-existing").value = ""; preview(q("arrangement-photo-preview"), q("arrangement-photo-preview-wrap"), ""); };
  q("arrangement-photo").onchange = () => { const file = q("arrangement-photo").files[0]; if (file) preview(q("arrangement-photo-preview"), q("arrangement-photo-preview-wrap"), URL.createObjectURL(file)); };
  q("instrument-photo").onchange = () => { const file = q("instrument-photo").files[0]; if (file) preview(q("instrument-photo-preview"), q("instrument-photo-preview-wrap"), URL.createObjectURL(file)); };
  document.querySelectorAll("[data-close-modal]").forEach(button => { button.onclick = () => closeModal(editor); });
  document.querySelectorAll("[data-close-instrument-modal]").forEach(button => { button.onclick = () => closeModal(instrumentModal); });
  revertButton.onclick = () => window.location.reload();
  saveButton.onclick = async () => {
    showSaving();
    try {
      state.arrangements.forEach(arrangement => {
        arrangement.instruments = (arrangement.instruments || []).map((selection, order) => ({ instrumentId: selection.instrumentId, order }));
      });
      await saveState();
      await Promise.all([...storagePathsToDelete].map(path => tools.deleteStoragePath(storage, path)));
      storagePathsToDelete.clear();
      await tools.logActivity(db, auth, "Updated", "arrangements", "arrangements", "Arrangements and instruments");
      showSaved();
    } catch (error) {
      console.error(error);
      setDirty();
      status(pageStatus, "Unable to save changes. Check your connection and try again.", "error");
    }
  };
  logout.onclick = async () => { await tools.signOut(auth); location.replace("login.html"); };

  if (!auth || !db || !storage) { loading.textContent = "Firebase could not be initialized."; return; }
  auth.onAuthStateChanged(async user => {
    if (!user) return location.replace("login.html");
    try {
      if (!await tools.verifyAdmin(auth, db, user)) { await tools.signOut(auth); return location.replace("login.html"); }
      email.textContent = user.email || "Administrator";
      const snapshot = await docRef.get();
      if (snapshot.exists) state = { arrangements: [], instruments: [], ...snapshot.data() };
      else await saveState();
      state.arrangements.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      normalizeArrangementOrder();
      renderList();
      loading.hidden = true;
      main.hidden = false;
    } catch (error) {
      console.error(error);
      loading.textContent = "Unable to load arrangements. Check Firebase rules and try again.";
    }
  });
});
