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
    <div className="min-h-screen bg-[#07070c] text-white antialiased selection:bg-cyan-500/30 selection:text-white">
      {/* Ambient grid */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <main className="relative z-10 px-6 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <nav className="mb-12 flex items-center justify-between gap-4 border-b border-white/5 pb-5">
            <Link href="/" className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition-colors">
              Foldera
            </Link>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Blog</span>
          </nav>

          <header className="mb-12 max-w-2xl">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Foldera Journal</p>
            <h1 className="text-4xl font-black tracking-tighter text-white sm:text-5xl leading-tight">AI that reduces work instead of creating more of it.</h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-400 sm:text-lg">
              Practical notes on email, decision load, and what an assistant should remove from your day.
            </p>
          </header>

          <div className="grid gap-4">
            {posts.map((post) => (
              <article key={post.slug} className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.4)] hover:border-cyan-500/20 transition-colors">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600">{dateFormatter.format(new Date(post.date))}</p>
                <h2 className="mt-3 text-xl font-black tracking-tight text-white">
                  <Link href={`/blog/${post.slug}`} className="transition hover:text-cyan-300">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{post.description}</p>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
