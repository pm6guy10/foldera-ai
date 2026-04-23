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
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {posts.map((post) => (
                <article key={post.slug} className="grid gap-4 py-6 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-8 sm:py-7">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-muted sm:pt-1">
                    {dateFormatter.format(new Date(post.date))}
                  </p>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                      <Link href={`/blog/${post.slug}`} className="transition-colors hover:text-accent-hover">
                        {post.title}
                      </Link>
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-text-secondary sm:text-base">{post.description}</p>
                  </div>
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
