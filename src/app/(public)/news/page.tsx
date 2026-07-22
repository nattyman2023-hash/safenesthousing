import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublishedNews } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { getFeaturedVisual, PublicPageHero } from '@/components/PublicUI';

const featuredImage = getFeaturedVisual('news');

export const metadata: Metadata = { title: 'News and stories', description: 'News, resident stories, reports, and community updates from Safe Nest.', openGraph: { images: [{ url: featuredImage.src, alt: featuredImage.alt }] } };

export default async function NewsPage() {
  const posts = await getPublishedNews();
  return <main>
    <PublicPageHero eyebrow="News & stories" title="From the Nest" intro="Updates, ideas, and honest reflections from our homes and the people connected to them." image={featuredImage} />
    <section className="section"><div className="container"><div className="news-grid">{posts.map((post, index) => <Link href={`/news/${post.slug}`} key={post.slug} className={`news-card ${index === 0 ? 'featured' : ''}`}><p className="news-meta">{post.category} - {formatDate(post.publishedAt)}</p><h2>{post.title}</h2><p>{post.summary}</p><span className="text-link">Read more <span aria-hidden="true">-&gt;</span></span></Link>)}</div></div></section>
  </main>;
}
