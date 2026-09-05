"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const { auth, db, storage } = window.kmcFirebase || {};
  const tools = window.kmcAdminTools;
  const optimizer = window.kmcImageOptimizer;
  const page = document.getElementById("team-admin");
  const loading = document.getElementById("team-loading");
  const email = document.getElementById("admin-user-email");
  const logout = document.getElementById("admin-logout");
  const form = document.getElementById("team-form");
  const saveButton = document.getElementById("save-team");
  const heroInput = document.getElementById("team-hero-input");
  const heroPreview = document.getElementById("team-hero-preview");
  const heroNote = document.getElementById("team-hero-note");
  const teacherImageInput = document.getElementById("teacher-image-input");
  const teacherImagePreview = document.getElementById("teacher-image-preview");
  const teacherImageNote = document.getElementById("teacher-image-note");
  const saveBar = document.querySelector(".team-save-bar");
  const saveMessage = document.getElementById("team-save-message");
  const revertButton = document.getElementById("revert-team");
  const memberList = document.getElementById("member-editor-list");
  const memberTemplate = document.getElementById("member-editor-template");
  const addMemberButton = document.getElementById("add-member");
  const status = document.getElementById("team-status");
  const koHost = document.getElementById("teacher-message-ko");
  const enHost = document.getElementById("teacher-message-en");
  const koEditor = tools.createRichEditor("", koHost.getAttribute("aria-label"));
  const enEditor = tools.createRichEditor("", enHost.getAttribute("aria-label"));
  koHost.replaceWith(koEditor); koEditor.id = "teacher-message-ko";
  enHost.replaceWith(enEditor); enEditor.id = "teacher-message-en";
  let currentData = null;
  let pendingHero = null;
  let pendingTeacherImage = null;
  let savedTimer = null;

  const fallback = { heroImageUrl:"assets/team/team-hero.webp", instructorImageUrl:"assets/team/instructor.webp", instructorName:"Susanna Hong", instructorKoreanName:"홍수잔나", teacherMessageKo:"", teacherMessageEn:"", members:[] };
  const redirect = () => location.replace("login.html");
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `member-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const setStatus = (message="", type="") => { status.textContent=message; status.className="login-status"; if(type) status.classList.add(`is-${type}`); };
  const updateNumbers = () => [...memberList.children].forEach((card,index)=>{ card.querySelector(".member-number").textContent=String(index+1); card.dataset.order=String(index); });
  const setDirty = (dirty=true) => {
    clearTimeout(savedTimer);
    saveBar.classList.toggle("is-visible", dirty);
    saveBar.setAttribute("aria-hidden", String(!dirty));
    saveBar.inert = !dirty;
    if (!dirty) return;
    saveMessage.textContent = "Your changes are not saved. Press the button to save changes.";
    saveMessage.classList.remove("is-saved");
    status.textContent = "";
      revertButton.hidden = false;
      saveButton.disabled = false;
      saveButton.classList.remove("is-saving", "is-saved");
      saveButton.textContent = "Save Changes";
      saveButton.removeAttribute("aria-label");
  };
  let dragStartIndex = -1;

  const imageUrl = (value, fallbackUrl) => /^(?:https?:|blob:|data:)/i.test(String(value || "")) ? value : `../${String(value || fallbackUrl).replace(/^\.\.\//, "")}`;
  const setHeroPreview = url => { heroPreview.src = imageUrl(url, fallback.heroImageUrl); };
  const setTeacherImagePreview = url => { teacherImagePreview.src = imageUrl(url, fallback.instructorImageUrl); };

  async function selectHero(file) {
    if (!file) return;
    try {
      if (!optimizer) throw new Error("Image tools are unavailable.");
      heroNote.textContent = "Preparing hero image…";
      pendingHero = await optimizer.optimize(file, { maxWidth: 2400, maxHeight: 1600, quality: 0.88 });
      setHeroPreview(URL.createObjectURL(pendingHero.blob));
      heroNote.textContent = optimizer.summary(pendingHero);
      setDirty();
    } catch (error) {
      console.error(error);
      heroNote.textContent = error.message || "Unable to prepare this image.";
    }
  }

  async function selectTeacherImage(file) {
    if (!file) return;
    try {
      if (!optimizer) throw new Error("Image tools are unavailable.");
      teacherImageNote.textContent = "Preparing teacher image…";
      pendingTeacherImage = await optimizer.optimize(file, { maxWidth: 1800, maxHeight: 2200, quality: 0.9 });
      setTeacherImagePreview(URL.createObjectURL(pendingTeacherImage.blob));
      teacherImageNote.textContent = optimizer.summary(pendingTeacherImage);
      setDirty();
    } catch (error) {
      console.error(error);
      teacherImageNote.textContent = error.message || "Unable to prepare this image.";
    }
  }

  async function uploadHero() {
    if (!pendingHero) return { heroImageUrl: currentData?.heroImageUrl || fallback.heroImageUrl, heroImagePath: currentData?.heroImagePath || "" };
    if (!storage) throw new Error("Firebase Storage is unavailable.");
    const path = `team/hero/${Date.now()}.${pendingHero.extension}`;
    const snapshot = await storage.ref(path).put(pendingHero.blob, { contentType: pendingHero.contentType, cacheControl: "public,max-age=31536000,immutable" });
    return { heroImageUrl: await snapshot.ref.getDownloadURL(), heroImagePath: path };
  }

  async function uploadTeacherImage() {
    if (!pendingTeacherImage) return { instructorImageUrl: currentData?.instructorImageUrl || fallback.instructorImageUrl, instructorImagePath: currentData?.instructorImagePath || "" };
    if (!storage) throw new Error("Firebase Storage is unavailable.");
    const path = `team/teacher/${Date.now()}.${pendingTeacherImage.extension}`;
    const snapshot = await storage.ref(path).put(pendingTeacherImage.blob, { contentType: pendingTeacherImage.contentType, cacheControl: "public,max-age=31536000,immutable" });
    return { instructorImageUrl: await snapshot.ref.getDownloadURL(), instructorImagePath: path };
  }

  function showSaving() {
    saveBar.classList.add("is-visible");
    saveBar.setAttribute("aria-hidden", "false");
    saveBar.inert = false;
    revertButton.hidden = true;
    saveButton.disabled = true;
    saveButton.classList.add("is-saving");
    saveButton.innerHTML = '<span class="team-save-spinner" aria-hidden="true"></span>';
    saveButton.setAttribute("aria-label", "Saving changes");
  }

  function showSaved() {
    saveMessage.textContent = "Changes saved successfully.";
    saveMessage.classList.add("is-saved");
    status.textContent = "";
    revertButton.hidden = true;
    saveButton.classList.remove("is-saving");
    saveButton.classList.add("is-saved");
    saveButton.disabled = true;
    saveButton.textContent = "✓";
    saveButton.setAttribute("aria-label", "Changes saved successfully");
    savedTimer = window.setTimeout(() => setDirty(false), 3000);
  }

  function addMemberEditor(member={ id:uid(), name:"", age:"", service:"" }, shouldScroll=false) {
    const card = memberTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.memberId = member.id || uid();
    card.querySelector(".member-name").value = member.name || "";
    card.querySelector(".member-age").value = member.age ?? "";
    card.querySelector(".member-service").value = member.service || "";
    card.querySelector(".remove-member").addEventListener("click", async () => {
      const name = card.querySelector(".member-name").value.trim() || "this member";
      if (!await tools.confirmAction({ title:"Remove member?", message:`Remove ${name} from the team page?`, confirmText:"Remove" })) return;
      const index = [...memberList.children].indexOf(card);
      card.remove(); updateNumbers(); setDirty();
      tools.showUndo(`${name} removed.`, async () => {
        const before = memberList.children[index] || null;
        memberList.insertBefore(card, before); updateNumbers(); setDirty();
      });
    });

    const handle = card.querySelector(".member-drag-handle");
    handle.addEventListener("dragstart", event => { dragStartIndex = [...memberList.children].indexOf(card); card.classList.add("is-dragging"); event.dataTransfer.effectAllowed="move"; event.dataTransfer.setData("text/plain",card.dataset.memberId); });
    handle.addEventListener("dragend", () => { const dragEndIndex = [...memberList.children].indexOf(card); card.classList.remove("is-dragging"); memberList.querySelectorAll(".is-drag-over").forEach(x=>x.classList.remove("is-drag-over")); updateNumbers(); if (dragStartIndex !== dragEndIndex) setDirty(); dragStartIndex = -1; });
    card.addEventListener("dragover", event => { event.preventDefault(); const dragging=memberList.querySelector(".is-dragging"); if(!dragging||dragging===card)return; const rect=card.getBoundingClientRect(); if(event.clientY<rect.top+rect.height/2) memberList.insertBefore(dragging,card); else memberList.insertBefore(dragging,card.nextSibling); updateNumbers(); });
    memberList.appendChild(card); updateNumbers();
    if (shouldScroll) requestAnimationFrame(()=>{ card.scrollIntoView({behavior:"smooth",block:"center"}); setTimeout(()=>card.querySelector(".member-name").focus({preventScroll:true}),350); });
    return card;
  }

  function populate(data) {
    currentData = data;
    pendingHero = null;
    pendingTeacherImage = null;
    setHeroPreview(data.heroImageUrl || fallback.heroImageUrl);
    setTeacherImagePreview(data.instructorImageUrl || fallback.instructorImageUrl);
    heroNote.textContent = "";
    teacherImageNote.textContent = "";
    document.getElementById("instructor-name").value = data.instructorName || "";
    document.getElementById("instructor-korean-name").value = data.instructorKoreanName || "";
    koEditor.setHtml(data.teacherMessageKoHtml || tools.plainTextToHtml(data.teacherMessageKo || ""));
    enEditor.setHtml(data.teacherMessageEnHtml || tools.plainTextToHtml(data.teacherMessageEn || ""));
    memberList.replaceChildren();
    [...(Array.isArray(data.members)?data.members:[])].sort((a,b)=>(a.order??0)-(b.order??0)).forEach(member=>addMemberEditor(member,false));
  }

  auth?.onAuthStateChanged(async user => {
    if(!user) return redirect();
    try {
      if(!await tools.verifyAdmin(auth,db,user)){ await tools.signOut(auth); return redirect(); }
      email.textContent=user.email||"Administrator";
      const snap=await db.collection("siteContent").doc("team").get();
      populate(snap.exists?{...fallback,...snap.data()}:fallback);
      loading.hidden=true; page.hidden=false;
    } catch(error){ console.error(error); redirect(); }
  });

  ["input", "change"].forEach(eventName => form.addEventListener(eventName, () => setDirty()));
  [koEditor, enEditor].forEach(editor => editor.querySelector(".rich-editor-toolbar")?.addEventListener("click", () => setTimeout(() => setDirty(), 0)));
  heroInput.addEventListener("change", event => { selectHero(event.target.files?.[0]); event.target.value = ""; });
  teacherImageInput.addEventListener("change", event => { selectTeacherImage(event.target.files?.[0]); event.target.value = ""; });
  revertButton.addEventListener("click", () => window.location.reload());
  addMemberButton.addEventListener("click",()=>{ addMemberEditor({},true); setDirty(); });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const members=[...memberList.querySelectorAll(".member-editor-card")].map((card,order)=>({
      id:card.dataset.memberId||uid(), name:card.querySelector(".member-name").value.trim(), age:Number(card.querySelector(".member-age").value), service:card.querySelector(".member-service").value.trim(), order
    }));
    if(members.some(m=>!m.name||!Number.isFinite(m.age))) { setDirty(); return setStatus("Every member needs a name and age.","error"); }
    showSaving();
    try {
      const hero = await uploadHero();
      const teacherImage = await uploadTeacherImage();
      const data={ ...hero, ...teacherImage, instructorName:document.getElementById("instructor-name").value.trim(), instructorKoreanName:document.getElementById("instructor-korean-name").value.trim(), teacherMessageKoHtml:koEditor.getHtml(), teacherMessageEnHtml:enEditor.getHtml(), teacherMessageKo:koEditor.getText(), teacherMessageEn:enEditor.getText(), members, updatedAt:firebase.firestore.FieldValue.serverTimestamp() };
      await db.collection("siteContent").doc("team").set(data,{merge:true});
      currentData=data; pendingHero=null; pendingTeacherImage=null; setHeroPreview(data.heroImageUrl); setTeacherImagePreview(data.instructorImageUrl); heroNote.textContent=""; teacherImageNote.textContent=""; showSaved();
      await tools.logActivity(db,auth,"Updated","team","team","Team page");
    } catch(error){ console.error(error); setDirty(); setStatus("Unable to save. Check your Firestore rules and connection.","error"); }
  });
  logout.addEventListener("click",async()=>{ logout.disabled=true; await tools.signOut(auth); redirect(); });
});
