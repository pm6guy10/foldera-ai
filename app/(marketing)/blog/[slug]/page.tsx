import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft } from 'lucide-react';
import { getAllBlogPosts, getBlogPostBySlug } from '@/lib/blog';
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

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
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
    <div className="min-h-screen bg-[#07070c] text-white antialiased overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <NavPublic scrolled platformHref="/#product" />

      <main id="main" className="relative z-10 px-4 pt-24 pb-12 sm:px-8 lg:px-12 w-full min-w-0">
        <article className="mx-auto max-w-full sm:max-w-2xl w-full min-w-0">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-zinc-500 text-xs font-black uppercase tracking-[0.2em] hover:text-white transition-colors mb-10 min-h-[44px] min-w-[44px] -ml-2 pl-2 py-2 rounded-lg"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            Back to blog
          </Link>

          <header className="mb-10">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600">{dateFormatter.format(new Date(post.date))}</p>
            <h1 className="mt-3 text-4xl font-black tracking-tighter text-white leading-tight">{post.title}</h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">{post.description}</p>
          </header>

          <div className="max-w-full overflow-x-auto">
            <div
              className="prose prose-invert prose-zinc max-w-full sm:max-w-2xl mx-auto prose-headings:font-black prose-headings:tracking-tight prose-headings:text-white prose-p:text-zinc-300 prose-p:leading-relaxed prose-strong:text-white prose-a:text-cyan-400 prose-a:no-underline prose-a:hover:text-cyan-300 prose-th:text-white prose-td:text-zinc-300 prose-li:text-zinc-300 prose-code:text-cyan-300 prose-code:bg-zinc-900 prose-code:px-1 prose-code:rounded prose-img:max-w-full prose-img:h-auto"
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            />
          </div>

          <div className="mt-16 rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl p-8 text-center">
            <p className="text-white font-bold text-lg mb-6">Finished work, every morning.</p>
            <Link
              href="/start"
              className="inline-flex items-center justify-center bg-white text-black font-black uppercase tracking-[0.15em] text-xs rounded-xl py-4 px-8 hover:bg-zinc-200 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all"
            >
              Get started free
            </Link>
          </div>

          <BlogFooter />
        </article>
      </main>
    </div>
  );
}
