export function getByPath(source, path) {
  return path.split(".").reduce((value, segment) => {
    if (value == null) {
      return undefined;
    }

    if (Array.isArray(value) && /^\d+$/.test(segment)) {
      return value[Number(segment)];
    }

    if (Array.isArray(value) && !/^\d+$/.test(segment)) {
      const byId = value.find((item) => item && typeof item === "object" && item.id === segment);

      if (byId) {
        return byId;
      }
    }

    return value[segment];
  }, source);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBlock(block) {
  if (!block) {
    return "";
  }

  switch (block.type) {
    case "p":
      return `<p>${block.html ?? escapeHtml(block.text ?? "")}</p>`;
    case "sub":
      return `<p class="sub">${escapeHtml(block.text ?? "")}</p>`;
    case "quote":
      return [
        '<blockquote class="patristic">',
        `<p>${block.html ?? escapeHtml(block.text ?? "")}</p>`,
        `<footer class="attribution">${escapeHtml(block.author ?? "")}</footer>`,
        "</blockquote>"
      ].join("");
    default:
      return "";
  }
}

export function renderBlocks(blocks = []) {
  return blocks.map(renderBlock).join("\n");
}

export function renderTocItems(sections = []) {
  return sections
    .map((section) => {
      const label = section.toc ?? section.title ?? "";
      return `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(label)}</a></li>`;
    })
    .join("\n");
}
