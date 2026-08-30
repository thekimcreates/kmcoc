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
  const resetHeroButton = document.getElementById("reset-team-hero");
  const saveBar = document.querySelector(".team-save-bar");
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

  const fallback = { heroImageUrl:"assets/team/team-hero.jpg", instructorName:"Susanna Hong", instructorKoreanName:"홍수잔나", teacherMessageKo:"", teacherMessageEn:"", members:[] };
  const redirect = () => location.replace("login.html");
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `member-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const setStatus = (message="", type="") => { status.textContent=message; status.className="login-status"; if(type) status.classList.add(`is-${type}`); };
  const updateNumbers = () => [...memberList.children].forEach((card,index)=>{ card.querySelector(".member-number").textContent=String(index+1); card.dataset.order=String(index); });
  const setDirty = (dirty=true) => {
    saveBar.classList.toggle("is-visible", dirty);
    saveBar.setAttribute("aria-hidden", String(!dirty));
    saveBar.inert = !dirty;
  };
  let dragStartIndex = -1;

  const heroUrl = value => /^(?:https?:|blob:|data:)/i.test(String(value || "")) ? value : `../${String(value || fallback.heroImageUrl).replace(/^\.\.\//, "")}`;
  const setHeroPreview = url => { heroPreview.src = heroUrl(url); };

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

  async function uploadHero() {
    if (!pendingHero) return { heroImageUrl: currentData?.heroImageUrl || fallback.heroImageUrl, heroImagePath: currentData?.heroImagePath || "" };
    if (!storage) throw new Error("Firebase Storage is unavailable.");
    const path = `team/hero/${Date.now()}.${pendingHero.extension}`;
    const snapshot = await storage.ref(path).put(pendingHero.blob, { contentType: pendingHero.contentType, cacheControl: "public,max-age=31536000,immutable" });
    return { heroImageUrl: await snapshot.ref.getDownloadURL(), heroImagePath: path };
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
    setHeroPreview(data.heroImageUrl || fallback.heroImageUrl);
    heroNote.textContent = "";
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
  resetHeroButton.addEventListener("click", () => { pendingHero = null; setHeroPreview(currentData?.heroImageUrl || fallback.heroImageUrl); heroNote.textContent = ""; });
  addMemberButton.addEventListener("click",()=>{ addMemberEditor({},true); setDirty(); });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const members=[...memberList.querySelectorAll(".member-editor-card")].map((card,order)=>({
      id:card.dataset.memberId||uid(), name:card.querySelector(".member-name").value.trim(), age:Number(card.querySelector(".member-age").value), service:card.querySelector(".member-service").value.trim(), order
    }));
    if(members.some(m=>!m.name||!Number.isFinite(m.age))) { setDirty(); return setStatus("Every member needs a name and age.","error"); }
    saveButton.disabled=true; saveButton.textContent="Saving…";
    try {
      const hero = await uploadHero();
      const data={ ...hero, instructorName:document.getElementById("instructor-name").value.trim(), instructorKoreanName:document.getElementById("instructor-korean-name").value.trim(), teacherMessageKoHtml:koEditor.getHtml(), teacherMessageEnHtml:enEditor.getHtml(), teacherMessageKo:koEditor.getText(), teacherMessageEn:enEditor.getText(), members, updatedAt:firebase.firestore.FieldValue.serverTimestamp() };
      await db.collection("siteContent").doc("team").set(data,{merge:true});
      currentData=data; pendingHero=null; setHeroPreview(data.heroImageUrl); heroNote.textContent="Hero image saved."; setStatus("Team page saved successfully.","success"); setDirty(false);
      await tools.logActivity(db,auth,"Updated","team","team","Team page");
    } catch(error){ console.error(error); setDirty(); setStatus("Unable to save. Check your Firestore rules and connection.","error"); }
    finally { saveButton.disabled=false; saveButton.textContent="Save Team Page"; }
  });
  logout.addEventListener("click",async()=>{ logout.disabled=true; await tools.signOut(auth); redirect(); });
});
