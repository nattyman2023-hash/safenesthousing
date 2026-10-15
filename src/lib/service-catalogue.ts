import { db } from './db';

/**
 * The single source of truth for which services a form may offer.
 *
 * A dropdown must never offer an option the write path will reject: that is a dead
 * end for the person filling the form in. Every selectable service list therefore
 * uses the *same* eligibility rule as the endpoint that accepts the submission.
 *
 * This module exists because of a real failure: `/crm/referrals/new` was fed by the
 * public `getServices()` helper, which does not filter by organisation and falls back
 * to the fictional fixture list (whose ids are slugs such as `domestic-abuse`) when the
 * service table has no published rows. `POST /api/crm/referrals` then rejected every one
 * of those options with "Choose an available service." — the form's own menu could not
 * be submitted. Selectable lists here always come from the database and never fall back
 * to fixtures, so a visible option is an accepted option.
 *
 * There is no `active` or `referralEnabled` column on Service (see prisma/schema.prisma):
 * the referral rule is organisation scope plus publication, and internal links only need
 * organisation scope.
 */

export type SelectableService = { id: string; title: string };

/** Where-clause for POST /api/crm/referrals: a referral may only be recorded against a
 * published service inside the signed-in user's organisation. */
export const referralServiceWhere = (organisationId: string) => ({ organisationId, published: true });

/** Where-clause for the internal CRM links (client, property, rota shift): those records
 * may point at any service in the organisation, published or still a draft. */
export const crmServiceWhere = (organisationId: string) => ({ organisationId });

/** Where-clause for POST /api/referrals. The public site serves a single organisation,
 * so publication is the only rule it can enforce. */
export const publicServiceWhere = () => ({ published: true });

/** True when a service row may be offered to internal referral intake. */
export function isReferralEligible(row: { organisationId: string; published: boolean }, organisationId: string): boolean {
  return row.organisationId === organisationId && row.published === true;
}

/** True when a service row may be offered as an internal CRM link target. */
export function isCrmLinkable(row: { organisationId: string }, organisationId: string): boolean {
  return row.organisationId === organisationId;
}

const selectable = { id: true, title: true } as const;

async function selectableServices(where: Record<string, unknown>): Promise<SelectableService[]> {
  try {
    const rows = await db.service.findMany({ where, select: selectable, orderBy: { displayOrder: 'asc' } });
    return rows.map((row) => ({ id: row.id, title: row.title }));
  } catch {
    // An unreachable database is reported as "nothing selectable yet" rather than a
    // fixture list whose ids the write path must reject.
    return [];
  }
}

/** Services the public referral form may offer. */
export function getPublicSelectableServices(): Promise<SelectableService[]> {
  return selectableServices(publicServiceWhere());
}

/** Services internal referral intake may offer — mirrors POST /api/crm/referrals. */
export function getReferralSelectableServices(organisationId: string): Promise<SelectableService[]> {
  return selectableServices(referralServiceWhere(organisationId));
}

/** Services an internal CRM record may link to — mirrors the client, property and rota endpoints. */
export function getCrmSelectableServices(organisationId: string): Promise<SelectableService[]> {
  return selectableServices(crmServiceWhere(organisationId));
}
