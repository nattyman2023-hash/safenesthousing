import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { serviceCreateSchema } from '@/lib/crm-validation';
import { db } from '@/lib/db';
import { isValidServiceSlug, serviceSlugFromTitle } from '@/lib/service-slug';

/**
 * POST /api/crm/content/services — create a Service.
 *
 * Before this endpoint existed a Service row could only be produced by `prisma/seed.ts` (which must
 * never run in production), Prisma Studio, or direct SQL. An installation created the supported way —
 * `npm run bootstrap:admin` — therefore had zero services, because no migration inserts one either.
 * Service rows are load-bearing: internal referral intake only accepts a published service in the
 * caller's organisation (`referralServiceWhere` in src/lib/service-catalogue.ts), `POST /api/referrals`
 * applies the same rule to the public form, and clients, properties and rota shifts link to a service
 * by id. With zero rows both referral forms had nothing to offer and nothing they could accept, and
 * staff had no way to fix it themselves. Creating a service is an operational requirement.
 *
 * The row is always organisation-scoped: `organisationId` comes from the signed-in user and is never
 * read from the request body, so one organisation cannot create a service inside another.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = serviceCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the service details.' }, { status: 400 });

    const slug = parsed.data.slug ?? serviceSlugFromTitle(parsed.data.title);
    if (!isValidServiceSlug(slug)) {
      return NextResponse.json({ error: 'Use a slug of lower-case letters, numbers and single hyphens, or leave it blank to generate one from the service name.' }, { status: 400 });
    }

    const clash = await db.service.findFirst({ where: { organisationId: user.organisationId, slug }, select: { id: true, title: true } });
    if (clash) return NextResponse.json({ error: `Another service already uses the slug "${slug}" (${clash.title}). Change the service name or the slug.` }, { status: 409 });

    const service = await db.service.create({
      data: {
        organisationId: user.organisationId,
        title: parsed.data.title,
        slug,
        summary: parsed.data.summary,
        content: parsed.data.content,
        audience: parsed.data.audience,
        referralRoutes: parsed.data.referralRoutes,
        eligibility: parsed.data.eligibility,
        supportModel: parsed.data.supportModel,
        displayOrder: parsed.data.displayOrder ?? 0,
        published: parsed.data.published
      }
    });

    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'SERVICE_CREATED', resourceType: 'Service', resourceId: service.id, after: { title: service.title, slug: service.slug, published: service.published } });
    return NextResponse.json({ id: service.id, slug: service.slug, published: service.published }, { status: 201 });
  } catch (error) {
    // Two staff members can submit the same name at the same moment; the unique index decides, and
    // that race is reported as the same slug clash rather than as an unexplained server error.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Another service already uses that slug. Change the service name or the slug.' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to create the service.' : message }, { status });
  }
}
