import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots { const base = process.env.APP_URL ?? 'https://safenesthousing.org.uk'; return { rules: [{ userAgent: '*', allow: '/', disallow: ['/crm/', '/staff/', '/api/'] }], sitemap: `${base}/sitemap.xml` }; }
