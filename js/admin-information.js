"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const { auth, db, storage } = window.kmcFirebase || {};
  const tools = window.kmcAdminTools;
  const optimizer = window.kmcImageOptimizer;
  const loading = document.getElementById("information-loading");
  const page = document.getElementById("information-admin");
  const email = document.getElementById("admin-user-email");
  const logout = document.getElementById("admin-logout");
  const form = document.getElementById("information-form");
  const status = document.getElementById("information-status");
  const save = document.getElementById("save-information");
  const saveBar = document.getElementById("information-save-bar");
  const saveMessage = document.getElementById("information-save-message");
  const revertButton = document.getElementById("revert-information");
  const sectionsEditor = document.getElementById("information-sections-editor");
  const addSection = document.getElementById("add-information-section");
  const redirect = () => location.replace("login.html");
  let current = window.KMCSiteInformation?.fallback || {};
  let pending = { circle: null, full: null };
  let savedTimer = null;

  const setStatus = (message = "", type = "") => {
    status.textContent = message;
    status.className = "login-status";
    if (type) status.classList.add(`is-${type}`);
  };

  function setDirty(dirty = true) {
    window.clearTimeout(savedTimer);
    saveBar.classList.toggle("is-visible", dirty);
    saveBar.setAttribute("aria-hidden", String(!dirty));
    saveBar.inert = !dirty;
    if (!dirty) return;
    saveMessage.textContent = "Your changes are not saved. Press the button to save changes.";
    saveMessage.classList.remove("is-saved");
    revertButton.hidden = false;
    save.disabled = false;
    save.classList.remove("is-saving", "is-saved");
    save.textContent = "Save Changes";
    save.removeAttribute("aria-label");
  }

  function showSaving() {
    saveBar.classList.add("is-visible");
    saveBar.setAttribute("aria-hidden", "false");
    saveBar.inert = false;
    revertButton.hidden = true;
    save.disabled = true;
    save.classList.add("is-saving");
    save.innerHTML = '<span class="information-save-spinner" aria-hidden="true"></span>';
    save.setAttribute("aria-label", "Saving changes");
  }

  function showSaved() {
    saveMessage.textContent = "Changes saved successfully.";
    saveMessage.classList.add("is-saved");
    setStatus();
    revertButton.hidden = true;
    save.classList.remove("is-saving");
    save.classList.add("is-saved");
    save.disabled = true;
    save.textContent = "✓";
    save.setAttribute("aria-label", "Changes saved successfully");
    savedTimer = window.setTimeout(() => setDirty(false), 3000);
  }

  function populate(data) {
    current = window.KMCSiteInformation.normalize(data);
    document.getElementById("contact-label").value = current.footer.contactLabel;
    document.getElementById("contact-email").value = current.footer.contactEmail;
    document.getElementById("copyright-text").value = current.footer.copyrightText;
    document.getElementById("footer-message").value = current.footer.message;
    document.getElementById("show-contact").checked = current.footer.showContact;
    document.getElementById("show-footer-logo").checked = current.footer.showLogo;
    renderPublicPageEditor(current.publicPage.sections);
    setPreview("circle", current.circleLogoUrl || "../assets/logo/circle.webp");
    setPreview("full", current.fullLogoUrl || "../assets/logo/full.webp");
    updateFooterPreview();
  }

  function createField(labelText, control) {
    const field = document.createElement("div");
    field.className = "admin-field";
    const label = document.createElement("label");
    label.textContent = labelText;
    field.append(label, control);
    return field;
  }

  function createInput(className, value, placeholder, type = "text") {
    const input = document.createElement("input");
    input.type = type;
    input.className = className;
    input.value = value || "";
    input.placeholder = placeholder;
    return input;
  }

  function createButton(text, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    return button;
  }

  function renderPublicPageEditor(sections = []) {
    sectionsEditor.replaceChildren();
    sections.forEach((section, index) => {
      const card = document.createElement("article");
      card.className = "information-section-editor";

      const header = document.createElement("div");
      header.className = "information-section-editor-header";
      const title = document.createElement("h3");
      title.textContent = `Text Section ${index + 1}`;
      const remove = createButton("Remove section", "admin-secondary-button information-remove-section");
      remove.addEventListener("click", () => {
        const next = readPublicPage().sections;
        next.splice(index, 1);
        renderPublicPageEditor(next);
        setDirty();
      });
      header.append(title, remove);
      card.append(header);

      card.append(createField("Section Title", createInput("information-section-title", section.title, "e.g. Join the Rhythm")));
      const text = document.createElement("textarea");
      text.className = "information-section-text";
      text.rows = 4;
      text.maxLength = 1200;
      text.placeholder = "Write what visitors should know.";
      text.value = section.text || "";
      card.append(createField("Text", text));

      const linksHeading = document.createElement("p");
      linksHeading.className = "information-links-label";
      linksHeading.textContent = "Links";
      card.append(linksHeading);
      const links = document.createElement("div");
      links.className = "information-admin-links";
      (section.links || []).forEach(link => addLinkRow(links, link));
      card.append(links);
      const addLink = createButton("+ Add Link", "admin-secondary-button information-add-link");
      addLink.addEventListener("click", () => {
        addLinkRow(links, {});
        setDirty();
      });
      card.append(addLink);
      sectionsEditor.append(card);
    });
  }

  function addLinkRow(container, link) {
    const row = document.createElement("div");
    row.className = "information-admin-link-row";
    row.append(
      createInput("information-link-label", link.label, "Link label"),
      createInput("information-link-url", link.url, "https://… or mailto:…", "url")
    );
    const remove = createButton("Remove", "admin-link-remove");
    remove.addEventListener("click", () => {
      row.remove();
      setDirty();
    });
    row.append(remove);
    container.append(row);
  }

  function readPublicPage() {
    return {
      sections: [...sectionsEditor.querySelectorAll(".information-section-editor")].map(card => ({
        title: card.querySelector(".information-section-title").value.trim(),
        text: card.querySelector(".information-section-text").value.trim(),
        links: [...card.querySelectorAll(".information-admin-link-row")].map(row => ({
          label: row.querySelector(".information-link-label").value.trim(),
          url: row.querySelector(".information-link-url").value.trim()
        })).filter(link => link.label || link.url)
      })).filter(section => section.title || section.text || section.links.length)
    };
  }

  function isSafePublicLink(url) {
    try {
      return ["https:", "http:", "mailto:"].includes(new URL(url, location.href).protocol);
    } catch (_) {
      return false;
    }
  }

  function setPreview(kind, url) {
    document.getElementById(`${kind}-logo-preview`).src = url;
  }

  async function selectLogo(kind, file) {
    if (!file) return;
    try {
      setStatus(`Preparing ${kind} logo…`);
      const result = await optimizer.optimize(file, kind === "circle"
        ? { maxWidth: 900, maxHeight: 900, quality: 0.9, preserveTransparency: true }
        : { maxWidth: 2200, maxHeight: 900, quality: 0.9, preserveTransparency: true });
      pending[kind] = result;
      setPreview(kind, URL.createObjectURL(result.blob));
      document.getElementById(`${kind}-logo-note`).textContent = optimizer.summary(result);
      setDirty();
      setStatus("Logo prepared. Press Save Changes to publish it.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Unable to prepare this image.", "error");
    }
  }

  async function uploadLogo(kind, result) {
    if (!result) return current[`${kind}LogoUrl`] || "";
    if (!storage) throw new Error("Firebase Storage is unavailable.");
    const path = `site-information/logos/${kind}-${Date.now()}.${result.extension}`;
    const reference = storage.ref().child(path);
    const snapshot = await reference.put(result.blob, { contentType: result.contentType, cacheControl: "public,max-age=31536000,immutable" });
    return snapshot.ref.getDownloadURL();
  }

  function updateFooterPreview() {
    const label = document.getElementById("contact-label").value.trim() || "Contact";
    const address = document.getElementById("contact-email").value.trim();
    document.getElementById("footer-preview-contact").textContent = address ? `${label}: ${address}` : label;
    document.getElementById("footer-preview-message").textContent = document.getElementById("footer-message").value.trim();
    document.getElementById("footer-preview-copyright").textContent = document.getElementById("copyright-text").value.trim();
    document.getElementById("footer-preview-contact").hidden = !document.getElementById("show-contact").checked;
    document.getElementById("footer-preview-logo").hidden = !document.getElementById("show-footer-logo").checked;
  }

  auth?.onAuthStateChanged(async user => {
    if (!user) return redirect();
    try {
      if (!await tools.verifyAdmin(auth, db, user)) { await tools.signOut(auth); return redirect(); }
      email.textContent = user.email || "Administrator";
      const snap = await db.collection("siteContent").doc("information").get();
      populate(snap.exists ? snap.data() : window.KMCSiteInformation.fallback);
      setDirty(false);
      loading.hidden = true;
      page.hidden = false;
    } catch (error) {
      console.error(error);
      setStatus("Unable to load the About page settings.", "error");
    }
  });

  ["circle", "full"].forEach(kind => {
    document.getElementById(`${kind}-logo-input`).addEventListener("change", event => selectLogo(kind, event.target.files?.[0]));
    document.getElementById(`reset-${kind}-logo`).addEventListener("click", () => {
      pending[kind] = null;
      setPreview(kind, current[`${kind}LogoUrl`] || `../assets/logo/${kind}.webp`);
      document.getElementById(`${kind}-logo-note`).textContent = "";
      setDirty();
    });
  });

  ["input", "change"].forEach(eventName => form.addEventListener(eventName, () => {
    updateFooterPreview();
    setDirty();
  }));
  addSection.addEventListener("click", () => {
    const sections = readPublicPage().sections;
    sections.push({ title: "", text: "", links: [] });
    renderPublicPageEditor(sections);
    setDirty();
  });
  revertButton.addEventListener("click", () => window.location.reload());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const contactEmail = document.getElementById("contact-email").value.trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      setDirty();
      return setStatus("Enter a valid contact email address.", "error");
    }
    const publicPage = readPublicPage();
    const invalidLink = publicPage.sections.flatMap(section => section.links).find(link => !link.label || !isSafePublicLink(link.url));
    if (invalidLink) {
      setDirty();
      return setStatus("Each public link needs a label and a valid https, http, or mailto address.", "error");
    }
    showSaving();
    try {
      const [circleLogoUrl, fullLogoUrl] = await Promise.all([
        uploadLogo("circle", pending.circle),
        uploadLogo("full", pending.full)
      ]);
      const data = {
        circleLogoUrl,
        fullLogoUrl,
        footer: {
          contactLabel: document.getElementById("contact-label").value.trim() || "Contact",
          contactEmail,
          copyrightText: document.getElementById("copyright-text").value.trim(),
          message: document.getElementById("footer-message").value.trim(),
          showContact: document.getElementById("show-contact").checked,
          showLogo: document.getElementById("show-footer-logo").checked
        },
        publicPage,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser?.uid || ""
      };
      await db.collection("siteContent").doc("information").set(data, { merge: true });
      current = window.KMCSiteInformation.normalize(data);
      pending = { circle: null, full: null };
      window.KMCSiteInformation.apply(current);
      try { localStorage.removeItem("kmc-shared-data-v1:site-information"); } catch (_) {}
      await tools.logActivity(db, auth, "Updated", "information", "information", "Website About page");
      showSaved();
    } catch (error) {
      console.error(error);
      setDirty();
      setStatus("Unable to save. Check Firestore and Storage rules.", "error");
    }
  });

  logout.addEventListener("click", async () => { logout.disabled = true; await tools.signOut(auth); redirect(); });
});
