import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { sendSafeEmail } from '@/lib/mail';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { referralSchema } from '@/lib/validation';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = await rateLimit(`referral:${ip}`, 4, 60_000);
  if (!limited.allowed) return NextResponse.json({ error: 'Too many referrals from this connection. Please try again shortly.' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
  const parsed = referralSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ error: 'Unable to process this referral.' }, { status: 400 });
  const organisation = await db.organisation.findFirst();
  if (!organisation) return NextResponse.json({ error: 'The referral service is not configured yet. Please call us instead.' }, { status: 503 });
  const service = await db.service.findFirst({ where: { id: parsed.data.serviceId, organisationId: organisation.id, published: true } });
  if (!service) return NextResponse.json({ error: 'Please choose an available service.' }, { status: 400 });
  const reference = `SN-${new Date().toISOString().slice(2, 7).replace('-', '')}-${String(Math.floor(Math.random() * 900) + 100)}`;
  const referral = await db.$transaction(async (tx) => {
    const created = await tx.referral.create({ data: { organisationId: organisation.id, serviceId: service.id, reference, status: 'NEW', referrerName: parsed.data.referrerName, referrerOrganisation: parsed.data.referrerOrganisation, referrerRole: parsed.data.referrerRole, referrerEmail: parsed.data.referrerEmail, referrerPhone: parsed.data.referrerPhone, relationship: parsed.data.relationship, personName: parsed.data.personName, ageRange: parsed.data.ageRange, contactDetails: parsed.data.contactDetails, currentLocation: parsed.data.currentLocation, housingSituation: parsed.data.housingSituation, supportNeeds: parsed.data.supportNeeds, knownRisks: parsed.data.knownRisks, accessibilityNeeds: parsed.data.accessibilityNeeds, fundingRoute: parsed.data.fundingRoute, consentGiven: true, privacyAcknowledged: true, anonymousDomesticAbuse: parsed.data.anonymousDomesticAbuse === 'on' } });
    await tx.referralStatusHistory.create({ data: { referralId: created.id, next: 'NEW', reason: 'Public referral received' } });
    return created;
  });
  await audit({ organisationId: organisation.id, action: 'REFERRAL_CREATED', resourceType: 'Referral', resourceId: referral.id, after: { reference, status: 'NEW', service: service.slug } });
  await sendSafeEmail({ to: parsed.data.referrerEmail, subject: `Safe Nest — referral ${reference} received`, text: `Thank you. We have received your referral ${reference}. Please call 0800 000 0000 for urgent domestic-abuse support or 999 in immediate danger.`, html: `<p>Thank you. We have received your referral <strong>${reference}</strong>.</p><p>We will acknowledge it within seven days. Please call <strong>0800 000 0000</strong> for urgent domestic-abuse support or 999 in immediate danger.</p>` });
  return NextResponse.json({ reference });
}
