import { getByPath, renderBlocks, renderTocItems } from "./i18n-core.js";

const root = document.documentElement;

function applySimpleTranslations(dictionary) {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const value = getByPath(dictionary, node.dataset.i18n);

    if (typeof value === "string") {
      node.textContent = value;
    }
  });
}

function applyHtmlTranslations(dictionary) {
  document.querySelectorAll("[data-i18n-html]").forEach((node) => {
    const value = getByPath(dictionary, node.dataset.i18nHtml);

    if (typeof value === "string") {
      node.innerHTML = value;
    }
  });
}

function applyAttributeTranslations(dictionary) {
  document.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    const mappings = node.dataset.i18nAttr
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean);

    mappings.forEach((mapping) => {
      const [attribute, key] = mapping.split(":");
      const value = getByPath(dictionary, key);

      if (typeof value === "string") {
        node.setAttribute(attribute, value);
      }
    });
  });
}

function applyRenderedContent(dictionary) {
  const tocNode = document.querySelector('[data-i18n-render="toc"]');

  if (tocNode && Array.isArray(dictionary.sections)) {
    tocNode.innerHTML = renderTocItems(dictionary.sections);
  }

  document.querySelectorAll('[data-i18n-render="section-body"]').forEach((node) => {
    const sectionId = node.dataset.sectionId;
    const section = dictionary.sections?.find((item) => item.id === sectionId);

    if (section?.blocks) {
      node.innerHTML = renderBlocks(section.blocks);
    }
  });
}

function applyStructuredMeta(dictionary) {
  const inLanguage = document.querySelector('meta[itemprop="inLanguage"]');

  if (inLanguage && dictionary.locale) {
    inLanguage.setAttribute("content", dictionary.locale);
  }

  if (dictionary.locale) {
    root.lang = dictionary.locale;
  }

  if (typeof dictionary.meta?.title === "string") {
    document.title = dictionary.meta.title;
  }
}

function setStoredLocale(locale) {
  try {
    localStorage.setItem("site-locale", locale);
  } catch {
    // Ignore storage restrictions gracefully.
  }
}

function getStoredLocale() {
  try {
    return localStorage.getItem("site-locale");
  } catch {
    return null;
  }
}

function maybeRedirectToStoredLocale() {
  const currentLocale = root.dataset.pageLocale;
  const savedLocale = getStoredLocale();

  if (!savedLocale || savedLocale === currentLocale) {
    return;
  }

  const hasExplicitLangParam = new URLSearchParams(window.location.search).has("lang");

  if (hasExplicitLangParam) {
    return;
  }

  const redirectKey = "site-locale-redirect";

  try {
    if (sessionStorage.getItem(redirectKey) === savedLocale) {
      return;
    }
  } catch {
    // Ignore session storage restrictions gracefully.
  }

  const link = document.querySelector(`.language-switcher__link[data-locale="${savedLocale}"]`);

  if (!link) {
    return;
  }

  try {
    sessionStorage.setItem(redirectKey, savedLocale);
  } catch {
    // Ignore session storage restrictions gracefully.
  }

  window.location.replace(link.href);
}

function enhanceLanguageSwitcher() {
  document.querySelectorAll(".language-switcher__link").forEach((link) => {
    link.addEventListener("click", () => {
      setStoredLocale(link.dataset.locale);
    });
  });
}

async function loadDictionary() {
  const source = root.dataset.i18nSource;

  if (!source) {
    return null;
  }

  try {
    const response = await fetch(source, { credentials: "same-origin" });

    if (!response.ok) {
      throw new Error(`Unable to load translation: ${response.status}`);
    }

    return await response.json();
  } catch {
    return null;
  }
}

async function initI18n() {
  enhanceLanguageSwitcher();
  maybeRedirectToStoredLocale();

  const dictionary = await loadDictionary();

  if (!dictionary) {
    return;
  }

  applyStructuredMeta(dictionary);
  applySimpleTranslations(dictionary);
  applyHtmlTranslations(dictionary);
  applyAttributeTranslations(dictionary);
  applyRenderedContent(dictionary);
}

initI18n();
