import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { clientRelationshipSchema } from '@/lib/crm-validation';
import { getInverseRelationshipType, getRelationshipDefinition, normaliseRelationshipType } from '@/lib/client-relationships';

function parseDate(value: string | undefined): Date | undefined | null {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const parsed = clientRelationshipSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the relationship details.' }, { status: 400 });
    const client = await db.client.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    const definition = getRelationshipDefinition(parsed.data.relationshipType);
    if (!definition) return NextResponse.json({ error: 'Choose a recognised relationship type.' }, { status: 400 });
    const relationshipType = normaliseRelationshipType(parsed.data.relationshipType);
    const startDate = parseDate(parsed.data.startDate);
    const endDate = parseDate(parsed.data.endDate);
    if (parsed.data.startDate !== undefined && startDate === null) return NextResponse.json({ error: 'Enter a valid relationship start date.' }, { status: 400 });
    if (parsed.data.endDate !== undefined && endDate === null) return NextResponse.json({ error: 'Enter a valid relationship end date.' }, { status: 400 });
    if (startDate && endDate && endDate < startDate) return NextResponse.json({ error: 'The end date cannot be before the start date.' }, { status: 400 });

    if (parsed.data.relatedClientId) {
      if (parsed.data.relatedClientId === client.id) return NextResponse.json({ error: 'A client cannot be linked to themselves.' }, { status: 400 });
      const relatedClient = await db.client.findFirst({ where: { id: parsed.data.relatedClientId, organisationId: user.organisationId } });
      if (!relatedClient) return NextResponse.json({ error: 'Choose an existing client from your organisation.' }, { status: 400 });
      const duplicate = await db.clientRelationship.findFirst({ where: { OR: [{ clientId: client.id, relatedClientId: relatedClient.id }, { clientId: relatedClient.id, relatedClientId: client.id }] } });
      if (duplicate) return NextResponse.json({ error: 'These clients already have a relationship recorded.' }, { status: 409 });
      const relationship = await db.clientRelationship.create({ data: { clientId: client.id, relatedClientId: relatedClient.id, relationshipType, inverseRelationshipType: getInverseRelationshipType(relationshipType), startDate: startDate ?? undefined, endDate: endDate ?? undefined, notes: parsed.data.notes, isEmergencyContact: parsed.data.isEmergencyContact, isNextOfKin: parsed.data.isNextOfKin, createdBy: user.id } });
      await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CLIENT_RELATIONSHIP_CREATED', resourceType: 'ClientRelationship', resourceId: relationship.id, after: { clientId: client.id, relatedClientId: relatedClient.id, relationshipType, inverseRelationshipType: relationship.inverseRelationshipType } });
      return NextResponse.json({ id: relationship.id });
    }

    if (!parsed.data.fullName) return NextResponse.json({ error: 'Enter the external contact’s full name.' }, { status: 400 });
    const result = await db.$transaction(async (tx) => {
      const relatedPerson = await tx.relatedPerson.create({ data: { organisationId: user.organisationId, fullName: parsed.data.fullName!, phone: parsed.data.phone, email: parsed.data.email, address: parsed.data.address, notes: parsed.data.relatedPersonNotes, preferredContactMethod: parsed.data.preferredContactMethod, consentToContact: parsed.data.consentToContact } });
      const relationship = await tx.clientRelationship.create({ data: { clientId: client.id, relatedPersonId: relatedPerson.id, relationshipType, inverseRelationshipType: definition.inverse, startDate: startDate ?? undefined, endDate: endDate ?? undefined, notes: parsed.data.notes, isEmergencyContact: parsed.data.isEmergencyContact, isNextOfKin: parsed.data.isNextOfKin, createdBy: user.id } });
      return { relatedPerson, relationship };
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'CLIENT_EXTERNAL_CONTACT_CREATED', resourceType: 'ClientRelationship', resourceId: result.relationship.id, after: { clientId: client.id, relationshipType, relatedPersonId: result.relatedPerson.id, isEmergencyContact: result.relationship.isEmergencyContact, isNextOfKin: result.relationship.isNextOfKin } });
    return NextResponse.json({ id: result.relationship.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the relationship.' : message }, { status });
  }
}
