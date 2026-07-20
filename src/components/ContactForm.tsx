'use client';

import { useState } from 'react';

export function ContactForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/contact', { method: 'POST', body: new FormData(formElement) });
    const result = await response.json();
    if (response.ok) { setState('success'); setMessage(`Thanks — your message reference is ${result.reference}.`); formElement.reset(); } else { setState('error'); setMessage(result.error ?? 'We could not send that message. Please try again.'); }
  }
  return <form className="form-card" onSubmit={submit}><h2>Send a message</h2><p>We will respond during office hours. Please do not include urgent or highly sensitive information here.</p>{message && <div className={state === 'success' ? 'form-success' : 'form-error'} role="status">{message}</div>}<div className="form-grid"><div className="form-field"><label htmlFor="name">Name <span>*</span></label><input id="name" name="name" required /></div><div className="form-field"><label htmlFor="email">Email <span>*</span></label><input id="email" name="email" type="email" required /></div><div className="form-field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" /></div><div className="form-field"><label htmlFor="category">Enquiry type <span>*</span></label><select id="category" name="category" defaultValue="General"><option>General</option><option>Property enquiry</option><option>Referral question</option><option>Partnership</option><option>Feedback</option></select></div><div className="form-field full"><label htmlFor="message">Message <span>*</span></label><textarea id="message" name="message" required /></div><div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="consent" required /> I agree that Safe Nest may use these details to respond to my enquiry. <a href="/privacy">Privacy notice</a>.</label></div><input name="website" tabIndex={-1} autoComplete="off" className="honeypot" /><div className="form-field full"><button className="button button-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send message'}</button></div></div></form>;
}
