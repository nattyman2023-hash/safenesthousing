import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { serviceUpdateSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';
import { isValidServiceSlug } from '@/lib/service-slug';

/**
 * PATCH — update only the fields present in the request.
 *
 * The schema is partial so the publish toggle can send `{ published: false }` on its own without
 * wiping the service's content, and so the content form can correct a slug without restating
 * publication. Absent means "unchanged": publication is never inferred from a missing key, which
 * would silently unpublish a live service on every content save.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const parsed = serviceUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the service content.' }, { status: 400 });
    const service = await db.service.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!service) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });

    // Built field by field rather than spread from the payload, so an absent key can never reach
    // Prisma as `undefined`-with-intent and every NOT NULL Service column stays populated.
    const data: Prisma.ServiceUpdateInput = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.summary !== undefined) data.summary = parsed.data.summary;
    if (parsed.data.content !== undefined) data.content = parsed.data.content;
    if (parsed.data.audience !== undefined) data.audience = parsed.data.audience;
    if (parsed.data.referralRoutes !== undefined) data.referralRoutes = parsed.data.referralRoutes;
    if (parsed.data.eligibility !== undefined) data.eligibility = parsed.data.eligibility;
    if (parsed.data.supportModel !== undefined) data.supportModel = parsed.data.supportModel;
    if (parsed.data.displayOrder !== undefined) data.displayOrder = parsed.data.displayOrder;
    if (parsed.data.published !== undefined) data.published = parsed.data.published;
    if (parsed.data.slug !== undefined) {
      const slug = parsed.data.slug;
      if (!isValidServiceSlug(slug)) return NextResponse.json({ error: 'Use a slug of lower-case letters, numbers and single hyphens.' }, { status: 400 });
      // The constraint is @@unique([organisationId, slug]), so the same slug in another organisation
      // is legitimate; only a clash inside this one is refused, and it is named so staff can fix it.
      if (slug !== service.slug) {
        const clash = await db.service.findFirst({ where: { organisationId: user.organisationId, slug, id: { not: service.id } }, select: { id: true, title: true } });
        if (clash) return NextResponse.json({ error: `Another service already uses the slug "${slug}" (${clash.title}).` }, { status: 409 });
      }
      data.slug = slug;
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });

    const updated = await db.service.update({ where: { id: service.id }, data });
    // Publication is audited as its own action: taking a service off the public site changes what
    // people can be referred to, which is a different kind of event from a wording correction.
    const publicationChanged = parsed.data.published !== undefined && updated.published !== service.published;
    await audit({
      organisationId: user.organisationId,
      actorId: user.id,
      action: publicationChanged ? (updated.published ? 'SERVICE_PUBLISHED' : 'SERVICE_UNPUBLISHED') : 'SERVICE_CONTENT_UPDATED',
      resourceType: 'Service',
      resourceId: service.id,
      before: { published: service.published, slug: service.slug },
      after: { published: updated.published, slug: updated.slug, fields: Object.keys(data) }
    });
    return NextResponse.json({ id: updated.id, slug: updated.slug, published: updated.published });
  } catch (error) {
    // Slug uniqueness is enforced by the database too; the pre-check above cannot see a concurrent
    // insert, so the constraint violation is translated rather than surfacing as a 500.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Another service already uses that slug. Choose a different slug.' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save service content.' : message }, { status });
  }
}

/**
 * DELETE — refused while other records depend on the service.
 *
 * Referrals, clients, properties and rota shifts each hold a `serviceId`. Deleting the row would fail
 * foreign key or orphan the operational record it describes, and a referral is part of a safeguarding
 * history that has to stay readable. So the endpoint refuses, names what is using the service, and
 * points at the reversible alternative: unpublishing keeps every linked record intact and simply stops
 * the service being offered to new referrals.
 */
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    const service = await db.service.findFirst({ where: { id: params.id, organisationId: user.organisationId } });
    if (!service) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });

    const [referrals, clients, properties, rotaShifts] = await Promise.all([
      db.referral.count({ where: { serviceId: service.id } }),
      db.client.count({ where: { serviceId: service.id } }),
      db.property.count({ where: { serviceId: service.id } }),
      db.rotaShift.count({ where: { serviceId: service.id } })
    ]);
    if (referrals || clients || properties || rotaShifts) {
      const using = [
        referrals ? `${referrals} referral${referrals === 1 ? '' : 's'}` : '',
        clients ? `${clients} service-user record${clients === 1 ? '' : 's'}` : '',
        properties ? `${properties} propert${properties === 1 ? 'y' : 'ies'}` : '',
        rotaShifts ? `${rotaShifts} rota shift${rotaShifts === 1 ? '' : 's'}` : ''
      ].filter(Boolean).join(', ');
      return NextResponse.json({ error: `This service is still used by ${using}. Unpublish it instead — every linked record and its history stay intact, and it stops being offered to new referrals.` }, { status: 409 });
    }

    await db.service.delete({ where: { id: service.id } });
    await audit({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'SERVICE_DELETED',
      resourceType: 'Service',
      resourceId: service.id,
      before: { title: service.title, slug: service.slug, published: service.published },
      after: { deleted: true }
    });
    return NextResponse.json({ ok: true, id: service.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to delete the service.' : message }, { status });
  }
}