import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { paymentSchema } from '@/lib/crm-validation';
import { invoiceRemaining } from '@/lib/domain';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('finance.write');
    const parsed = paymentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the payment details.' }, { status: 400 });
    const paidAt = new Date(parsed.data.paidAt);
    if (Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: 'Enter a valid payment date.' }, { status: 400 });
    const invoice = await db.invoice.findFirst({ where: { id: params.id, organisationId: user.organisationId }, include: { payments: true } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    if (invoice.status === 'VOID') return NextResponse.json({ error: 'A void invoice cannot receive a payment.' }, { status: 400 });
    const remaining = invoiceRemaining(invoice.totalMinor, invoice.payments);
    if (parsed.data.amountMinor > remaining) return NextResponse.json({ error: 'Payment cannot exceed the remaining invoice balance.' }, { status: 400 });
    const nextStatus = parsed.data.amountMinor === remaining ? 'PAID' : 'PART_PAID';
    const result = await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({ data: { invoiceId: invoice.id, amountMinor: parsed.data.amountMinor, paidAt, method: parsed.data.method } });
      const updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { status: nextStatus, issuedAt: invoice.issuedAt ?? new Date() } });
      return { payment, updatedInvoice };
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'INVOICE_PAYMENT_RECORDED', resourceType: 'Payment', resourceId: result.payment.id, before: { invoiceStatus: invoice.status, remainingMinor: remaining }, after: { invoiceId: invoice.id, amountMinor: result.payment.amountMinor, method: result.payment.method, invoiceStatus: result.updatedInvoice.status } });
    return NextResponse.json({ id: result.payment.id, invoiceStatus: result.updatedInvoice.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to record the payment.' : message }, { status });
  }
}
