import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.APP_URL ?? 'https://safenesthousing.org.uk';
const featuredImage = '/images/safe-nest-featured.jpg';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Safe Nest Housing & Support', template: '%s · Safe Nest' },
  description: 'A safe place to land. Safe Nest provides welcoming homes and practical housing support for people moving towards safety, stability, and independence.',
  keywords: ['supported accommodation', 'housing support', 'homelessness support', 'domestic abuse support', 'refugee move-on', 'Safe Nest'],
  authors: [{ name: 'Safe Nest Housing & Support' }],
  creator: 'Safe Nest Housing & Support',
  publisher: 'Safe Nest Housing & Support',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: '/',
    siteName: 'Safe Nest Housing & Support',
    title: 'Safe Nest Housing & Support',
    description: 'A safe place to land. Safe Nest provides welcoming homes and practical housing support for people moving towards safety, stability, and independence.',
    images: [{ url: featuredImage, width: 1918, height: 854, alt: 'A welcoming residential street with neighbours and local support' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Safe Nest Housing & Support',
    description: 'A safe place to land. The support to move on.',
    images: [featuredImage]
  },
  robots: { index: true, follow: true }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f1b2d'
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Safe Nest Housing & Support',
  url: siteUrl,
  email: 'hello@safenesthousing.org.uk',
  description: 'A housing and support organisation providing welcoming homes and practical support for people moving towards safety, stability, and independence.',
  image: `${siteUrl}${featuredImage}`
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB" data-scroll-behavior="smooth">
    <body>
      {children}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
    </body>
  </html>;
}
