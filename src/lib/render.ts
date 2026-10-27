import type { BlockObjectResponse, RichTextItemResponse } from "@notionhq/client";
import { readEnv } from "./env";
import { safeHttpUrl, storeImage } from "./media";

type NotionNode = {
  block: BlockObjectResponse;
  children: NotionNode[];
};

const headingTag: Record<"heading_1" | "heading_2" | "heading_3" | "heading_4", string> = {
  heading_1: "h2",
  heading_2: "h3",
  heading_3: "h4",
  heading_4: "h5",
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("mailto:")) {
    if (trimmed.toLowerCase().includes("javascript:")) return null;
    return trimmed;
  }
  return safeHttpUrl(trimmed);
}

function renderRichText(items: RichTextItemResponse[]): string {
  return items
    .map((item) => {
      let html = escapeHtml(item.plain_text).replaceAll("\n", "<br />");
      const { bold, italic, strikethrough, underline, code, color } = item.annotations;
      if (code) html = `<code>${html}</code>`;
      if (bold) html = `<strong>${html}</strong>`;
      if (italic) html = `<em>${html}</em>`;
      if (strikethrough) html = `<s>${html}</s>`;
      if (underline) html = `<u>${html}</u>`;
      if (color && color !== "default") html = `<span class="rt rt-${color}">${html}</span>`;
      if (item.href) {
        const href = safeHref(item.href);
        if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
      }
      return html;
    })
    .join("");
}

function plainText(items: RichTextItemResponse[]): string {
  return items.map((item) => item.plain_text).join("");
}

function languageClass(language: string): string {
  const normalized = language.toLowerCase().replace(/[^a-z0-9+-]+/g, "");
  if (!normalized || normalized === "plaintext") return "";
  return ` class="language-${normalized}"`;
}

function mediaPublicPath(filename: string): string {
  const raw = readEnv("BASE_PATH") ?? "/blog";
  if (raw === "/") return `/media/${filename}`;
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return `${withLead.replace(/\/+$/, "")}/media/${filename}`;
}

function hostedUrl(
  media:
    | { type: "external"; external: { url: string } }
    | { type: "file"; file: { url: string } },
): string {
  return media.type === "external" ? media.external.url : media.file.url;
}

function fileLink(url: string, label: string, caption: RichTextItemResponse[]): string {
  const href = safeHref(url);
  const captionHtml = renderRichText(caption);
  if (!href) return captionHtml ? `<p>${captionHtml}</p>` : "";
  return `<p class="file-link"><a href="${escapeHtml(href)}">${escapeHtml(label)}</a>${captionHtml ? ` <span class="caption">${captionHtml}</span>` : ""}</p>`;
}

const usedHeadingIds = new Map<string, number>();

function headingId(text: string): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]+/gu, "")
      .replace(/^-+|-+$/g, "") || "section";
  const seen = usedHeadingIds.get(base) ?? 0;
  usedHeadingIds.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen}`;
}

function listInner(node: NotionNode): string {
  const { block } = node;
  if (block.type === "bulleted_list_item") return renderRichText(block.bulleted_list_item.rich_text);
  if (block.type === "numbered_list_item") return renderRichText(block.numbered_list_item.rich_text);
  if (block.type === "to_do") {
    const checked = block.to_do.checked ? " checked" : "";
    const label = block.to_do.checked ? "已完成" : "未完成";
    return `<input type="checkbox" disabled${checked} aria-label="${label}" /> ${renderRichText(block.to_do.rich_text)}`;
  }
  return "";
}

async function renderNodes(nodes: NotionNode[]): Promise<string> {
  const parts: string[] = [];
  let index = 0;
  while (index < nodes.length) {
    const type = nodes[index]?.block.type;
    if (type === "bulleted_list_item" || type === "numbered_list_item" || type === "to_do") {
      const items: string[] = [];
      let start: number | undefined;
      while (index < nodes.length && nodes[index]?.block.type === type) {
        const current = nodes[index];
        if (!current) break;
        if (type === "numbered_list_item" && current.block.type === "numbered_list_item" && start === undefined) {
          const startIndex = current.block.numbered_list_item.list_start_index;
          if (typeof startIndex === "number" && startIndex > 1) start = startIndex;
        }
        const children = current.children.length ? await renderNodes(current.children) : "";
        items.push(`<li>${listInner(current)}${children}</li>`);
        index += 1;
      }
      const tag = type === "numbered_list_item" ? "ol" : "ul";
      const classAttr = type === "to_do" ? ' class="todo"' : "";
      const startAttr = start ? ` start="${start}"` : "";
      parts.push(`<${tag}${classAttr}${startAttr}>${items.join("")}</${tag}>`);
      continue;
    }
    const node = nodes[index];
    if (node) parts.push(await renderNode(node));
    index += 1;
  }
  return parts.join("\n");
}

async function renderNode(node: NotionNode): Promise<string> {
  const { block } = node;
  switch (block.type) {
    case "paragraph": {
      const html = renderRichText(block.paragraph.rich_text);
      const children = node.children.length ? await renderNodes(node.children) : "";
      if (!html && !children) return "";
      return `${html ? `<p>${html}</p>` : ""}${children}`;
    }
    case "heading_1":
    case "heading_2":
    case "heading_3":
    case "heading_4": {
      const data =
        block.type === "heading_1"
          ? block.heading_1
          : block.type === "heading_2"
            ? block.heading_2
            : block.type === "heading_3"
              ? block.heading_3
              : block.heading_4;
      const tag = headingTag[block.type];
      const html = renderRichText(data.rich_text);
      const id = headingId(plainText(data.rich_text));
      const children = node.children.length ? await renderNodes(node.children) : "";
      if (data.is_toggleable && children) {
        return `<details class="toggle"><summary><${tag} id="${id}">${html}</${tag}></summary>${children}</details>`;
      }
      return `<${tag} id="${id}">${html}</${tag}>${children}`;
    }
    case "quote": {
      const html = renderRichText(block.quote.rich_text);
      const children = node.children.length ? await renderNodes(node.children) : "";
      return `<blockquote>${html ? `<p>${html}</p>` : ""}${children}</blockquote>`;
    }
    case "callout": {
      const html = renderRichText(block.callout.rich_text);
      const icon = block.callout.icon?.type === "emoji" ? block.callout.icon.emoji : "";
      const children = node.children.length ? await renderNodes(node.children) : "";
      return `<aside class="callout">${icon ? `<span class="callout-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ""}<div>${html ? `<p>${html}</p>` : ""}${children}</div></aside>`;
    }
    case "toggle": {
      const summary = renderRichText(block.toggle.rich_text) || "展开";
      const children = await renderNodes(node.children);
      return `<details class="toggle"><summary>${summary}</summary>${children}</details>`;
    }
    case "code": {
      const code = escapeHtml(plainText(block.code.rich_text));
      const caption = renderRichText(block.code.caption);
      return `<figure class="code-block"><pre><code${languageClass(block.code.language)}>${code}</code></pre>${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
    }
    case "equation":
      return `<p class="equation"><code>${escapeHtml(block.equation.expression)}</code></p>`;
    case "divider":
      return "<hr />";
    case "image": {
      const caption = renderRichText(block.image.caption);
      const alt = plainText(block.image.caption).trim() || "图片";
      const source = hostedUrl(block.image);
      const stored = await storeImage(source, block.id);
      const src = stored ? mediaPublicPath(stored) : safeHref(source);
      if (!src) return caption ? `<p>${caption}</p>` : "";
      return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
    }
    case "bookmark":
    case "embed": {
      const data = block.type === "bookmark" ? block.bookmark : block.embed;
      const href = safeHref(data.url);
      const caption = renderRichText(data.caption);
      if (!href) return caption ? `<p>${caption}</p>` : "";
      const label = caption || escapeHtml(href);
      return `<p class="bookmark"><a href="${escapeHtml(href)}">${label}</a></p>`;
    }
    case "video":
      return fileLink(hostedUrl(block.video), "视频", block.video.caption);
    case "audio":
      return fileLink(hostedUrl(block.audio), "音频", block.audio.caption);
    case "pdf":
      return fileLink(hostedUrl(block.pdf), "PDF", block.pdf.caption);
    case "file":
      return fileLink(hostedUrl(block.file), block.file.name || "文件", block.file.caption);
    case "table": {
      const rows = node.children.flatMap((child) =>
        child.block.type === "table_row" ? [child.block.table_row.cells] : [],
      );
      if (rows.length === 0) return "";
      const header = block.table.has_column_header;
      const rowHeader = block.table.has_row_header;
      const renderRow = (cells: RichTextItemResponse[][], cellTag: "th" | "td", markRowHeader: boolean) =>
        `<tr>${cells
          .map((cell, cellIndex) => {
            const tag = markRowHeader && cellIndex === 0 ? "th" : cellTag;
            return `<${tag}>${renderRichText(cell)}</${tag}>`;
          })
          .join("")}</tr>`;
      const head = header ? `<thead>${renderRow(rows[0] ?? [], "th", false)}</thead>` : "";
      const bodyRows = header ? rows.slice(1) : rows;
      const body = bodyRows.map((cells) => renderRow(cells, "td", rowHeader)).join("");
      return `<div class="table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`;
    }
    case "column_list":
      return `<div class="columns">${await renderNodes(node.children)}</div>`;
    case "column":
      return `<div class="column">${await renderNodes(node.children)}</div>`;
    case "synced_block":
      return renderNodes(node.children);
    case "child_page":
      return `<p class="child-ref">${escapeHtml(block.child_page.title)}</p>`;
    case "child_database":
      return `<p class="child-ref">${escapeHtml(block.child_database.title)}</p>`;
    default:
      return node.children.length ? renderNodes(node.children) : "";
  }
}

export async function renderBlocks(nodes: NotionNode[]): Promise<string> {
  usedHeadingIds.clear();
  return renderNodes(nodes);
}

export type { NotionNode };
