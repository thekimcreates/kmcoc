"use strict";

(() => {
    const CACHE_KEY = "kmc-public-team-v4";
    const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 14;

    const fallback = {
        heroImageUrl: "assets/team/team-hero.webp",
        instructorImageUrl: "assets/team/instructor.webp",
        instructorName: "Susanna Hong",
        instructorKoreanName: "홍수잔나",
        teacherMessageKo: "미국 웨스트민스터(Westminster)를 기반으로 활동하는 '한얼 사물놀이'는 홍수잔나(Susanna Hong) 선생님의 지도 아래 한국 전통 예술을 배우고 알리는 청소년 공연팀입니다.\n\n초등학생부터 고등학생까지의 학생들이 함께하며, 단순한 연주를 넘어 한국 문화에 대한 이해와 자긍심을 키워가고 있습니다.\n\n한얼은 꽹과리, 장구, 북, 징이 어우러지는 전통 사물놀이를 중심으로 역동적인 난타, 화려한 오고무, 삼고모 등 다양한 타악 레퍼토리를 선보입니다.\n\nSouth Coast Plaza, Lunar New Year Parade, 지역 축제 등 캘리포니아 곳곳의 무대에서 한국의 아름다움을 알려온 한얼은 공연뿐만 아니라 지역사회를 위한 봉사 활동에도 꾸준히 참여하고 있습니다.\n\n열정과 흥이 넘치는 공연으로 현지 커뮤니티에 한국의 소리를 전하며, 전통의 뿌리 위에 현대적인 감각을 더해 한국 전통 음악이 오늘날에도 살아 숨 쉬는 예술임을 보여주는 청소년 문화 공동체입니다.",
        teacherMessageEn: "Hanul Samulnori, based in Westminster, is a youth performance team that learns and promotes Korean traditional arts under the guidance of instructor Susanna Hong.\n\nStudents from elementary through high school participate, developing a deeper understanding of and pride in Korean culture through performance.\n\nThe team presents traditional samulnori alongside dynamic Nanta, colorful Ogomu, Samgomo, and other percussion repertoire. Through ensemble playing, students learn to listen to one another and create harmony together.\n\nHanul has shared Korean culture at South Coast Plaza, Lunar New Year parades, local festivals, and community events throughout California. The team also participates in volunteer activities that serve the local community.\n\nThrough performances filled with energy and excitement, Hanul brings the sound of Korea to the community while showing that Korean traditional music remains a living art for today’s generation.",
        members: [
            ["Joshua Kim",14,"~9 years"],["Lena Kim",14,"~9 years"],["Ellen Kim",12,"~8 years"],
            ["Rachel Lee",14,"~3 years"],["Jiwoo Yun",13,"~4 years"],["Claire Baek",15,"~2 years"],
            ["Gabrielle Park",15,"~2 years"],["Jaeah Kim",12,"~2 years"],["Kathleen Ahn",13,"~2 years"],
            ["Zoey Kim",11,"~4 years"],["Mason Lee",14,"~2 years"],["Daniel Kim",14,"~3 years"],
            ["Godfrey Kim",13,"~2 years"],["Theodore Kim",16,"~2 years"],["Phillip Kang",11,"~2 years"],
            ["Lucas Baek",12,"~2 years"],["Eillot Park",12,"~2 years"],["Jayden Kim",12,"~2 years"],
            ["Issac Choi",12,"—"],["Jangmin Kee",14,"~2 years"],["Cohen Lee",10,"~1 year"]
        ].map(([name, age, service], order) => ({ name, age, service, order }))
    };

    const stableStringify = value => JSON.stringify(value, (key, val) => {
        if (!val || typeof val !== "object" || Array.isArray(val)) return val;
        return Object.keys(val).sort().reduce((result, itemKey) => {
            result[itemKey] = val[itemKey];
            return result;
        }, {});
    });

    const readCache = () => {
        try {
            const record = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
            if (!record || typeof record !== "object" || !record.data) return null;
            if (Date.now() - Number(record.savedAt || 0) > CACHE_MAX_AGE) return null;
            return record.data;
        } catch {
            return null;
        }
    };

    const writeCache = data => {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
        } catch {
            // Caching is optional; private browsing/storage restrictions must not break the page.
        }
    };

    const sanitizeRichText = html => {
        const template = document.createElement("template");
        template.innerHTML = String(html || "");
        const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A"]);

        const clean = parent => {
            [...parent.childNodes].forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) return;
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    node.remove();
                    return;
                }

                if (!allowedTags.has(node.tagName)) {
                    node.replaceWith(...node.childNodes);
                    return;
                }

                const href = node.tagName === "A" ? String(node.getAttribute("href") || "").trim() : "";
                [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));

                if (node.tagName === "A" && /^(https?:\/\/|mailto:)/i.test(href)) {
                    node.setAttribute("href", href);
                    node.setAttribute("target", "_blank");
                    node.setAttribute("rel", "noopener noreferrer");
                }
                clean(node);
            });
        };

        clean(template.content);
        return template.innerHTML;
    };

    const renderParagraphs = (container, text) => {
        const fragment = document.createDocumentFragment();
        String(text || "")
            .split(/\n\s*\n/)
            .map(paragraph => paragraph.trim())
            .filter(Boolean)
            .forEach(paragraph => {
                const p = document.createElement("p");
                p.textContent = paragraph;
                fragment.appendChild(p);
            });
        container.replaceChildren(fragment);
    };

    const renderMessage = (container, html, plainText) => {
        const safeHtml = sanitizeRichText(html);
        if (safeHtml.trim()) {
            container.innerHTML = safeHtml;
            return;
        }
        renderParagraphs(container, plainText);
    };

    document.addEventListener("DOMContentLoaded", () => {
        const instructorName = document.getElementById("instructor-title");
        const instructorKoreanName = document.getElementById("instructor-korean-name");
        const instructorPhoto = document.getElementById("instructor-photo");
        const koreanMessage = document.getElementById("teacher-message-ko");
        const englishMessage = document.getElementById("teacher-message-en");
        const heroImage = document.getElementById("team-hero-image");
        const koreanToggle = document.getElementById("teacher-message-ko-toggle");
        const englishToggle = document.getElementById("teacher-message-en-toggle");
        const membersGrid = document.getElementById("members-grid");

        if (!instructorName || !instructorKoreanName || !instructorPhoto || !koreanMessage || !englishMessage || !heroImage || !koreanToggle || !englishToggle || !membersGrid) return;

        const setMessageLanguage = language => {
            const korean = language === "ko";
            koreanMessage.hidden = !korean;
            englishMessage.hidden = korean;
            koreanToggle.setAttribute("aria-selected", String(korean));
            englishToggle.setAttribute("aria-selected", String(!korean));
        };
        koreanToggle.addEventListener("click", () => setMessageLanguage("ko"));
        englishToggle.addEventListener("click", () => setMessageLanguage("en"));

        let renderedSignature = "";
        let hasRenderedTeam = false;

        const normalize = source => ({
            ...fallback,
            ...(source || {}),
            members: Array.isArray(source?.members) ? source.members : fallback.members
        });

        const renderTeam = source => {
            const data = normalize(source);
            const signature = stableStringify(data);
            if (signature === renderedSignature) return;
            renderedSignature = signature;
            hasRenderedTeam = true;

            instructorName.textContent = data.instructorName || fallback.instructorName;
            const heroUrl = String(data.heroImageUrl || fallback.heroImageUrl).replace(/["'()\\]/g, "");
            heroImage.style.backgroundImage = `url("${heroUrl}")`;
            heroImage.dataset.imageUrl = heroUrl;
            instructorPhoto.src = String(data.instructorImageUrl || fallback.instructorImageUrl);
            instructorKoreanName.textContent = data.instructorKoreanName || "";
            instructorKoreanName.hidden = !instructorKoreanName.textContent;
            renderMessage(koreanMessage, data.teacherMessageKoHtml, data.teacherMessageKo);
            renderMessage(englishMessage, data.teacherMessageEnHtml, data.teacherMessageEn);

            const members = [...data.members].sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0));
            const fragment = document.createDocumentFragment();

            members.forEach(member => {
                const article = document.createElement("article");
                article.className = "member-card reveal visible";

                const details = document.createElement("div");
                details.className = "member-details";

                const name = document.createElement("h3");
                name.textContent = member?.name || "Member";

                const age = document.createElement("p");
                age.textContent = `Age: ${member?.age ?? "—"}`;

                const service = document.createElement("p");
                service.textContent = `Service: ${member?.service || "—"}`;

                details.append(name, age, service);
                article.appendChild(details);
                fragment.appendChild(article);
            });

            membersGrid.replaceChildren(fragment);
        };

        const cached = readCache();
        // With no cache, keep the loading state in the document until Firestore
        // responds. This prevents the sample member cards flashing before the
        // saved team is rendered on a first visit.
        if (cached) renderTeam(cached);

        const refreshFromFirestore = async () => {
            const dataStore = window.KMCDataStore;
            if (!dataStore) return;

            try {
                const data = await dataStore.getTeam();
                if (!data) {
                    if (!hasRenderedTeam) renderTeam(fallback);
                    return;
                }
                const latest = normalize(data);
                writeCache(latest);
                renderTeam(latest);
            } catch (error) {
                console.error("Unable to refresh team information from Firestore:", error);
                if (!hasRenderedTeam) renderTeam(fallback);
            }
        };

        // Refresh immediately after the cached first paint. Safari may delay idle
        // callbacks for background/restored tabs, so do not depend on them here.
        window.setTimeout(refreshFromFirestore, 0);

        // Safari can restore this page from the back-forward cache without firing
        // DOMContentLoaded again. Always recheck Firestore when the page returns.
        window.addEventListener("pageshow", event => {
            if (event.persisted) refreshFromFirestore();
        });

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") refreshFromFirestore();
        });
    });
})();
