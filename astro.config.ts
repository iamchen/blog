import { defineConfig } from "astro/config";
import { notionMedia } from "./src/integrations/notion-media";
import { readEnv } from "./src/lib/env";

function siteOrigin(): string {
  const value = (readEnv("SITE_URL") ?? "https://iamchen.github.io").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    throw new Error(`SITE_URL 必须以 http:// 或 https:// 开头，收到的是「${value}」。`);
  }
  return value;
}

function basePath(): string {
  const value = readEnv("BASE_PATH") ?? "/blog";
  if (value === "/") return "/";
  const withLead = value.startsWith("/") ? value : `/${value}`;
  return withLead.replace(/\/+$/, "");
}

const base = basePath();

export default defineConfig({
  site: siteOrigin(),
  base,
  output: "static",
  integrations: [notionMedia(base)],
});
