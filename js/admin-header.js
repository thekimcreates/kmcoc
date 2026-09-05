"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector(".admin-site-header");
    const nav = header?.querySelector(".admin-nav");
    if (!nav) return;
    nav.id = "admin-header-navigation";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-header-toggle";
    button.setAttribute("aria-controls", nav.id);
    button.innerHTML = "<span></span><span></span>";
    function toggle(open) {
        header.classList.toggle("is-menu-open", open);
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");

    }
    toggle(false);
    button.addEventListener("click", () => toggle(!header.classList.contains("is-menu-open")));
    document.addEventListener("click", event => { if (!header.contains(event.target)) toggle(false); });
    header.addEventListener("keydown", event => { if (event.key === "Escape") { toggle(false); button.focus(); } });
    nav.addEventListener("click", () => toggle(false));
    header.appendChild(button);
});
