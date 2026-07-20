import PDFDocument from 'pdfkit';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { invoiceRemaining } from '@/lib/domain';
import { formatDate, formatMoneyMinor } from '@/lib/format';

export const runtime = 'nodejs';

type InvoiceWithLines = Awaited<ReturnType<typeof loadInvoice>>;

async function loadInvoice(id: string, organisationId: string) {
  return db.invoice.findFirst({ where: { id, organisationId }, include: { items: true, payments: true } });
}

function renderInvoicePdf(invoice: NonNullable<InvoiceWithLines>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 50;
    const right = 545;

    doc.fontSize(18).text('Safe Nest Housing & Support', left, 50);
    doc.fontSize(10).fillColor('#555').text('Invoice', left, 74);
    doc.fillColor('#000');

    doc.fontSize(14).text(`Invoice ${invoice.reference}`, left, 100);
    doc.fontSize(10).fillColor('#555');
    doc.text(`Status: ${invoice.status}`, left, 122);
    doc.text(`Issued: ${invoice.issuedAt ? formatDate(invoice.issuedAt) : 'Not yet issued'}`, left, 136);
    doc.text(`Due: ${formatDate(invoice.dueAt)}`, left, 150);
    doc.fillColor('#000');

    let y = 180;
    doc.fontSize(10).text('Description', left, y, { width: 260 });
    doc.text('Qty', left + 260, y, { width: 50, align: 'right' });
    doc.text('Unit price', left + 310, y, { width: 90, align: 'right' });
    doc.text('Amount', left + 400, y, { width: 95, align: 'right' });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 8;

    for (const item of invoice.items) {
      doc.fontSize(10).text(item.description, left, y, { width: 260 });
      doc.text(String(item.quantity), left + 260, y, { width: 50, align: 'right' });
      doc.text(formatMoneyMinor(item.unitMinor), left + 310, y, { width: 90, align: 'right' });
      doc.text(formatMoneyMinor(item.unitMinor * item.quantity), left + 400, y, { width: 95, align: 'right' });
      y += 20;
    }

    y += 4;
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 10;

    const remaining = invoiceRemaining(invoice.totalMinor, invoice.payments);
    doc.fontSize(11).text(`Total: ${formatMoneyMinor(invoice.totalMinor)}`, left + 300, y, { width: 195, align: 'right' });
    y += 18;
    doc.text(`Outstanding: ${formatMoneyMinor(remaining)}`, left + 300, y, { width: 195, align: 'right' });
    y += 30;

    if (invoice.payments.length) {
      doc.fontSize(12).fillColor('#000').text('Payments received', left, y);
      y += 18;
      doc.fontSize(10).fillColor('#555');
      for (const payment of invoice.payments) {
        doc.text(`${formatDate(payment.paidAt)} — ${formatMoneyMinor(payment.amountMinor)} (${payment.method})`, left, y);
        y += 16;
      }
      doc.fillColor('#000');
    }

    doc.end();
  });
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requirePermission('finance.read');
    const invoice = await loadInvoice(params.id, user.organisationId);
    if (!invoice) return Response.json({ error: 'Invoice not found.' }, { status: 404 });
    const buffer = await renderInvoicePdf(invoice);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.reference}.pdf"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return Response.json({ error: status === 500 ? 'Unable to generate the invoice PDF.' : message }, { status });
  }
}
