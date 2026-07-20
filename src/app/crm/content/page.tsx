import { db } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { CrmPageHeader, EmptyState, StatusBadge } from '@/components/CrmUI';
import { NewsContentForm } from '@/components/NewsContentForm';
import { ServiceContentForm } from '@/components/ServiceContentForm';

export default async function ContentPage() {
  const user = await getCurrentUser();
  const canWrite = await hasPermission(user, 'content.write');
  if (!user || !canWrite) return <div className="crm-page"><CrmPageHeader eyebrow="Public content" title="Content administration" intro="Edit the public services and news library with publish controls." /><EmptyState title="Content administration access required" message="Ask an administrator to grant content.write access to this area." /></div>;
  const [services, posts] = await Promise.all([
    db.service.findMany({ where: { organisationId: user.organisationId }, orderBy: { displayOrder: 'asc' } }).catch(() => []),
    db.newsPost.findMany({ where: { organisationId: user.organisationId }, include: { category: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }).catch(() => [])
  ]);
  return <div className="crm-page"><CrmPageHeader eyebrow="Public content" title="Content administration" intro="Edit public service and news content. Saving and publishing are audited." /><section className="crm-panel"><div className="panel-header"><h2>Services <span style={{ color: 'var(--muted)', fontSize: 10 }}>{services.length} records</span></h2></div><div className="panel-body">{services.length ? services.map((service) => <details key={service.id} style={{ marginBottom: 12, borderBottom: '1px solid #edf1f1', paddingBottom: 12 }} open><summary style={{ cursor: 'pointer', color: 'var(--navy-900)', fontWeight: 700 }}>{service.title} <StatusBadge status={service.published ? 'PUBLISHED' : 'DRAFT'} tone={service.published ? 'success' : 'warning'} /></summary><div style={{ marginTop: 16 }}><ServiceContentForm service={service} /></div></details>) : <p className="muted">No services found.</p>}</div></section><section className="crm-panel" style={{ marginTop: 18 }}><div className="panel-header"><h2>News and stories <span style={{ color: 'var(--muted)', fontSize: 10 }}>{posts.length} records</span></h2></div><div className="panel-body">{posts.length ? posts.map((post) => <details key={post.id} style={{ marginBottom: 12, borderBottom: '1px solid #edf1f1', paddingBottom: 12 }}><summary style={{ cursor: 'pointer', color: 'var(--navy-900)', fontWeight: 700 }}>{post.title} <StatusBadge status={post.published ? 'PUBLISHED' : 'DRAFT'} tone={post.published ? 'success' : 'warning'} /></summary><div style={{ marginTop: 16 }}><NewsContentForm post={post} /></div></details>) : <p className="muted">No news posts found.</p>}</div></section></div>;
}
