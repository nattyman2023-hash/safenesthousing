import { redirect } from 'next/navigation';
import { getCurrentUser } from './auth';

/** Server-component guard for CRM pages. Route handlers keep using auth.requireUser
 * so unauthenticated API calls remain ordinary 401 responses. */
export async function requireCrmUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/staff/login');
  return user;
}
