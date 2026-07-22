import { BrandLogo } from '@/components/BrandLogo';
import { ForgotPasswordForm } from '@/components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return <div className="auth-page"><section className="auth-panel"><div className="auth-panel-inner"><div className="wordmark wordmark-footer"><span>Safe Nest</span><small>Staff workspace</small></div><h1>We can help you get back in.</h1><p>Enter your work email and, if it is recognised, we will send a short-lived reset link.</p></div></section><section className="auth-form-wrap"><div className="auth-form"><BrandLogo className="brand-logo-auth" /><h2>Reset your password</h2><p>The reset email never includes sensitive case information.</p><ForgotPasswordForm /></div></section></div>;
}
