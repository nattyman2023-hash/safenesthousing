import { db } from '@/lib/db';
import { getCurrentUser, hasPermission, roleRequiresMfa } from '@/lib/auth';
import { CrmPageHeader, EmptyState, FilterBar, StatusBadge, TableCard } from '@/components/CrmUI';
import { UserAccessControl } from '@/components/UserAccessControl';
import { UserInviteForm } from '@/components/UserInviteForm';

export default async function UsersPage() {
  const user = await getCurrentUser();
  const canManage = await hasPermission(user, 'users.manage');
  if (!user || !canManage) return <div className="crm-page"><CrmPageHeader eyebrow="Access control" title="Users & roles" intro="Role-based access with service and property scoping." /><EmptyState title="Administration access required" message="Only authorised organisation administrators can manage user access." /></div>;
  const [users, roles] = await Promise.all([
    db.user.findMany({ where: { organisationId: user.organisationId }, include: { memberships: { include: { role: true } } }, orderBy: { name: 'asc' } }).catch(() => []),
    db.role.findMany({ where: { organisationId: user.organisationId }, select: { slug: true, name: true }, orderBy: { name: 'asc' } }).catch(() => [])
  ]);
  const roleOptions = roles.map((role) => ({ slug: role.slug, name: role.name }));
  return <div className="crm-page"><CrmPageHeader eyebrow="Access control" title="Users & roles" intro="Role-based access with service and property scoping." action="Invite user" actionHref="#invite" /><UserInviteForm roles={roleOptions} /><FilterBar placeholder="Search staff"><select className="crm-button crm-button-secondary" defaultValue="ALL" aria-label="User status"><option value="ALL">All users</option><option value="ACTIVE">Active</option><option value="INACTIVE">Deactivated</option></select></FilterBar><TableCard title="Organisation users" count={`${users.length} users`}><table className="crm-table"><thead><tr><th>Name</th><th>Email</th><th>Role and access</th><th>Status</th><th>MFA</th></tr></thead><tbody>{users.length ? users.map((staff) => { const activeMembership = staff.memberships.find((membership) => membership.active) ?? staff.memberships[0]; const mfaRequired = staff.mfaRequired || !!activeMembership && roleRequiresMfa(activeMembership.role.slug); return <tr key={staff.id}><td><strong>{staff.name}</strong><br /><span className="muted">{staff.jobTitle ?? 'Staff member'}</span></td><td>{staff.email}</td><td><UserAccessControl userId={staff.id} active={staff.active} roleSlug={activeMembership?.role.slug ?? ''} roles={roleOptions} /></td><td><StatusBadge status={staff.active ? 'ACTIVE' : 'DEACTIVATED'} tone={staff.active ? 'success' : 'warning'} /></td><td>{mfaRequired ? <StatusBadge status="REQUIRED" tone="success" /> : <StatusBadge status="OPTIONAL" />}</td></tr>; }) : <tr><td colSpan={5}>No users recorded.</td></tr>}</tbody></table></TableCard></div>;
}
