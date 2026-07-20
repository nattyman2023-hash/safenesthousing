import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { sendSafeEmail } from '@/lib/mail';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { contactSchema } from '@/lib/validation';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = await rateLimit(`contact:${ip}`, 5, 60_000);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many messages. Please try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
  const parsed = contactSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ reference: 'queued' });
  const organisation = await db.organisation.findFirst();
  if (!organisation) return NextResponse.json({ error: 'The service is not configured yet. Please call us instead.' }, { status: 503 });
  const submission = await db.contactSubmission.create({ data: { organisationId: organisation.id, name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone, category: parsed.data.category, message: parsed.data.message, consent: true } });
  await audit({ organisationId: organisation.id, action: 'CONTACT_SUBMISSION_CREATED', resourceType: 'ContactSubmission', resourceId: submission.id });
  await sendSafeEmail({ to: parsed.data.email, subject: 'Safe Nest — we received your message', text: `Thank you. Your Safe Nest message reference is ${submission.id.slice(-8).toUpperCase()}. We will respond during office hours.`, html: `<p>Thank you. Your Safe Nest message reference is <strong>${submission.id.slice(-8).toUpperCase()}</strong>.</p><p>We will respond during office hours.</p>` });
  return NextResponse.json({ reference: submission.id.slice(-8).toUpperCase() });
}
