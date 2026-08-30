"use strict";

(() => {
  let lastLoaded = null;
  const FALLBACK = Object.freeze({
    circleLogoUrl: "",
    fullLogoUrl: "",
    footer: {
      contactLabel: "Contact",
      contactEmail: "kmc-samulnori@gmail.com",
      copyrightText: "© 2026 KMC Samulnori. All Rights Reserved.",
      message: "",
      showContact: true,
      showLogo: true
    },
    publicPage: {
      intro: "Find ways to connect with KMC Samulnori, learn about our community, and stay involved.",
      sections: [
        {
          title: "Join the Rhythm",
          text: "Interested in learning Korean traditional percussion or performing with us? We welcome new members and volunteers of all experience levels.",
          links: [{ label: "Contact us about joining", url: "mailto:kmc-samulnori@gmail.com?subject=KMC%20Samulnori%20Team%20Interest" }]
        },
        {
          title: "Stay Connected",
          text: "Follow our upcoming performances, share our work with your community, or contact us with a collaboration idea.",
          links: []
        }
      ]
    }
  });

  function normalizeLink(link = {}) {
    return {
      label: String(link.label || "Learn more"),
      url: String(link.url || "")
    };
  }

  function normalizePublicSection(section = {}) {
    return {
      title: String(section.title || "Untitled section"),
      text: String(section.text || ""),
      links: Array.isArray(section.links) ? section.links.map(normalizeLink) : []
    };
  }

  function normalize(data = {}) {
    const footer = data.footer || {};
    const publicPage = data.publicPage || {};
    return {
      circleLogoUrl: String(data.circleLogoUrl || ""),
      fullLogoUrl: String(data.fullLogoUrl || ""),
      footer: {
        contactLabel: String(footer.contactLabel || FALLBACK.footer.contactLabel),
        contactEmail: String(footer.contactEmail || FALLBACK.footer.contactEmail),
        copyrightText: String(footer.copyrightText || FALLBACK.footer.copyrightText),
        message: String(footer.message || ""),
        showContact: footer.showContact !== false,
        showLogo: footer.showLogo !== false
      },
      publicPage: {
        intro: String(publicPage.intro || FALLBACK.publicPage.intro),
        sections: Array.isArray(publicPage.sections) && publicPage.sections.length
          ? publicPage.sections.map(normalizePublicSection)
          : FALLBACK.publicPage.sections.map(normalizePublicSection)
      }
    };
  }

  function apply(data) {
    const info = normalize(data);
    if (info.fullLogoUrl) {
      document.querySelectorAll('img[src$="assets/logo/full.webp"], img[data-site-logo="full"]').forEach(img => {
        img.dataset.siteLogo = "full";
        if (img.src !== info.fullLogoUrl) img.src = info.fullLogoUrl;
      });
    }
    if (info.circleLogoUrl) {
      document.querySelectorAll('source[srcset$="assets/logo/circle.webp"], source[data-site-logo="circle"]').forEach(source => {
        source.dataset.siteLogo = "circle";
        source.srcset = info.circleLogoUrl;
      });
    }

    document.querySelectorAll('.footer, .admin-public-footer').forEach(footer => {
      const logo = footer.querySelector('.footer-logo, .admin-footer-logo');
      if (logo) logo.hidden = !info.footer.showLogo;

      const contact = footer.querySelector('.footer-contact, .admin-footer-contact');
      if (contact) {
        contact.hidden = !info.footer.showContact;
        const paragraph = contact.querySelector('p');
        const link = contact.querySelector('a');
        if (paragraph && link) {
          paragraph.childNodes.forEach(node => { if (node.nodeType === Node.TEXT_NODE) node.textContent = ""; });
          paragraph.insertBefore(document.createTextNode(`${info.footer.contactLabel}: `), link);
          link.textContent = info.footer.contactEmail;
          link.href = `mailto:${info.footer.contactEmail}`;
        }
      }

      const bottom = footer.querySelector('.footer-bottom p, .admin-footer-bottom p');
      if (bottom) bottom.textContent = info.footer.copyrightText;

      let message = footer.querySelector('[data-site-footer-message]');
      if (info.footer.message) {
        if (!message) {
          message = document.createElement('p');
          message.dataset.siteFooterMessage = '';
          message.className = 'site-footer-message';
          const container = footer.querySelector('.footer-container, .admin-footer-container');
          const bottomWrap = footer.querySelector('.footer-bottom, .admin-footer-bottom');
          container?.insertBefore(message, bottomWrap || null);
        }
        message.textContent = info.footer.message;
        message.hidden = false;
      } else if (message) message.hidden = true;
    });

    document.dispatchEvent(new CustomEvent('kmc:site-information-applied', { detail: info }));
    return info;
  }

  function completeLoad(data) {
    const info = apply(data);
    lastLoaded = info;
    document.dispatchEvent(new CustomEvent('kmc:site-information-loaded', { detail: info }));
    return info;
  }

  async function load({ force = false } = {}) {
    const store = window.KMCDataStore;
    const cached = !force && store?.cachedValue?.('site-information');
    if (cached) apply(cached);
    const db = window.kmcFirebase?.db;
    if (!db) return completeLoad(cached || FALLBACK);
    try {
      const snap = await db.collection('siteContent').doc('information').get();
      const data = snap.exists ? normalize(snap.data()) : FALLBACK;
      store?.writeCache?.('site-information', data);
      return completeLoad(data);
    } catch (error) {
      console.warn('Site information could not be refreshed:', error);
      return completeLoad(cached || FALLBACK);
    }
  }

  window.KMCSiteInformation = Object.freeze({ load, apply, normalize, fallback: FALLBACK, getLastLoaded: () => lastLoaded });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => load());
  else load();
})();
