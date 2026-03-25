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
    <main className="min-h-screen bg-stone-950 px-6 py-8 text-stone-100 sm:px-8 lg:px-12">
      <article className="mx-auto max-w-3xl">
        <nav className="mb-10 flex items-center justify-between gap-4 border-b border-stone-800 pb-5">
          <Link href="https://foldera.ai" className="text-sm font-medium uppercase tracking-[0.28em] text-stone-300">
            Foldera.ai
          </Link>
          <Link href="/blog" className="text-sm text-stone-400 transition hover:text-cyan-300">
            Back to blog
          </Link>
        </nav>

        <header className="mb-10">
          <p className="text-sm text-stone-400">{dateFormatter.format(new Date(post.date))}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{post.title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-300">{post.description}</p>
        </header>

        <div className="overflow-x-auto">
          <div
            className="prose prose-invert prose-lg max-w-none prose-headings:scroll-mt-24 prose-headings:text-white prose-p:text-stone-200 prose-strong:text-white prose-a:text-cyan-300 prose-th:text-white prose-td:text-stone-200"
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />
        </div>
      </article>
    </main>
  );
}
