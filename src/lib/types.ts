export type Post = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  published: string | null;
  html: string;
};
