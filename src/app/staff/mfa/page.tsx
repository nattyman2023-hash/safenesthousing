import { MfaForm } from '@/components/MfaForm';

export default async function MfaPage(props: { searchParams: Promise<{ setup?: string }> }) {
  const searchParams = await props.searchParams;
  const setup = searchParams.setup === '1';
  return <div className="auth-page"><section className="auth-panel"><div className="auth-panel-inner"><div className="wordmark wordmark-footer"><span>Safe Nest</span><small>Staff workspace</small></div><h1>Security that supports good work.</h1><p>Privileged users use an authenticator app or a one-time recovery code for an additional sign-in check.</p></div></section><section className="auth-form-wrap"><div className="auth-form"><div className="wordmark"><span>Safe Nest</span><small>Staff workspace</small></div><h2>{setup ? 'Set up multi-factor authentication' : 'Multi-factor authentication'}</h2><p>{setup ? 'Add the secret to an authenticator app, then enter the six-digit code it produces. You will receive recovery codes after setup.' : 'Enter the six-digit code from your authenticator app, or use a saved recovery code.'}</p><MfaForm setup={setup} /></div></section></div>;
}
