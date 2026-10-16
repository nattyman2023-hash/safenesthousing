import Link from 'next/link';
import { db } from '@/lib/db';
import { requireCrmUser as requireUser } from '@/lib/crm-auth';
import { CrmPageHeader, StatusBadge, TableCard } from '@/components/CrmUI';
import { ServiceCreateForm } from '@/components/ServiceCreateForm';
import { ServiceContentForm } from '@/components/ServiceContentForm';
import { ServiceDeleteControl } from '@/components/ServiceDeleteControl';
import { ServicePublishControl } from '@/components/ServicePublishControl';

/**
 * Settings → Services.
 *
 * Service rows are load-bearing rather than decorative: internal referral intake only accepts a
 * published service in the caller's organisation (`referralServiceWhere`), `POST /api/referrals`
 * applies the same rule to the public form, and clients, properties and rota shifts link to a service
 * by id. Until this page existed the only ways to create one were `prisma/seed.ts` (which must never
 * run in production), Prisma Studio, or direct SQL — so an installation bootstrapped with
 * `npm run bootstrap:admin` had zero services, empty referral menus, and no staff-facing remedy.
 *
 * Everything here is organisation-scoped and audited. Deletion is refused while other records depend
 * on the service; unpublishing is the reversible alternative and keeps every linked record intact.
 */
export default async function ServicesSettingsPage() {
  const user = await requireUser();
  const services = await db.service.findMany({
    where: { organisationId: user.organisationId },
    orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    include: { _count: { select: { referrals: true, clients: true, properties: true } } }
  }).catch(() => []);
  // RotaShift stores a serviceId with no Prisma relation to Service, so rota usage cannot be read
  // through _count and is counted here. The delete endpoint refuses on the same four counts.
  const rotaCounts = await db.rotaShift.groupBy({ by: ['serviceId'], where: { serviceId: { in: services.map((service) => service.id) } }, _count: { _all: true } }).catch(() => []);
  const rotaByService = new Map(rotaCounts.map((row) => [row.serviceId, row._count._all]));
  const publishedCount = services.filter((service) => service.published).length;
  const dateLabel = (value: Date) => value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return <div className="crm-page">
    <CrmPageHeader eyebrow="Organisation administration / Settings" title="Services" intro="Services drive referral intake, the public services pages, and the service links on client, property and rota records." action="Add Service" actionHref="#add-service" />

    {services.length === 0 && <section className="crm-panel" id="service-empty-state"><div className="panel-header"><h2>No services configured</h2></div><div className="panel-body">
      <p>SafeNest needs at least one active Service before referrals can be created.</p>
      <p className="muted">Both referral forms refuse a submission that does not name a published service in your organisation, so with no services their menus are empty and no referral can be recorded. Add the first service below — no seed script, database tool, or developer is needed.</p>
      <a className="crm-button crm-button-primary" href="#add-service">Add Service</a>
    </div></section>}

    <TableCard title="Configured services" count={`${services.length} records · ${publishedCount} published`}>
      {services.length ? <table className="crm-table">
        <thead><tr><th>Service</th><th>Status</th><th>Referrals</th><th>Clients</th><th>Properties</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>{services.map((service) => <tr key={service.id}>
          <td><strong>{service.title}</strong><br /><span className="muted" style={{ fontSize: 11 }}>/services/{service.slug} · order {service.displayOrder}</span><br /><span className="muted" style={{ fontSize: 11 }}>{service.summary}</span></td>
          <td><StatusBadge status={service.published ? 'PUBLISHED' : 'DRAFT'} tone={service.published ? 'success' : 'warning'} /></td>
          <td>{service._count.referrals}</td>
          <td>{service._count.clients}</td>
          <td>{service._count.properties}</td>
          <td>{dateLabel(service.updatedAt)}</td>
          <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <ServicePublishControl serviceId={service.id} title={service.title} published={service.published} />
            <ServiceDeleteControl serviceId={service.id} title={service.title} references={{ referrals: service._count.referrals, clients: service._count.clients, properties: service._count.properties, rotaShifts: rotaByService.get(service.id) ?? 0 }} />
          </div></td>
        </tr>)}</tbody>
      </table> : <p className="muted">No services yet. Use Add Service below.</p>}
    </TableCard>

    <section className="crm-panel" id="add-service" style={{ marginTop: 18 }}><div className="panel-header"><h2>Add Service</h2></div><div className="panel-body"><ServiceCreateForm /></div></section>

    {services.length > 0 && <section className="crm-panel" style={{ marginTop: 18 }}><div className="panel-header"><h2>Edit service content</h2></div><div className="panel-body">{services.map((service) => <details key={service.id} style={{ marginBottom: 12, borderBottom: '1px solid #edf1f1', paddingBottom: 12 }}><summary style={{ cursor: 'pointer', color: 'var(--navy-900)', fontWeight: 700 }}>{service.title}</summary><div style={{ marginTop: 16 }}><ServiceContentForm service={service} /></div></details>)}</div></section>}

    <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>Public service and news copy is also editable from <Link href="/crm/content">Content administration</Link>. Every change on this page is written to the <Link href="/crm/audit">audit log</Link>.</p>
  </div>;
}
