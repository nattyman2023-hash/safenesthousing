import Link from 'next/link';
export default async function ReferralSuccessPage(props: { searchParams: Promise<{ reference?: string }> }) {
  const searchParams = await props.searchParams;
  return <main><section className="not-found"><div className="container"><p className="eyebrow">Referral received</p><h1>Thank you.</h1><p className="muted">Your referral has been saved securely. Your reference is <strong>{searchParams.reference ?? 'available in your confirmation email'}</strong>.</p><p className="muted">Please keep it for your records. We will use it when we contact you about the next step.</p><Link href="/" className="button button-primary">Back to Safe Nest</Link></div></section></main>;
}
