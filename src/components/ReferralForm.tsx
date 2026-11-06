'use client';

import { useState } from 'react';
import type { Service } from '@prisma/client';
import { useHydrated } from '@/lib/use-hydrated';

export function ReferralForm({ services }: { services: Pick<Service, 'id' | 'title'>[] }) {
  const hydrated = useHydrated();
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('sending'); setMessage('');
    const formElement = event.currentTarget;
    const response = await fetch('/api/referrals', { method: 'POST', body: new FormData(formElement) });
    const result = await response.json();
    if (response.ok) { window.location.href = `/referral-success?reference=${encodeURIComponent(result.reference)}`; } else { setState('error'); setMessage(result.error ?? 'We could not save that referral. Please try again.'); formElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  return <form className="form-card" onSubmit={submit} method="post">
    <h2>Referral form</h2>
    <p>All information is held securely and used only to assess this referral. It takes about ten minutes. You can use an anonymous identifier for domestic-abuse referrals.</p>
    {message && <div className="form-error" role="alert">{message}</div>}
    <div className="danger-callout"><strong>Immediate danger?</strong> Call 999. This form is not monitored as an emergency service.</div>

    <fieldset className="form-section">
      <legend><span className="form-step">1</span>About you</legend>
      <p className="form-hint">The person making the referral, so we can follow up with you.</p>
      <div className="form-grid">
        <div className="form-field"><label htmlFor="referrerName">Your name</label><input id="referrerName" name="referrerName" required autoComplete="name" /></div>
        <div className="form-field"><label htmlFor="referrerOrganisation">Organisation</label><input id="referrerOrganisation" name="referrerOrganisation" autoComplete="organization" /></div>
        <div className="form-field"><label htmlFor="referrerEmail">Your email</label><input id="referrerEmail" name="referrerEmail" type="email" required autoComplete="email" /></div>
        <div className="form-field"><label htmlFor="referrerPhone">Your phone</label><input id="referrerPhone" name="referrerPhone" type="tel" inputMode="tel" autoComplete="tel" /></div>
        <div className="form-field"><label htmlFor="referrerRole">Your role</label><input id="referrerRole" name="referrerRole" autoComplete="organization-title" placeholder="e.g. support worker" /></div>
        <div className="form-field"><label htmlFor="relationship">Relationship to the person</label><input id="relationship" name="relationship" placeholder="e.g. key worker, self-referral" /></div>
      </div>
    </fieldset>

    <fieldset className="form-section">
      <legend><span className="form-step">2</span>The person being referred</legend>
      <div className="form-grid">
        <div className="form-field full"><label htmlFor="personName">Name or permitted anonymous identifier</label><input id="personName" name="personName" required autoComplete="off" /><p className="form-hint">If it isn&apos;t safe to share their name yet, use initials or an identifier you have agreed with them.</p></div>
        <div className="form-field"><label htmlFor="ageRange">Age range</label><select id="ageRange" name="ageRange" defaultValue=""><option value="">Choose an age range</option><option>Under 18</option><option>18–25</option><option>26–49</option><option>50+</option><option>Prefer not to say</option></select></div>
        <div className="form-field"><label htmlFor="contactDetails">Safe contact details</label><input id="contactDetails" name="contactDetails" autoComplete="off" placeholder="Only a safe way to make contact" /></div>
        <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="anonymousDomesticAbuse" /><span><strong>This is an anonymous domestic-abuse referral</strong><small>I cannot safely provide identifying details yet.</small></span></label></div>
      </div>
    </fieldset>

    <fieldset className="form-section">
      <legend><span className="form-step">3</span>Their situation and needs</legend>
      <p className="form-hint">Keep it factual and limited to what we need for an initial assessment.</p>
      <div className="form-grid">
        <div className="form-field full"><label htmlFor="serviceId">Requested service</label><select id="serviceId" name="serviceId" defaultValue="" required><option value="">Choose a service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></div>
        <div className="form-field full"><label htmlFor="currentLocation">Current location or housing situation</label><textarea id="currentLocation" name="currentLocation" required className="is-short" placeholder="e.g. sofa-surfing with a friend in Leeds" /></div>
        <div className="form-field full"><label htmlFor="housingSituation">What is happening now?</label><textarea id="housingSituation" name="housingSituation" required placeholder="Current housing, what has changed, and what feels most urgent." /></div>
        <div className="form-field full"><label htmlFor="supportNeeds">Support needs</label><textarea id="supportNeeds" name="supportNeeds" required placeholder="Anything that will help us understand how to respond well." /></div>
        <div className="form-field full"><label htmlFor="knownRisks">Known risks</label><textarea id="knownRisks" name="knownRisks" className="is-short" placeholder="Keep this factual. Do not include details that are not needed for initial triage." /></div>
        <div className="form-field"><label htmlFor="accessibilityNeeds">Accessibility and communication needs</label><input id="accessibilityNeeds" name="accessibilityNeeds" placeholder="e.g. step-free access, interpreter" /></div>
        <div className="form-field"><label htmlFor="fundingRoute">Funding route</label><input id="fundingRoute" name="fundingRoute" placeholder="If known" /></div>
      </div>
    </fieldset>

    <fieldset className="form-section">
      <legend><span className="form-step">4</span>Consent</legend>
      <div className="form-grid">
        <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="consentGiven" required /><span>The person has consented to this referral, or I have a lawful safeguarding basis to share it. <span className="text-danger" aria-hidden="true">*</span></span></label></div>
        <div className="form-field full"><label className="checkbox-row"><input type="checkbox" name="privacyAcknowledged" required /><span>I have read the <a href="/privacy">privacy notice</a> and understand how this information will be used. <span className="text-danger" aria-hidden="true">*</span></span></label></div>
      </div>
    </fieldset>

    <input name="website" tabIndex={-1} autoComplete="off" className="honeypot" aria-hidden="true" />
    <div className="form-actions">
      <p className="form-hint">We will acknowledge your referral within seven days. Fields marked <span className="text-danger">*</span> are required.</p>
      <button className="button button-primary" disabled={!hydrated || state === 'sending'}>{state === 'sending' ? 'Sending referral…' : 'Submit referral'}</button>
    </div>
  </form>;
}
