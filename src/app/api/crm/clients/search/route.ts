import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (query.length < 2) return NextResponse.json({ clients: [] });
    const clients = await db.client.findMany({
      where: { organisationId: user.organisationId, status: { not: 'ARCHIVED' }, OR: [{ displayName: { contains: query } }, { reference: { contains: query } }, { phone: { contains: query } }, { email: { contains: query } }] },
      select: { id: true, reference: true, displayName: true, dateOfBirth: true, phone: true, email: true },
      orderBy: { displayName: 'asc' },
      take: 20
    });
    return NextResponse.json({ clients });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to search clients.' : message }, { status });
  }
}
