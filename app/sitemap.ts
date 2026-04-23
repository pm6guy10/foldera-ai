import type { MetadataRoute } from 'next';
import { getAllBlogPosts } from '@/lib/blog';
import { resolveCanonicalSiteOrigin } from '@/lib/site-canonical';

const STATIC_PATHS = [
  '/',
  '/brandon-kapp',
  '/pricing',
  '/start',
  '/try',
  '/privacy',
  '/terms',
  '/blog',
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = resolveCanonicalSiteOrigin();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.8,
  }));

  const posts = await getAllBlogPosts();
  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticEntries, ...blogEntries];
}
