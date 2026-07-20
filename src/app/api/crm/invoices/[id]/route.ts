import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { invoiceStatusSchema } from '@/lib/crm-validation';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('finance.write');
    const parsed = invoiceStatusSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Choose a valid invoice status.' }, { status: 400 });
    const invoice = await db.invoice.findFirst({ where: { id: params.id, organisationId: user.organisationId }, include: { payments: true } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    if (invoice.status === 'PAID' && parsed.data.status === 'DRAFT') return NextResponse.json({ error: 'A paid invoice cannot be returned to draft.' }, { status: 400 });
    if (parsed.data.status === 'VOID' && invoice.payments.length) return NextResponse.json({ error: 'An invoice with payments cannot be voided.' }, { status: 400 });
    const updated = await db.invoice.update({ where: { id: invoice.id }, data: { status: parsed.data.status, issuedAt: parsed.data.status === 'DRAFT' ? null : (invoice.issuedAt ?? new Date()) } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'INVOICE_STATUS_CHANGED', resourceType: 'Invoice', resourceId: invoice.id, before: { status: invoice.status }, after: { status: updated.status } });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update the invoice.' : message }, { status });
  }
}
