import Image from 'next/image';
import Link from 'next/link';

export function BrandLogo({ href, className = '', priority = false }: { href?: string; className?: string; priority?: boolean }) {
  const logo = <Image src="/images/safe-nest-logo.png" alt="Safe Nest Housing & Support" width={170} height={170} className={`brand-logo ${className}`} priority={priority} />;
  return href ? <Link href={href} className="brand-logo-link" aria-label="Safe Nest Housing & Support home">{logo}</Link> : logo;
}
