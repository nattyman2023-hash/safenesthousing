import { notFound } from 'next/navigation';
import { getNewsBySlug } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { getPropertyVisual, PublicPageHero } from '@/components/PublicUI';

export default async function NewsDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = await getNewsBySlug(params.slug);
  if (!post) notFound();

  return <main>
    <PublicPageHero eyebrow={`${post.category} - ${formatDate(post.publishedAt)}`} title={post.title} intro={post.summary} image={getPropertyVisual()} />
    <section className="section"><div className="container content-grid"><article className="prose"><p>{post.content}</p><p>At Safe Nest we share what we are learning because good housing and support should be shaped by the people who use it. If you would like to talk with us about this story, <a href="/contact" style={{ color: 'var(--teal-700)', textDecoration: 'underline' }}>get in touch</a>.</p></article><aside className="info-card"><h3>About this story</h3><p>Written by {post.authorName}</p><p>Published {formatDate(post.publishedAt)}</p></aside></div></section>
  </main>;
}
