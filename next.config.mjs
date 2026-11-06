/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // pdfkit loads its built-in font data files (e.g. Helvetica.afm) via dynamic requires that
  // bundlers can't statically resolve — excluding it from bundling lets Node require it directly.
  serverExternalPackages: ['pdfkit'],
  // cpus: Hostinger's build host reports 64 CPUs, so Next starts 63 page-data workers that each load
  // Prisma's native engine; together they exceed the account's thread limit and the build aborts
  // with "OS can't spawn worker thread". A small fixed pool builds reliably and just as fast here.
  experimental: { serverActions: { bodySizeLimit: '2mb' }, cpus: 2 },
  async headers() {
    const productionHttps = process.env.NODE_ENV === 'production' && process.env.APP_URL?.startsWith('https://');
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      { key: 'Content-Security-Policy', value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; font-src 'self' data:; connect-src 'self'` }
    ];
    if (productionHttps) securityHeaders.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    return [
      {
        source: '/(.*)',
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
