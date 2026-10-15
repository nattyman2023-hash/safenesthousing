import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { clientRelationshipUpdateSchema } from '@/lib/crm-validation';
import { getInverseRelationshipType, getRelationshipDefinition, normaliseRelationshipType } from '@/lib/client-relationships';

function parseDate(value: string | undefined): Date | undefined | null {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getRelationship(id: string, clientId: string, organisationId: string) {
  return db.clientRelationship.findFirst({ where: { id, OR: [{ clientId }, { relatedClientId: clientId }], client: { organisationId } }, include: { relatedPerson: true, relatedClient: true } });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string; relationshipId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const parsed = clientRelationshipUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the relationship details.' }, { status: 400 });
    const relationship = await getRelationship(params.relationshipId, params.id, user.organisationId);
    if (!relationship) return NextResponse.json({ error: 'Relationship not found.' }, { status: 404 });
    if (relationship.clientId !== params.id) return NextResponse.json({ error: 'Edit the relationship from the profile where it was created.' }, { status: 400 });
    const relationshipType = parsed.data.relationshipType ? normaliseRelationshipType(parsed.data.relationshipType) : relationship.relationshipType;
    const definition = getRelationshipDefinition(relationshipType);
    if (!definition) return NextResponse.json({ error: 'Choose a recognised relationship type.' }, { status: 400 });
    const startDate = parseDate(parsed.data.startDate);
    const endDate = parseDate(parsed.data.endDate);
    if (parsed.data.startDate !== undefined && startDate === null) return NextResponse.json({ error: 'Enter a valid relationship start date.' }, { status: 400 });
    if (parsed.data.endDate !== undefined && endDate === null) return NextResponse.json({ error: 'Enter a valid relationship end date.' }, { status: 400 });

    let relatedClientId = relationship.relatedClientId;
    let relatedPersonId = relationship.relatedPersonId;
    if (parsed.data.relatedClientId) {
      if (parsed.data.relatedClientId === params.id) return NextResponse.json({ error: 'A client cannot be linked to themselves.' }, { status: 400 });
      const relatedClient = await db.client.findFirst({ where: { id: parsed.data.relatedClientId, organisationId: user.organisationId } });
      if (!relatedClient) return NextResponse.json({ error: 'Choose an existing client from your organisation.' }, { status: 400 });
      const duplicate = await db.clientRelationship.findFirst({ where: { id: { not: relationship.id }, OR: [{ clientId: params.id, relatedClientId: relatedClient.id }, { clientId: relatedClient.id, relatedClientId: params.id }] } });
      if (duplicate) return NextResponse.json({ error: 'These clients already have a relationship recorded.' }, { status: 409 });
      relatedClientId = relatedClient.id;
      relatedPersonId = null;
    }
    const updated = await db.$transaction(async (tx) => {
      if (relationship.relatedPersonId && (parsed.data.fullName !== undefined || parsed.data.phone !== undefined || parsed.data.email !== undefined || parsed.data.address !== undefined || parsed.data.relatedPersonNotes !== undefined || parsed.data.preferredContactMethod !== undefined || parsed.data.consentToContact !== undefined)) {
        await tx.relatedPerson.update({ where: { id: relationship.relatedPersonId }, data: { ...(parsed.data.fullName !== undefined ? { fullName: parsed.data.fullName } : {}), ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}), ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}), ...(parsed.data.address !== undefined ? { address: parsed.data.address || null } : {}), ...(parsed.data.relatedPersonNotes !== undefined ? { notes: parsed.data.relatedPersonNotes || null } : {}), ...(parsed.data.preferredContactMethod !== undefined ? { preferredContactMethod: parsed.data.preferredContactMethod || null } : {}), ...(parsed.data.consentToContact !== undefined ? { consentToContact: parsed.data.consentToContact } : {}) } });
      }
      return tx.clientRelationship.update({ where: { id: relationship.id }, data: { relatedClientId, relatedPersonId, relationshipType, inverseRelationshipType: getInverseRelationshipType(relationshipType), ...(startDate !== undefined ? { startDate } : {}), ...(endDate !== undefined ? { endDate } : {}), ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}), ...(parsed.data.isEmergencyContact !== undefined ? { isEmergencyContact: parsed.data.isEmergencyContact } : {}), ...(parsed.data.isNextOfKin !== undefined ? { isNextOfKin: parsed.data.isNextOfKin } : {}) } });
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CLIENT_RELATIONSHIP_UPDATED', resourceType: 'ClientRelationship', resourceId: relationship.id, after: { clientId: params.id, relationshipType: updated.relationshipType, relatedClientId: updated.relatedClientId, relatedPersonId: updated.relatedPersonId } });
    return NextResponse.json({ id: updated.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update the relationship.' : message }, { status });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string; relationshipId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const relationship = await getRelationship(params.relationshipId, params.id, user.organisationId);
    if (!relationship) return NextResponse.json({ error: 'Relationship not found.' }, { status: 404 });
    await db.clientRelationship.delete({ where: { id: relationship.id } });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CLIENT_RELATIONSHIP_REMOVED', resourceType: 'ClientRelationship', resourceId: relationship.id, before: { clientId: relationship.clientId, relatedClientId: relationship.relatedClientId, relatedPersonId: relationship.relatedPersonId, relationshipType: relationship.relationshipType } });
    return NextResponse.json({ id: relationship.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to unlink the relationship.' : message }, { status });
  }
}
