import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CrmPageHeader, FilterBar, StatusBadge, TableCard } from '@/components/CrmUI';
import { UserAccessControl } from '@/components/UserAccessControl';
import { UserInviteForm } from '@/components/UserInviteForm';

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [users, roles] = await Promise.all([
    db.user.findMany({ where: { organisationId: user.organisationId }, include: { memberships: { include: { role: true } } }, orderBy: { name: 'asc' } }).catch(() => []),
    db.role.findMany({ where: { organisationId: user.organisationId }, select: { slug: true, name: true }, orderBy: { name: 'asc' } }).catch(() => [])
  ]);
  const roleOptions = roles.length ? roles.map((role) => ({ slug: role.slug, name: role.name })) : [{ slug: 'organisation-user', name: 'Organisation user' }];
  return <div className="crm-page"><CrmPageHeader eyebrow="Organisation" title="Users" intro="Manage staff accounts. Legacy role labels are retained for data compatibility and do not limit CRM access." action="Invite user" actionHref="#invite" /><UserInviteForm roles={roleOptions} /><FilterBar placeholder="Search staff"><select data-filter-status className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="User status"><option value="ALL">All users</option><option value="ACTIVE">Active</option><option value="DEACTIVATED">Deactivated</option></select></FilterBar><TableCard title="Organisation users" count={`${users.length} users`}><table className="crm-table"><thead><tr><th>Name</th><th>Email</th><th>Role label</th><th>Status</th></tr></thead><tbody>{users.length ? users.map((staff) => { const activeMembership = staff.memberships.find((membership) => membership.active) ?? staff.memberships[0]; return <tr key={staff.id}><td><strong>{staff.name}</strong><br /><span className="muted">{staff.jobTitle ?? 'Staff member'}</span></td><td>{staff.email}</td><td><UserAccessControl userId={staff.id} active={staff.active} roleSlug={activeMembership?.role.slug ?? ''} roles={roleOptions} /></td><td><StatusBadge status={staff.active ? 'ACTIVE' : 'DEACTIVATED'} tone={staff.active ? 'success' : 'warning'} /></td></tr>; }) : <tr><td colSpan={4}>No users recorded.</td></tr>}</tbody></table></TableCard></div>;
}
