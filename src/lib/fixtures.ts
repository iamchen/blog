import type { Post } from "./types";

const helloHtml = `
<p>你好。这是仓库里的示例文章，只在没有配置 <code>NOTION_TOKEN</code> 时出现，用来让本地和 CI 在缺少密钥时也能构建。</p>
<p>把 Notion 集成密钥和数据库 ID 配进环境变量之后，构建会改读数据库里 Status 为 Published 的页面。请求失败时构建会停下来，不会再用这些示例把站点发出去。</p>
<blockquote><p>写在 Notion 里，读在静态页上。</p></blockquote>
`.trim();

const howToHtml = `
<p>站点内容以 Notion 数据库为准。页面正文会在构建时拉下来，变成 <code>/posts/&lt;slug&gt;</code>。</p>
<ol>
  <li>在数据库新增一行，填好 Title、Slug、Summary，需要的话加上 Tags。</li>
  <li>在页面正文里写文章。草稿把 Status 留在 Draft。</li>
  <li>准备发布时，把 Status 改为 Published，并填上 Published 日期。</li>
  <li>推送到 <code>main</code>，或在 Actions 里重新运行 Deploy to GitHub Pages。</li>
</ol>
<figure class="code-block"><pre><code class="language-bash">npm run dev
npm run build</code></pre></figure>
`.trim();

export function fixturePosts(): Post[] {
  return [
    {
      id: "fixture-how-to-update",
      title: "如何更新文章",
      slug: "how-to-update",
      summary: "在 Notion 里写好文章，把 Status 设为 Published，然后让 GitHub Actions 重新构建站点。",
      tags: ["tech", "notes"],
      published: "2026-10-20",
      html: howToHtml,
    },
    {
      id: "fixture-hello",
      title: "你好",
      slug: "hello",
      summary: "这是一篇本地示例。配好 Notion 之后，这里会换成数据库里已发布的文章。",
      tags: ["life"],
      published: "2026-10-01",
      html: helloHtml,
    },
  ];
}
