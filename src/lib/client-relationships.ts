export type RelationshipDefinition = {
  key: string;
  label: string;
  inverse: string;
};

const definitions: RelationshipDefinition[] = [
  { key: 'MOTHER', label: 'Mother', inverse: 'CHILD' },
  { key: 'FATHER', label: 'Father', inverse: 'CHILD' },
  { key: 'PARENT', label: 'Parent', inverse: 'CHILD' },
  { key: 'CHILD', label: 'Child', inverse: 'PARENT' },
  { key: 'SON', label: 'Son', inverse: 'PARENT' },
  { key: 'DAUGHTER', label: 'Daughter', inverse: 'PARENT' },
  { key: 'SIBLING', label: 'Sibling', inverse: 'SIBLING' },
  { key: 'BROTHER', label: 'Brother', inverse: 'SIBLING' },
  { key: 'SISTER', label: 'Sister', inverse: 'SIBLING' },
  { key: 'GRANDPARENT', label: 'Grandparent', inverse: 'GRANDCHILD' },
  { key: 'GRANDCHILD', label: 'Grandchild', inverse: 'GRANDPARENT' },
  { key: 'HUSBAND', label: 'Husband', inverse: 'SPOUSE' },
  { key: 'WIFE', label: 'Wife', inverse: 'SPOUSE' },
  { key: 'SPOUSE', label: 'Spouse', inverse: 'SPOUSE' },
  { key: 'PARTNER', label: 'Partner', inverse: 'PARTNER' },
  { key: 'GUARDIAN', label: 'Guardian', inverse: 'DEPENDANT' },
  { key: 'CARER', label: 'Carer', inverse: 'DEPENDANT' },
  { key: 'DEPENDANT', label: 'Dependant', inverse: 'GUARDIAN' },
  { key: 'OTHER_FAMILY', label: 'Other family member', inverse: 'OTHER_FAMILY' },
  { key: 'SIGNIFICANT_PERSON', label: 'Significant person', inverse: 'SIGNIFICANT_PERSON' }
];

const byKey = new Map(definitions.map((definition) => [definition.key, definition]));

export function normaliseRelationshipType(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function getRelationshipDefinition(value: string): RelationshipDefinition | null {
  return byKey.get(normaliseRelationshipType(value)) ?? null;
}

export function getInverseRelationshipType(value: string): string | null {
  return getRelationshipDefinition(value)?.inverse ?? null;
}

export function relationshipLabel(value: string): string {
  return getRelationshipDefinition(value)?.label ?? value;
}

export function relationshipOptions(): RelationshipDefinition[] {
  return definitions;
}

/* ------------------------------------------------------------------------- *
 * Bidirectional relationships.
 *
 * A relationship is stored exactly once — on the profile where staff recorded it. The same row is
 * read from the other side with the inverse label, so client-to-client relationships are
 * bidirectional on screen without a second row and without anyone entering the link twice:
 *
 *   Recorded on John's profile: Jane — Sister
 *   John's profile:  Jane Smith · Sister      (she is his sister)
 *   Jane's profile:  John Smith · Sibling     (he is her sibling, from the stored inverse)
 *
 * Nothing is duplicated in the database; only the label changes with the side you read from.
 * ------------------------------------------------------------------------- */

export type RelationshipDirection = 'OUTGOING' | 'INCOMING';

export type RelationshipPerspective = {
  /** The type this profile shows for the other person: "Sister" reads as "she is my sister". */
  type: string;
  label: string;
  /** The type the other person's profile shows for this client. */
  counterpartType: string;
  counterpartLabel: string;
  direction: RelationshipDirection;
  /** Only the profile that owns the record may edit or unlink it; the inverse side is read-only. */
  editableFromThisProfile: boolean;
};

type PerspectiveInput = {
  clientId: string;
  relatedClientId: string | null;
  relationshipType: string;
  inverseRelationshipType: string | null;
};

/**
 * Resolves what a relationship looks like from one side. Returns null when the row belongs to
 * neither side, so a caller can never render someone else's relationship by accident.
 *
 * The stored inverse is preferred over the built-in table because staff can adjust it; the table is
 * the fallback for rows written before an inverse was recorded, and the raw type is the last resort
 * so an unrecognised value is still shown rather than hidden.
 */
export function relationshipPerspective(relationship: PerspectiveInput, clientId: string): RelationshipPerspective | null {
  const outgoing = relationship.clientId === clientId;
  const incoming = !outgoing && relationship.relatedClientId === clientId;
  if (!outgoing && !incoming) return null;

  const ownerType = relationship.relationshipType;
  const inverseType = relationship.inverseRelationshipType ?? getInverseRelationshipType(ownerType) ?? ownerType;

  if (outgoing) {
    return {
      type: ownerType,
      label: relationshipLabel(ownerType),
      counterpartType: inverseType,
      counterpartLabel: relationshipLabel(inverseType),
      direction: 'OUTGOING',
      editableFromThisProfile: true
    };
  }

  return {
    type: inverseType,
    label: relationshipLabel(inverseType),
    counterpartType: ownerType,
    counterpartLabel: relationshipLabel(ownerType),
    direction: 'INCOMING',
    editableFromThisProfile: false
  };
}

/** The three fields every linked client record exposes, plus its restriction flag. */
export type RelationshipClientRef = { id: string; displayName: string; reference: string; restricted: boolean };

export type RelatedPersonRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  preferredContactMethod: string | null;
  consentToContact: boolean;
};

export type ClientRelationshipRow = PerspectiveInput & {
  id: string;
  relatedPersonId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
  isEmergencyContact: boolean;
  isNextOfKin: boolean;
  createdAt: Date;
  relatedClient?: RelationshipClientRef | null;
  /** Absent on the returning side of a relation, where the owning client is in `client` instead. */
  relatedPerson: RelatedPersonRow | null;
  /** Present on the returning side of the relation only (the client who owns the row). */
  client?: RelationshipClientRef | null;
};

export type ClientRelationshipView = {
  id: string;
  /** The label this profile shows, e.g. "Sister". */
  label: string;
  type: string;
  direction: RelationshipDirection;
  editableFromThisProfile: boolean;
  counterpart: {
    kind: 'CLIENT' | 'PERSON';
    id: string;
    /** Masked to "Restricted client record" when the linked client is restricted. */
    name: string;
    reference: string | null;
    href: string | null;
    restricted: boolean;
  };
  /** Where the record actually lives, so staff know which profile to edit it from. */
  ownerName: string;
  ownerProfileHref: string | null;
  isNextOfKin: boolean;
  isEmergencyContact: boolean;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
  /** External contact details, only for relationships that are not client-to-client. */
  contact: { phone: string | null; email: string | null; address: string | null; preferredContactMethod: string | null; consentToContact: boolean } | null;
};

const RESTRICTED_CLIENT_NAME = 'Restricted client record';

/**
 * Builds the complete relationship set for one profile: rows this client owns plus rows where they
 * are the linked client, resolved into one readable list. A relationship is therefore never visible
 * from only one of the two profiles, whichever side recorded it.
 */
export function buildClientRelationshipViews(
  rows: { outgoing: ClientRelationshipRow[]; incoming: ClientRelationshipRow[] },
  clientId: string
): ClientRelationshipView[] {
  const views: ClientRelationshipView[] = [];

  for (const relationship of rows.outgoing) {
    const perspective = relationshipPerspective(relationship, clientId);
    if (!perspective) continue;
    const person = relationship.relatedPerson;
    const linked = relationship.relatedClient;
    views.push({
      id: relationship.id,
      label: perspective.label,
      type: perspective.type,
      direction: perspective.direction,
      editableFromThisProfile: perspective.editableFromThisProfile,
      counterpart: linked
        ? { kind: 'CLIENT', id: linked.id, name: linked.restricted ? RESTRICTED_CLIENT_NAME : linked.displayName, reference: linked.restricted ? null : linked.reference, href: linked.restricted ? null : `/crm/clients/${linked.id}`, restricted: linked.restricted }
        : { kind: 'PERSON', id: person?.id ?? relationship.id, name: person?.fullName ?? 'Name not recorded', reference: null, href: null, restricted: false },
      ownerName: 'this profile',
      ownerProfileHref: null,
      isNextOfKin: relationship.isNextOfKin,
      isEmergencyContact: relationship.isEmergencyContact,
      startDate: relationship.startDate,
      endDate: relationship.endDate,
      notes: relationship.notes,
      contact: person
        ? { phone: person.phone, email: person.email, address: person.address, preferredContactMethod: person.preferredContactMethod, consentToContact: person.consentToContact }
        : null
    });
  }

  for (const relationship of rows.incoming) {
    const perspective = relationshipPerspective(relationship, clientId);
    if (!perspective) continue;
    const owner = relationship.client ?? null;
    views.push({
      id: relationship.id,
      label: perspective.label,
      type: perspective.type,
      direction: perspective.direction,
      editableFromThisProfile: perspective.editableFromThisProfile,
      counterpart: owner
        ? { kind: 'CLIENT', id: owner.id, name: owner.restricted ? RESTRICTED_CLIENT_NAME : owner.displayName, reference: owner.restricted ? null : owner.reference, href: owner.restricted ? null : `/crm/clients/${owner.id}`, restricted: owner.restricted }
        : { kind: 'CLIENT', id: relationship.clientId, name: 'Not recorded', reference: null, href: null, restricted: false },
      ownerName: owner ? (owner.restricted ? RESTRICTED_CLIENT_NAME : owner.displayName) : 'the linked profile',
      ownerProfileHref: owner && !owner.restricted ? `/crm/clients/${owner.id}` : null,
      isNextOfKin: relationship.isNextOfKin,
      isEmergencyContact: relationship.isEmergencyContact,
      startDate: relationship.startDate,
      endDate: relationship.endDate,
      notes: relationship.notes,
      // The external contact belongs to the row's owner, so it is only shown on the owning profile.
      contact: null
    });
  }

  // Current relationships first, then next of kin and emergency contacts, then names — ended
  // relationships always sink to the bottom so the live picture is read first.
  return views.sort((a, b) => {
    const aEnded = a.endDate ? 1 : 0;
    const bEnded = b.endDate ? 1 : 0;
    if (aEnded !== bEnded) return aEnded - bEnded;
    if (a.isNextOfKin !== b.isNextOfKin) return a.isNextOfKin ? -1 : 1;
    if (a.isEmergencyContact !== b.isEmergencyContact) return a.isEmergencyContact ? -1 : 1;
    return a.counterpart.name.localeCompare(b.counterpart.name);
  });
}

