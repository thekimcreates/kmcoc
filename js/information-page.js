"use strict";

(() => {
  const page = document.getElementById("information-page");
  const intro = document.getElementById("information-intro");
  const sections = document.getElementById("information-sections");

  function isSafeLink(url) {
    if (!String(url || "").trim()) return false;
    try {
      const parsed = new URL(url, window.location.href);
      return ["https:", "http:", "mailto:"].includes(parsed.protocol);
    } catch (_) {
      return false;
    }
  }

  function makeLink(link) {
    const anchor = document.createElement("a");
    anchor.className = "information-link";
    anchor.textContent = link.label || "Learn more";
    anchor.href = isSafeLink(link.url) ? link.url : "#";
    if (/^https?:/i.test(anchor.href)) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    return anchor;
  }

  function render(data) {
    const content = window.KMCSiteInformation.normalize(data).publicPage;
    intro.textContent = content.intro;
    sections.replaceChildren();

    content.sections.forEach((section, index) => {
      const article = document.createElement("article");
      article.className = "information-card reveal";
      article.style.setProperty("--information-index", index);

      const heading = document.createElement("h2");
      heading.textContent = section.title;
      article.append(heading);

      if (section.text) {
        const copy = document.createElement("p");
        copy.textContent = section.text;
        article.append(copy);
      }

      const validLinks = section.links.filter(link => isSafeLink(link.url));
      if (validLinks.length) {
        const links = document.createElement("div");
        links.className = "information-links";
        validLinks.forEach(link => links.append(makeLink(link)));
        article.append(links);
      }
      sections.append(article);
    });

    page.hidden = false;
  }

  document.addEventListener("kmc:site-information-applied", event => render(event.detail));
  render(window.KMCSiteInformation?.fallback || {});
})();
