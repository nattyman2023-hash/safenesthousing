import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: { default: 'Safe Nest Housing & Support', template: '%s · Safe Nest' }, description: 'A safe place to land. The support to move on.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-GB" data-scroll-behavior="smooth"><body>{children}</body></html>; }
