import {
  APIResponseError,
  Client,
  collectPaginatedAPI,
  isFullBlock,
  isFullDatabase,
  isFullPage,
  type DataSourceObjectResponse,
  type PageObjectResponse,
} from "@notionhq/client";
import { rmSync } from "node:fs";
import { mediaCacheDir } from "./media";
import { renderBlocks, type NotionNode } from "./render";
import type { Post } from "./types";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const propertyTypes: Record<string, readonly string[]> = {
  Title: ["title"],
  Slug: ["rich_text"],
  Status: ["select", "status"],
  Published: ["date"],
  Summary: ["rich_text"],
  Tags: ["multi_select"],
};

function plain(items: Array<{ plain_text: string }> | undefined): string {
  return (items ?? []).map((item) => item.plain_text).join("").trim();
}

function explainNotionError(error: unknown): string {
  if (APIResponseError.isAPIResponseError(error)) {
    if (error.code === "unauthorized") {
      return "Notion 拒绝了 NOTION_TOKEN。请核对集成密钥。";
    }
    if (error.code === "object_not_found" || error.code === "restricted_resource") {
      return "找不到这个数据库，或集成没有访问权限。打开数据库，在「连接」里邀请该集成。";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function assertSchema(properties: DataSourceObjectResponse["properties"]): void {
  for (const [name, types] of Object.entries(propertyTypes)) {
    const property = properties[name];
    if (!property) {
      throw new Error(`数据源缺少属性「${name}」。`);
    }
    if (!types.includes(property.type)) {
      throw new Error(`属性「${name}」的类型是 ${property.type}，需要 ${types.join(" 或 ")}。`);
    }
  }
}

function publishedFilter(statusType: string) {
  if (statusType === "select") {
    return { property: "Status", select: { equals: "Published" } };
  }
  if (statusType === "status") {
    return { property: "Status", status: { equals: "Published" } };
  }
  throw new Error(`属性 Status 的类型是 ${statusType}，需要 select 或 status。`);
}

function hasBlogProperties(properties: DataSourceObjectResponse["properties"] | undefined): boolean {
  if (!properties) return false;
  return Boolean(properties.Title && properties.Slug && properties.Status);
}

async function resolveDataSourceId(notion: Client, databaseId: string): Promise<string> {
  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });
    if (!isFullDatabase(database)) {
      throw new Error("Notion 没有返回完整的数据库信息。");
    }
    if (database.data_sources.length === 0) {
      throw new Error("这个数据库下面没有 data source。");
    }
    if (database.data_sources.length === 1) {
      const only = database.data_sources[0];
      if (!only) throw new Error("这个数据库下面没有 data source。");
      return only.id;
    }
    for (const source of database.data_sources) {
      const retrieved = await notion.dataSources.retrieve({ data_source_id: source.id });
      if (hasBlogProperties(retrieved.properties)) return source.id;
    }
    const first = database.data_sources[0];
    if (!first) throw new Error("这个数据库下面没有 data source。");
    return first.id;
  } catch (error) {
    if (APIResponseError.isAPIResponseError(error) && error.code === "object_not_found") {
      await notion.dataSources.retrieve({ data_source_id: databaseId });
      return databaseId;
    }
    throw error;
  }
}

function readTitle(page: PageObjectResponse): string {
  const property = page.properties.Title;
  if (!property || property.type !== "title") return "";
  return plain(property.title);
}

function readSlug(page: PageObjectResponse): string {
  const property = page.properties.Slug;
  const title = readTitle(page) || page.id;
  if (!property || property.type !== "rich_text") {
    throw new Error(`已发布页面「${title}」缺少 Slug。`);
  }
  const slug = plain(property.rich_text);
  if (!slugPattern.test(slug)) {
    throw new Error(`已发布页面「${title}」的 Slug「${slug}」无效。只能使用小写字母、数字和连字符。`);
  }
  return slug;
}

function readSummary(page: PageObjectResponse): string {
  const property = page.properties.Summary;
  if (!property || property.type !== "rich_text") return "";
  return plain(property.rich_text);
}

function readTags(page: PageObjectResponse): string[] {
  const property = page.properties.Tags;
  if (!property || property.type !== "multi_select") return [];
  return property.multi_select.map((tag) => tag.name);
}

function readPublished(page: PageObjectResponse): string | null {
  const property = page.properties.Published;
  if (!property || property.type !== "date" || !property.date) return null;
  return property.date.start;
}

function readStatus(page: PageObjectResponse): string | null {
  const property = page.properties.Status;
  if (!property) return null;
  if (property.type === "select") return property.select?.name ?? null;
  if (property.type === "status") return property.status?.name ?? null;
  return null;
}

async function loadBlockTree(notion: Client, blockId: string, depth: number): Promise<NotionNode[]> {
  if (depth > 8) return [];
  const results = await collectPaginatedAPI(notion.blocks.children.list, {
    block_id: blockId,
  });
  const nodes: NotionNode[] = [];
  for (const result of results) {
    if (!isFullBlock(result) || result.in_trash) continue;
    const skipChildren = result.type === "child_page" || result.type === "child_database";
    const children =
      result.has_children && !skipChildren ? await loadBlockTree(notion, result.id, depth + 1) : [];
    nodes.push({ block: result, children });
  }
  return nodes;
}

function sortPosts(posts: Post[]): Post[] {
  return posts.sort((left, right) => {
    if (left.published && right.published && left.published !== right.published) {
      return left.published < right.published ? 1 : -1;
    }
    if (left.published && !right.published) return -1;
    if (!left.published && right.published) return 1;
    return left.title.localeCompare(right.title, "zh");
  });
}

export async function fetchPublishedPosts(token: string, databaseId: string): Promise<Post[]> {
  if (!/^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)) {
    throw new Error("NOTION_DATABASE_ID 不是有效的 Notion ID。");
  }

  const notion = new Client({ auth: token });
  try {
    const dataSourceId = await resolveDataSourceId(notion, databaseId);
    const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
    const properties = dataSource.properties;
    if (!properties) throw new Error("数据源没有属性定义。");
    assertSchema(properties);
    const status = properties.Status;
    if (!status) throw new Error("数据源缺少属性「Status」。");

    rmSync(mediaCacheDir, { recursive: true, force: true });
    const rows = await collectPaginatedAPI(notion.dataSources.query, {
      data_source_id: dataSourceId,
      filter: publishedFilter(status.type),
      sorts: [{ property: "Published", direction: "descending" }],
      result_type: "page",
    });

    const posts: Post[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!isFullPage(row)) {
        if (row.object === "page") throw new Error(`Notion 返回了不完整的页面 ${row.id}。`);
        continue;
      }
      if (row.in_trash) continue;
      if (readStatus(row) !== "Published") continue;
      const slug = readSlug(row);
      if (seen.has(slug)) throw new Error(`已发布文章的 Slug「${slug}」重复。`);
      seen.add(slug);
      const title = readTitle(row);
      if (!title) throw new Error(`已发布页面「${slug}」缺少 Title。`);
      const tree = await loadBlockTree(notion, row.id, 0);
      posts.push({
        id: row.id,
        title,
        slug,
        summary: readSummary(row),
        tags: readTags(row),
        published: readPublished(row),
        html: await renderBlocks(tree),
      });
    }
    return sortPosts(posts);
  } catch (error) {
    const detail = explainNotionError(error);
    throw new Error(`Notion 读取失败，构建已中止，不会改用本地示例文章。${detail}`, { cause: error });
  }
}
