import { redirect } from 'next/navigation';
import { CrmShell } from '@/components/CrmShell';
import { getCurrentUser } from '@/lib/auth';
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) { const user = await getCurrentUser(); if (!user) redirect('/staff/login'); return <CrmShell userName={user.name} role={user.memberships[0]?.role.name ?? 'Staff'}>{children}</CrmShell>; }
