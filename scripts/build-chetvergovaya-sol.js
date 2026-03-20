import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { escapeHtml, renderBlocks, renderTocItems } from "../assets/js/i18n-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
function outputPathForLocale(pageId, localeCode, defaultLocale) {
  if (localeCode === defaultLocale) {
    return path.join(rootDir, `${pageId}.html`);
  }

  return path.join(rootDir, localeCode, `${pageId}.html`);
}

function assetPrefixForLocale(localeCode, defaultLocale) {
  return localeCode === defaultLocale ? "assets" : "../assets";
}

function hrefForLocale(pageId, currentLocale, targetLocale, defaultLocale) {
  if (currentLocale === defaultLocale) {
    return targetLocale === defaultLocale
      ? `${pageId}.html`
      : `${targetLocale}/${pageId}.html`;
  }

  if (targetLocale === currentLocale) {
    return `${pageId}.html`;
  }

  if (targetLocale === defaultLocale) {
    return `../${pageId}.html`;
  }

  return `../${targetLocale}/${pageId}.html`;
}

function renderAlternateLinks({ pageId, locales, currentLocale, defaultLocale }) {
  const links = locales
    .map((locale) => {
      const href = hrefForLocale(pageId, currentLocale, locale.code, defaultLocale);
      return `  <link rel="alternate" hreflang="${locale.code}" href="${href}">`;
    })
    .join("\n");

  const xDefaultHref = hrefForLocale(pageId, currentLocale, defaultLocale, defaultLocale);

  return `${links}\n  <link rel="alternate" hreflang="x-default" href="${xDefaultHref}">`;
}

function renderLanguageSwitcher({ pageId, translation, locales, currentLocale, defaultLocale }) {
  const items = locales
    .map((locale) => {
      const href = hrefForLocale(pageId, currentLocale, locale.code, defaultLocale);
      const current = locale.code === currentLocale;
      const currentAttr = current ? ' aria-current="page"' : "";
      const selectedClass = current ? " language-switcher__link--current" : "";

      return [
        '          <li class="language-switcher__item">',
        `            <a class="language-switcher__link${selectedClass}" href="${href}" lang="${locale.code}" hreflang="${locale.code}" data-locale="${locale.code}" aria-label="${escapeHtml(locale.nativeName)}"${currentAttr}>`,
        `              <span class="language-switcher__code">${escapeHtml(locale.short)}</span>`,
        `              <span class="visually-hidden">${escapeHtml(locale.nativeName)}</span>`,
        "            </a>",
        "          </li>"
      ].join("\n");
    })
    .join("\n");

  return [
    `        <nav class="language-switcher" aria-label="${escapeHtml(translation.switcher.aria_label)}" data-i18n-attr="aria-label:switcher.aria_label">`,
    `          <p class="language-switcher__eyebrow" data-i18n="switcher.label">${escapeHtml(translation.switcher.label)}</p>`,
    '          <ul class="language-switcher__list">',
    items,
    "          </ul>",
    "        </nav>"
  ].join("\n");
}

function renderSections(translation) {
  return translation.sections
    .map((section, index) => {
      const sectionHtml = [
        `        <section class="section" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title" data-section-id="${escapeHtml(section.id)}">`,
        '          <header class="section-header">',
        `            <span class="section-num" aria-hidden="true" data-i18n="sections.${section.id}.number">${escapeHtml(section.number)}</span>`,
        `            <h2 class="section-title" id="${escapeHtml(section.id)}-title" data-i18n="sections.${section.id}.title">${escapeHtml(section.title)}</h2>`,
        "          </header>",
        `          <div class="section-body" data-i18n-render="section-body" data-section-id="${escapeHtml(section.id)}">`,
        renderBlocks(section.blocks)
          .split("\n")
          .map((line) => `            ${line}`)
          .join("\n"),
        "          </div>",
        "        </section>"
      ].join("\n");

      if (index === translation.sections.length - 1) {
        return sectionHtml;
      }

      return `${sectionHtml}\n\n        <div class="divider" aria-hidden="true"><span class="divider-sym">${escapeHtml(
        translation.header.ornament.trim().charAt(0) || "✦"
      )}</span></div>`;
    })
    .join("\n\n");
}

function renderPage({ pageId, translation, locales, currentLocale, defaultLocale }) {
  const assetPrefix = assetPrefixForLocale(currentLocale, defaultLocale);
  const translationSource = `${assetPrefix}/i18n/pages/${pageId}/${translation.locale}.json`;
  const canonicalHref = hrefForLocale(pageId, currentLocale, currentLocale, defaultLocale);
  const sectionsHtml = renderSections(translation);
  const alternateLinks = renderAlternateLinks({ pageId, locales, currentLocale, defaultLocale });
  const switcher = renderLanguageSwitcher({ pageId, translation, locales, currentLocale, defaultLocale });
  const tocItems = renderTocItems(translation.sections);

  return `<!DOCTYPE html>
<html lang="${translation.locale}" data-page-id="${pageId}" data-page-locale="${translation.locale}" data-default-locale="${defaultLocale}" data-i18n-source="${translationSource}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title data-i18n="meta.title">${escapeHtml(translation.meta.title)}</title>
  <meta name="description" content="${escapeHtml(translation.meta.description)}" data-i18n-attr="content:meta.description">
  <meta name="robots" content="index, follow">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="theme-color" content="#1c1410">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests">
  <link rel="canonical" href="${canonicalHref}">
${alternateLinks}
  <meta property="og:locale" content="${escapeHtml(translation.meta.og_locale)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeHtml(translation.meta.site_name)}" data-i18n-attr="content:meta.site_name">
  <meta property="og:title" content="${escapeHtml(translation.meta.title)}" data-i18n-attr="content:meta.title">
  <meta property="og:description" content="${escapeHtml(translation.meta.og_description)}" data-i18n-attr="content:meta.og_description">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(translation.meta.title)}" data-i18n-attr="content:meta.title">
  <meta name="twitter:description" content="${escapeHtml(translation.meta.twitter_description)}" data-i18n-attr="content:meta.twitter_description">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${assetPrefix}/css/chetvergovaya-sol.css">
  <script type="module" src="${assetPrefix}/js/i18n.js"></script>
</head>
<body>
  <article class="article-page" itemscope itemtype="https://schema.org/Article">
    <meta itemprop="inLanguage" content="${translation.locale}">

    <header class="site-header" aria-labelledby="page-title">
      <div class="header-shell">
${switcher}
        <span class="header-ornament" aria-hidden="true" data-i18n="header.ornament">${escapeHtml(translation.header.ornament)}</span>
        <h1 class="site-title" id="page-title" itemprop="headline" data-i18n-html="header.title_html">${translation.header.title_html}</h1>
        <p class="header-subtitle" data-i18n="header.subtitle">${escapeHtml(translation.header.subtitle)}</p>
        <div class="header-rule" aria-hidden="true"></div>
      </div>
    </header>

    <main class="article-wrap" id="main-content">
      <p class="intro-block" itemprop="description" data-i18n="intro">${escapeHtml(translation.intro)}</p>

      <nav class="toc" aria-label="${escapeHtml(translation.toc.aria_label)}" data-i18n-attr="aria-label:toc.aria_label">
        <h2 class="toc-title" data-i18n="toc.title">${escapeHtml(translation.toc.title)}</h2>
        <ol data-i18n-render="toc">
${tocItems
  .split("\n")
  .map((line) => `          ${line}`)
  .join("\n")}
        </ol>
      </nav>

      <div itemprop="articleBody">
${sectionsHtml}

        <section class="closing" aria-label="${escapeHtml(translation.closing.aria_label)}" data-i18n-attr="aria-label:closing.aria_label">
          <span class="closing-cross" aria-hidden="true">${escapeHtml(translation.closing.symbol)}</span>
          <p class="call-strong" data-i18n="closing.lead">${escapeHtml(translation.closing.lead)}</p>
          <p data-i18n="closing.text">${escapeHtml(translation.closing.text)}</p>
          <p class="final-line" data-i18n-html="closing.final_html">${translation.closing.final_html}</p>
        </section>
      </div>
    </main>

    <footer class="site-footer" itemscope itemprop="publisher" itemtype="https://schema.org/Organization">
      <p><span itemprop="name" data-i18n="footer.name">${escapeHtml(translation.footer.name)}</span> &nbsp;·&nbsp; <span data-i18n="footer.context">${escapeHtml(translation.footer.context)}</span></p>
    </footer>
  </article>
</body>
</html>
`;
}

async function main() {
  const localesConfigPath = path.join(rootDir, "assets", "i18n", "site.locales.json");
  const localesConfig = JSON.parse(await readFile(localesConfigPath, "utf8"));
  const defaultLocale = localesConfig.defaultLocale;
  const locales = localesConfig.locales;
  const pagesRoot = path.join(rootDir, "assets", "i18n", "pages");
  const pageDirs = (await readdir(pagesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const pageId of pageDirs) {
    const pagePath = path.join(pagesRoot, pageId);
    const translationsModulePath = path.join(pagePath, "translations.js");
    let moduleTranslations = null;

    try {
      await access(translationsModulePath);
      const loaded = await import(pathToFileURL(translationsModulePath).href);
      moduleTranslations = loaded.default ?? null;
    } catch {
      moduleTranslations = null;
    }

    await Promise.all(
      locales.map(async (locale) => {
        const translationPath = path.join(pagesRoot, pageId, `${locale.code}.json`);
        let translation;

        if (moduleTranslations?.[locale.code]) {
          translation = moduleTranslations[locale.code];
          await writeFile(translationPath, `${JSON.stringify(translation, null, 2)}\n`, "utf8");
        } else {
          translation = JSON.parse(await readFile(translationPath, "utf8"));
        }

        const outputPath = outputPathForLocale(pageId, locale.code, defaultLocale);

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(
          outputPath,
          renderPage({
            pageId,
            translation,
            locales,
            currentLocale: locale.code,
            defaultLocale
          }),
          "utf8"
        );
      })
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
