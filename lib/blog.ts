import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import html from 'remark-html';

const blogDirectory = path.join(process.cwd(), 'content', 'blog');

export interface BlogPostFrontmatter {
  title: string;
  description: string;
  date: string;
  slug: string;
}

export interface BlogPost extends BlogPostFrontmatter {
  contentHtml: string;
}

async function readMarkdownFile(fileName: string): Promise<BlogPost> {
  const fullPath = path.join(blogDirectory, fileName);
  const fileContents = await fs.readFile(fullPath, 'utf8');
  const { data, content } = matter(fileContents);
  const processedContent = await remark().use(html).process(content);

  return {
    title: String(data.title),
    description: String(data.description),
    date: String(data.date),
    slug: String(data.slug),
    contentHtml: processedContent.toString(),
  };
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const fileNames = await fs.readdir(blogDirectory);
  const posts = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => readMarkdownFile(fileName)),
  );

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const posts = await getAllBlogPosts();
  return posts.find((post) => post.slug === slug) ?? null;
}
