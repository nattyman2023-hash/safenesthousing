import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <><PublicHeader />{children}<PublicFooter /></>; }
