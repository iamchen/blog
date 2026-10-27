import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readEnv, projectRoot } from "./env";
import { fixturePosts } from "./fixtures";
import { mediaCacheDir } from "./media";
import { fetchPublishedPosts } from "./notion";
import type { Post } from "./types";

const postsCacheFile = path.join(projectRoot, ".cache", "posts.json");

type DiskCache = {
  pid: number;
  posts: Post[];
};

function readCache(): Post[] | undefined {
  try {
    const parsed = JSON.parse(readFileSync(postsCacheFile, "utf8")) as DiskCache;
    if (parsed.pid !== process.pid || !Array.isArray(parsed.posts)) return undefined;
    return parsed.posts;
  } catch {
    return undefined;
  }
}

function writeCache(posts: Post[]): void {
  mkdirSync(path.dirname(postsCacheFile), { recursive: true });
  const payload: DiskCache = { pid: process.pid, posts };
  writeFileSync(postsCacheFile, JSON.stringify(payload));
}

async function loadPosts(): Promise<Post[]> {
  const token = readEnv("NOTION_TOKEN");
  if (!token) {
    const posts = fixturePosts();
    console.info(`[blog] 未设置 NOTION_TOKEN，使用本地示例文章 ${posts.length} 篇。`);
    return posts;
  }

  const databaseId = readEnv("NOTION_DATABASE_ID");
  if (!databaseId) {
    throw new Error(
      "已设置 NOTION_TOKEN，但没有 NOTION_DATABASE_ID。构建已中止，避免用示例文章代替 Notion 内容。",
    );
  }

  const posts = await fetchPublishedPosts(token, databaseId);
  console.info(`[blog] 已从 Notion 读取 ${posts.length} 篇已发布文章。`);
  return posts;
}

export async function prefetchPosts(): Promise<void> {
  rmSync(mediaCacheDir, { recursive: true, force: true });
  rmSync(postsCacheFile, { force: true });
  writeCache(await loadPosts());
}

export async function getPosts(): Promise<Post[]> {
  const cached = readCache();
  if (cached) return cached;
  const posts = await loadPosts();
  writeCache(posts);
  return posts;
}
