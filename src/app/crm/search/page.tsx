import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { searchCrmRecords } from '@/lib/crm-search';
import { CrmPageHeader, EmptyState, TableCard } from '@/components/CrmUI';

export default async function SearchPage(props: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const query = searchParams.q?.trim() ?? '';
  const results = user ? await searchCrmRecords(user, query) : [];
  return <div className="crm-page"><CrmPageHeader eyebrow="Workspace search" title="Search records" intro="Search only returns records your role and service/property scope allow you to see." /><form className="filter-bar" method="get"><label className="search-box" htmlFor="crm-search-query"><input id="crm-search-query" name="q" defaultValue={query} placeholder="Name, reference, property, or status" autoFocus /></label><button className="crm-button crm-button-primary" type="submit">Search</button></form>{query.length < 2 ? <EmptyState title="Start with two characters" message="Search client names, referrals, incidents, properties, invoices, or claim statuses." /> : results.length ? <TableCard title="Search results" count={`${results.length} records`}><table className="crm-table"><thead><tr><th>Type</th><th>Record</th><th>Details</th><th>Access</th></tr></thead><tbody>{results.map((result) => <tr key={`${result.type}-${result.id}`}><td>{result.type}</td><td><Link href={result.href}><strong>{result.title}</strong></Link></td><td>{result.subtitle}</td><td>{result.restricted ? 'Restricted' : 'Permitted'}</td></tr>)}</tbody></table></TableCard> : <EmptyState title="No matching records" message="Try a client reference, referral reference, property name, or status." />}</div>;
}
