# iamchen's blog

用 Astro 生成的个人静态博客。文章放在 Notion 数据库里，推送到 `main` 后由 GitHub Actions 构建，并发布到 GitHub Pages。

线上地址：<https://iamchen.github.io/blog/>

站点标题在 [`src/config.ts`](src/config.ts)，当前是 **iamchen's blog**。

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

开发服务器带有站点前缀，首页是 <http://localhost:4321/blog/>。

`.env` 已在 `.gitignore` 里，不要把真实密钥提交进仓库。没有 `NOTION_TOKEN` 时也可以直接构建，这时会使用 [`src/lib/fixtures.ts`](src/lib/fixtures.ts) 里的两篇示例（slug：`hello`、`how-to-update`）。

```bash
npm run build
npm run preview
```

| 脚本 | 作用 |
| --- | --- |
| `npm run dev` | 本地预览 |
| `npm run build` | 生成 `dist/` |
| `npm run preview` | 预览构建结果 |

## Notion 集成

数据库：<https://www.notion.so/bebc52b20a0d43639a76a4bef5c76efd>

1. 打开 [Notion 集成](https://www.notion.so/my-integrations)，新建一个内部集成（Internal Integration）。
2. 复制 Internal Integration Secret，作为 `NOTION_TOKEN`。
3. 打开上面的数据库，点右上角 `···` →「连接」，邀请刚才创建的集成。集成看不到未分享给它的数据库。
4. 确认数据库属性：

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| Title | 标题 | 文章标题 |
| Slug | 富文本 | URL 片段，只使用小写字母、数字和连字符，例如 `hello` |
| Status | 选择 | `Draft` 或 `Published`。只有 `Published` 会进入站点 |
| Published | 日期 | 发布日期，首页按它从新到旧排列 |
| Summary | 富文本 | 列表和文章页顶部的摘要 |
| Tags | 多选 | 例如 `tech`、`life`、`notes` |

5. 正文写在 Notion 页面内容里，不要只写在属性中。
6. 本地把下面两项写进 `.env`：

```bash
NOTION_TOKEN=secret_...
NOTION_DATABASE_ID=bebc52b20a0d43639a76a4bef5c76efd
```

构建时用 `@notionhq/client` 查询 `Status = Published` 的行，并生成：

- `/` 文章列表
- `/posts/<slug>` 文章页

因为站点部署在 `/blog` 下，浏览器里的地址是 `/blog/` 和 `/blog/posts/<slug>/`。

没有 `NOTION_TOKEN` 时，构建使用本地示例文章，这样没配密钥的环境也能通过。一旦设置了 `NOTION_TOKEN`，就会请求 Notion。密钥错误、数据库未分享给集成，或接口失败时，构建直接失败，不会悄悄退回示例文章。

如果 `Status` 实际是 Notion 的状态属性而不是选择属性，只要选项里有 `Published`，构建也会按状态过滤。

## GitHub Pages

1. 打开仓库 **Settings → Pages → Build and deployment**，把 **Source** 设为 **GitHub Actions**。
2. 打开 **Settings → Secrets and variables → Actions**，新建两个 Repository secrets：
   - `NOTION_TOKEN`：集成密钥
   - `NOTION_DATABASE_ID`：`bebc52b20a0d43639a76a4bef5c76efd`
3. 推送到 `main` 会运行 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)：安装依赖、构建、部署。也可以在 Actions 页手动运行 **Deploy to GitHub Pages**。

工作流里的默认值：

- `SITE_URL=https://iamchen.github.io`
- `BASE_PATH=/blog`

因此发布后的地址是 <https://iamchen.github.io/blog/>。

还没添加 secrets 时，Actions 仍会构建并部署示例文章。配好两个 secrets 之后，重新跑一次工作流，站点就会换成 Notion 里已发布的文章。Notion 请求失败时，这一次部署不会覆盖线上内容。
