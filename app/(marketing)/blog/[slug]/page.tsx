import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllBlogPosts, getBlogPostBySlug } from '@/lib/blog';

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
    <div className="min-h-screen bg-[#07070c] text-white antialiased selection:bg-cyan-500/30 selection:text-white">
      {/* Ambient grid */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <main className="relative z-10 px-6 py-8 sm:px-8 lg:px-12">
        <article className="mx-auto max-w-2xl">
          <nav className="mb-12 flex items-center justify-between gap-4 border-b border-white/5 pb-5">
            <Link href="/" className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition-colors">
              Foldera
            </Link>
            <Link href="/blog" className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-cyan-300 transition-colors">
              ← Back to blog
            </Link>
          </nav>

          <header className="mb-10">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600">{dateFormatter.format(new Date(post.date))}</p>
            <h1 className="mt-3 text-4xl font-black tracking-tighter text-white leading-tight">{post.title}</h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">{post.description}</p>
          </header>

          <div className="overflow-x-auto">
            <div
              className="prose prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-headings:text-white prose-p:text-zinc-300 prose-p:leading-relaxed prose-strong:text-white prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:text-cyan-300 prose-th:text-white prose-td:text-zinc-300 prose-li:text-zinc-300 prose-code:text-cyan-300 prose-code:bg-zinc-900 prose-code:px-1 prose-code:rounded"
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            />
          </div>
        </article>
      </main>
    </div>
  );
}
