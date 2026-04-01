import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllBlogPosts } from '@/lib/blog';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

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
    <div className="min-h-screen bg-[#07070c] text-white antialiased overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <NavPublic scrolled platformHref="/#product" />

      <main id="main" className="relative z-10 px-4 pt-24 pb-8 sm:px-8 lg:px-12 w-full min-w-0">
        <div className="mx-auto max-w-4xl w-full min-w-0">

          <header className="mb-10 sm:mb-12 max-w-2xl">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Foldera Journal</p>
            <h1 className="text-3xl font-black tracking-tighter text-white sm:text-5xl leading-tight">AI that reduces work instead of creating more of it.</h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-400 sm:text-lg">
              Practical notes on email, decision load, and what an assistant should remove from your day.
            </p>
          </header>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2">
            {posts.map((post) => (
              <article key={post.slug} className="w-full min-w-0 rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.4)] hover:border-cyan-500/30 hover:shadow-[0_0_50px_rgba(6,182,212,0.15)] hover:-translate-y-1 transition-all duration-700">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600">{dateFormatter.format(new Date(post.date))}</p>
                <h2 className="mt-3 text-xl font-bold text-white">
                  <Link href={`/blog/${post.slug}`} className="transition hover:text-cyan-300">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{post.description}</p>
              </article>
            ))}
          </div>

          <BlogFooter />
        </div>
      </main>
    </div>
  );
}
