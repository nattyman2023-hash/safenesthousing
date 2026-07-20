import { ResetPasswordForm } from '@/components/ResetPasswordForm';

export default async function ResetPasswordPage(props: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams;
  return <div className="auth-page"><section className="auth-panel"><div className="auth-panel-inner"><div className="wordmark wordmark-footer"><span>Safe Nest</span><small>Staff workspace</small></div><h1>A fresh start, securely.</h1><p>Reset links are short-lived and can only be used once.</p></div></section><section className="auth-form-wrap"><div className="auth-form"><div className="wordmark"><span>Safe Nest</span><small>Staff workspace</small></div><h2>Choose a new password</h2><p>Open this page from your secure reset email.</p>{searchParams.token ? <ResetPasswordForm token={searchParams.token} /> : <div className="form-error" role="alert">This reset link is missing its token.</div>}</div></section></div>;
}
