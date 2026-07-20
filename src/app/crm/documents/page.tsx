import { CrmPageHeader, FilterBar, RestrictedNote, StatusBadge, TableCard } from '@/components/CrmUI';
import { DocumentUploadForm } from '@/components/DocumentUploadForm';
import { db } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';

function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const canRead = await hasPermission(user, 'documents.read');
  const canWrite = await hasPermission(user, 'documents.write');
  if (!user || !canRead) return <div className="crm-page"><CrmPageHeader eyebrow="Private storage" title="Documents" intro="Private documents are limited to authorised staff." /><div className="form-error" role="alert">You are not authorised to view private documents.</div></div>;
  const canViewRestricted = user.memberships.some((membership) => ['super-administrator', 'organisation-administrator', 'safeguarding-lead', 'service-manager', 'support-lead'].includes(membership.role.slug));
  const docs = await db.document.findMany({ where: { organisationId: user.organisationId, ...(canViewRestricted ? {} : { restricted: false }) }, orderBy: { createdAt: 'desc' } }).catch(() => []);
  return <div className="crm-page"><CrmPageHeader eyebrow="Private storage" title="Documents" intro="Protected files are served through authorised downloads and every view is logged." action={canWrite ? 'Upload document' : undefined} actionHref={canWrite ? '#upload' : undefined} /><RestrictedNote />{canWrite && <DocumentUploadForm />}<FilterBar placeholder="Search file name"><select className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="Document category"><option value="ALL">All categories</option><option>Compliance</option><option>Support plan</option><option>Referral</option></select></FilterBar><TableCard title="Document register" count={`${docs.length} files`}><table className="crm-table"><thead><tr><th>Document</th><th>Category</th><th>Size</th><th>Access</th><th>Scan</th><th>Download</th></tr></thead><tbody>{docs.length ? docs.map((doc) => <tr key={doc.id}><td><strong>{doc.displayName}</strong></td><td>{doc.category}</td><td>{formatBytes(doc.sizeBytes)}</td><td>{doc.restricted ? <StatusBadge status="RESTRICTED" tone="warning" /> : <StatusBadge status="PERMITTED" tone="success" />}</td><td>{doc.malwareScanStatus === 'CLEAN' ? <StatusBadge status="CLEAN" tone="success" /> : <StatusBadge status={doc.malwareScanStatus} tone="warning" />}</td><td><a href={`/api/crm/documents/${doc.id}/download`}>Download</a></td></tr>) : <tr><td colSpan={6}>No private documents uploaded yet.</td></tr>}</tbody></table></TableCard></div>;
}
