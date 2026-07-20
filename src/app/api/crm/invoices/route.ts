import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { invoiceCreateSchema } from '@/lib/crm-validation';
import { invoiceTotal } from '@/lib/domain';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('finance.write');
    const parsed = invoiceCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the invoice details.' }, { status: 400 });
    const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: 'Enter a valid due date.' }, { status: 400 });
    const totalMinor = invoiceTotal(parsed.data.items);
    const invoice = await db.invoice.create({ data: { organisationId: user.organisationId, reference: parsed.data.reference, status: 'DRAFT', totalMinor, dueAt, items: { create: parsed.data.items } }, include: { items: true } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'INVOICE_CREATED', resourceType: 'Invoice', resourceId: invoice.id, after: { reference: invoice.reference, totalMinor: invoice.totalMinor, itemCount: invoice.items.length, dueAt: invoice.dueAt } });
    return NextResponse.json({ id: invoice.id, reference: invoice.reference, totalMinor: invoice.totalMinor });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : isUniqueViolation(error) ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? 'That invoice reference is already in use.' : status === 500 ? 'Unable to create the invoice.' : message }, { status });
  }
}
