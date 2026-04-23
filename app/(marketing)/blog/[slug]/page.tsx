import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft } from 'lucide-react';
import { getAllBlogPosts, getBlogPostBySlug } from '@/lib/blog';
import { resolveCanonicalSiteOrigin } from '@/lib/site-canonical';
import {
  BRANDON_KAPP_AUTHOR_BLURB,
  BRANDON_KAPP_NAME,
  BRANDON_KAPP_PROFILE_PATH,
} from '@/lib/brandon-kapp-profile';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

type BlogPostPageProps = {
  params: {
    slug: string;
  };
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export async function generateStaticParams() {
  const posts = await getAllBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = await getBlogPostBySlug(params.slug);

  if (!post) {
    return {};
  }

  const siteOrigin = resolveCanonicalSiteOrigin();
  const postPath = `/blog/${post.slug}`;
  const postUrl = `${siteOrigin}${postPath}`;
  const ogImageUrl = `${siteOrigin}/foldera-logo.png`;

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: postPath },
    openGraph: {
      title: post.title,
      description: post.description,
      url: postUrl,
      siteName: 'Foldera',
      locale: 'en_US',
      type: 'article',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: 'Foldera' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [ogImageUrl],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getBlogPostBySlug(params.slug);

  if (!post) {
    notFound();
    return null;
  }

  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <article className="mx-auto max-w-4xl px-4 sm:px-6">
          <Link
            href="/blog"
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-button px-2 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back to blog
          </Link>

          <header className="mt-6 border-b border-border-subtle pb-12">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-muted">
              {dateFormatter.format(new Date(post.date))}
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{post.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-secondary">{post.description}</p>
            <div className="mt-8 border-y border-border-subtle py-5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Written by</p>
              <Link
                href={BRANDON_KAPP_PROFILE_PATH}
                className="mt-2 inline-flex text-xl font-bold text-text-primary transition-colors hover:text-accent-hover"
              >
                {BRANDON_KAPP_NAME}
              </Link>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{BRANDON_KAPP_AUTHOR_BLURB}</p>
            </div>
          </header>

          <div className="py-12">
            <div
              className="prose prose-invert prose-zinc mx-auto max-w-2xl prose-headings:text-text-primary prose-p:text-text-secondary prose-li:text-text-secondary prose-strong:text-text-primary prose-a:text-accent prose-a:no-underline hover:prose-a:text-accent-hover prose-th:text-text-primary prose-td:text-text-secondary"
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            />
          </div>

          <section className="border-t border-border-subtle py-10 text-center">
            <p className="text-lg font-semibold text-text-primary">Finished work, every morning.</p>
            <Link
              href="/start"
              className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-button bg-accent px-6 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
            >
              Get started free
            </Link>
          </section>
        </article>

        <BlogFooter />
      </main>
    </div>
  );
}
