import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./env";

export const mediaCacheDir = path.join(projectRoot, ".cache", "notion-media");

const rasterExtensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const maxBytes = 15 * 1024 * 1024;

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function storeImage(url: string, blockId: string): Promise<string | null> {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return null;

  let response: Response;
  try {
    response = await fetch(safeUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[blog] 图片下载失败（${blockId}）：${detail}`);
    return null;
  }

  if (!response.ok) {
    console.warn(`[blog] 图片下载失败（${blockId}）：HTTP ${response.status}`);
    return null;
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = rasterExtensions[contentType];
  if (!extension) return null;

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxBytes) {
    console.warn(`[blog] 跳过过大或空的图片（${blockId}）。`);
    return null;
  }

  mkdirSync(mediaCacheDir, { recursive: true });
  const filename = `${blockId.replace(/[^a-zA-Z0-9]/g, "")}.${extension}`;
  writeFileSync(path.join(mediaCacheDir, filename), bytes);
  return filename;
}
