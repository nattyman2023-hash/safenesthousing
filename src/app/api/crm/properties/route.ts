import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { propertyCreateSchema } from '@/lib/crm-validation';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'property';
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('properties.write');
    const parsed = propertyCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the property details.' }, { status: 400 });
    if (parsed.data.serviceId) {
      const service = await db.service.findFirst({ where: { id: parsed.data.serviceId, organisationId: user.organisationId } });
      if (!service) return NextResponse.json({ error: 'Choose a service from your organisation.' }, { status: 400 });
    }
    let slug = slugify(parsed.data.publicName);
    const existing = await db.property.findUnique({ where: { organisationId_slug: { organisationId: user.organisationId, slug } } });
    if (existing) slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    const property = await db.property.create({
      data: {
        organisationId: user.organisationId,
        serviceId: parsed.data.serviceId || undefined,
        publicName: parsed.data.publicName,
        slug,
        neighbourhood: parsed.data.neighbourhood,
        serviceType: parsed.data.serviceType,
        publicSummary: parsed.data.publicSummary,
        eligibility: parsed.data.eligibility,
        capacity: parsed.data.capacity,
        publicVacancyState: parsed.data.publicVacancyState,
        accessibility: parsed.data.accessibility,
        confidential: parsed.data.confidential
      }
    });
    await audit({ organisationId: user.organisationId, actorId: user.id, action: 'PROPERTY_CREATED', resourceType: 'Property', resourceId: property.id, after: { publicName: property.publicName, capacity: property.capacity, confidential: property.confidential } });
    return NextResponse.json({ id: property.id, slug: property.slug });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'AUTH_REQUIRED' ? 401 : message === 'FORBIDDEN' ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to create the property.' : message }, { status });
  }
}
