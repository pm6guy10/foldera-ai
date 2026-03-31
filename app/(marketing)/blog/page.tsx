import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllBlogPosts } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Blog — Foldera',
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
    <main className="min-h-screen bg-stone-950 px-6 py-8 text-stone-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <nav className="mb-10 flex items-center justify-between gap-4 border-b border-stone-800 pb-5">
          <Link href="https://foldera.ai" className="text-sm font-medium uppercase tracking-[0.28em] text-stone-300">
            Foldera.ai
          </Link>
          <span className="text-sm text-stone-500">Blog</span>
        </nav>

        <header className="mb-10 max-w-2xl">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-cyan-300">Foldera Journal</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">AI that reduces work instead of creating more of it.</h1>
          <p className="mt-4 text-base leading-7 text-stone-300 sm:text-lg">
            Practical notes on email, decision load, and what an assistant should remove from your day.
          </p>
        </header>

        <div className="grid gap-4">
          {posts.map((post) => (
            <article key={post.slug} className="rounded-3xl border border-stone-800 bg-stone-900/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
              <p className="text-sm text-stone-400">{dateFormatter.format(new Date(post.date))}</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                <Link href={`/blog/${post.slug}`} className="transition hover:text-cyan-300">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 text-base leading-7 text-stone-300">{post.description}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
