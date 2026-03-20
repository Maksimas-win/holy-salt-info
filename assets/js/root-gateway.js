const links = document.querySelectorAll("[data-root-locale]");

for (const link of links) {
  const locale = link.dataset.rootLocale;

  try {
    if (localStorage.getItem("site-locale") === locale) {
      link.classList.add("language-switcher__link--current");
    }
  } catch {
    // Ignore storage restrictions.
  }

  link.addEventListener("click", () => {
    try {
      localStorage.setItem("site-locale", locale);
    } catch {
      // Ignore storage restrictions.
    }
  });
}
