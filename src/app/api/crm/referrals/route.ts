import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { internalReferralSchema } from '@/lib/crm-validation';

export async function POST(request: Request) {
  try {
    const user = await requirePermission('referrals.write');
    const parsed = internalReferralSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the referral details.' }, { status: 400 });
    const service = await db.service.findFirst({ where: { id: parsed.data.serviceId, organisationId: user.organisationId, published: true } });
    if (!service) return NextResponse.json({ error: 'Choose an available service.' }, { status: 400 });
    let reference = '';
    let referral = null;
    for (let attempt = 0; attempt < 5 && !referral; attempt += 1) {
      reference = `SN-${new Date().toISOString().slice(2, 7).replace('-', '')}-${randomInt(100, 1000)}`;
      try {
        referral = await db.$transaction(async (tx) => {
          const created = await tx.referral.create({ data: { organisationId: user.organisationId, serviceId: service.id, reference, status: 'NEW', referrerName: parsed.data.referrerName, referrerOrganisation: parsed.data.referrerOrganisation, referrerEmail: parsed.data.referrerEmail, personName: parsed.data.personName, currentLocation: parsed.data.currentLocation, housingSituation: parsed.data.housingSituation, supportNeeds: parsed.data.supportNeeds, knownRisks: parsed.data.knownRisks, consentGiven: true, privacyAcknowledged: true } });
          await tx.referralStatusHistory.create({ data: { referralId: created.id, next: 'NEW', reason: 'Internal referral created', changedBy: user.id } });
          await tx.referralRisk.create({ data: { referralId: created.id, category: 'Initial triage', level: parsed.data.risk, summary: 'Initial risk level recorded during internal intake.', restricted: true } });
          return created;
        });
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
    if (!referral) throw new Error('REFERRAL_CREATE_FAILED');
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'REFERRAL_CREATED_INTERNAL', resourceType: 'Referral', resourceId: referral.id, after: { reference: referral.reference, status: referral.status, service: service.slug, risk: parsed.data.risk } });
    return NextResponse.json({ id: referral.id, reference: referral.reference });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the referral.' : message }, { status });
  }
}
