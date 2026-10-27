import type { AstroIntegration } from "astro";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediaCacheDir } from "../lib/media";
import { prefetchPosts } from "../lib/posts";

const mimeTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

function safeFilename(value: string): string | null {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!/^[a-zA-Z0-9]+\.[a-z0-9]+$/.test(decoded)) return null;
  return decoded;
}

export function notionMedia(base: string): AstroIntegration {
  const prefix = `${base === "/" ? "" : base}/media/`;
  return {
    name: "notion-media",
    hooks: {
      "astro:build:start": async () => {
        await prefetchPosts();
      },
      "astro:server:setup": async ({ server }) => {
        await prefetchPosts();
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0] ?? "";
          if (!url.startsWith(prefix)) {
            next();
            return;
          }
          const filename = safeFilename(url.slice(prefix.length));
          if (!filename) {
            next();
            return;
          }
          const file = path.join(mediaCacheDir, filename);
          if (!existsSync(file) || !statSync(file).isFile()) {
            next();
            return;
          }
          const extension = path.extname(filename).slice(1);
          res.statusCode = 200;
          res.setHeader("Content-Type", mimeTypes[extension] ?? "application/octet-stream");
          createReadStream(file).pipe(res);
        });
      },
      "astro:build:done": ({ dir }) => {
        if (!existsSync(mediaCacheDir)) return;
        const destination = path.join(fileURLToPath(dir), "media");
        for (const filename of readdirSync(mediaCacheDir)) {
          const source = path.join(mediaCacheDir, filename);
          if (!statSync(source).isFile()) continue;
          mkdirSync(destination, { recursive: true });
          copyFileSync(source, path.join(destination, filename));
        }
      },
    },
  };
}
