"use strict";
(() => {
    const auth = window.kmcFirebase?.auth;
    if (!auth) return;
    const duration = 60 * 60 * 1000;
    let timer, signingOut = null;
    async function check(user = auth.currentUser) {
        clearTimeout(timer);
        if (!user) return false;
        const signedIn = Date.parse(user.metadata?.lastSignInTime || "");
        const remaining = signedIn + duration - Date.now();
        if (!Number.isFinite(remaining) || remaining <= 0) {
            if (!signingOut) signingOut = auth.signOut().finally(() => {
                signingOut = null;
                if (!/\/login\.html$/.test(location.pathname)) location.replace("login.html?expired=1");
            });
            await signingOut;
            return false;
        }
        timer = setTimeout(() => { check().catch(console.error); }, remaining);
        return true;
    }
    auth.onAuthStateChanged(user => { check(user).catch(console.error); });
    for (const event of ["focus", "pageshow"]) window.addEventListener(event, () => { check().catch(console.error); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check().catch(console.error); });
    window.KMCAdminSession = { check };
})();
