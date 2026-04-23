import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllBlogPosts } from '@/lib/blog';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Notes on AI workflows, email triage, and reducing busywork with Foldera.',
  openGraph: {
    title: 'Blog — Foldera',
    description: 'Notes on AI workflows, email triage, and reducing busywork with Foldera.',
  },
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export default async function BlogIndexPage() {
  const posts = await getAllBlogPosts();

  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="border-b border-border-subtle pb-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Foldera Journal</p>
            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl">
              AI that reduces work instead of creating more of it.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary">
              Practical notes on inbox pressure, decisions, and how to ship finished work with less overhead.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-4 md:grid-cols-2">
              {posts.map((post) => (
                <article key={post.slug} className="rounded-card border border-border bg-panel p-6 sm:p-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-muted">
                    {dateFormatter.format(new Date(post.date))}
                  </p>
                  <h2 className="mt-4 text-2xl font-bold tracking-tight text-text-primary">
                    <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-accent-hover">
                      {post.title}
                    </Link>
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-text-secondary">{post.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <BlogFooter />
      </main>
    </div>
  );
}
