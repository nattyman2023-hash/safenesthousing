import { describe, expect, it } from 'vitest';
import { assertReferralTransition, canCloseDataSubjectRequest, canTransitionReferral, hasOccupancyOverlap, hasRotaOverlap, invoiceRemaining, invoiceTotal, isRoomAvailable, isTaskOverdue } from '@/lib/domain';
import { contactSchema, referralSchema } from '@/lib/validation';

describe('referral transitions', () => {
  it('allows an auditable progression from new to triage', () => expect(canTransitionReferral('NEW', 'TRIAGE')).toBe(true));
  it('rejects reopening a closed referral', () => { expect(canTransitionReferral('CLOSED', 'TRIAGE')).toBe(false); expect(() => assertReferralTransition('CLOSED', 'TRIAGE')).toThrow(); });
});

describe('occupancy and task rules', () => {
  it('prevents overlapping active room occupancy', () => { const records = [{ startDate: new Date('2026-07-01'), endDate: null }]; expect(hasOccupancyOverlap(records, new Date('2026-07-10'), null)).toBe(true); expect(hasOccupancyOverlap(records, new Date('2026-08-01'), null)).toBe(true); });
  it('calculates availability only for an available room with no active record', () => { expect(isRoomAvailable('AVAILABLE', 0)).toBe(true); expect(isRoomAvailable('AVAILABLE', 1)).toBe(false); expect(isRoomAvailable('OCCUPIED', 0)).toBe(false); });
  it('marks open past-due tasks as overdue', () => { expect(isTaskOverdue({ status: 'OPEN', dueAt: new Date('2020-01-01') }, new Date('2026-01-01'))).toBe(true); expect(isTaskOverdue({ status: 'DONE', dueAt: new Date('2020-01-01') }, new Date('2026-01-01'))).toBe(false); });
  it('blocks overlapping rota assignments while allowing adjacent shifts', () => { const existing = [{ startsAt: new Date('2026-07-19T08:00:00Z'), endsAt: new Date('2026-07-19T16:00:00Z') }]; expect(hasRotaOverlap(existing, new Date('2026-07-19T15:00:00Z'), new Date('2026-07-19T17:00:00Z'))).toBe(true); expect(hasRotaOverlap(existing, new Date('2026-07-19T16:00:00Z'), new Date('2026-07-19T18:00:00Z'))).toBe(false); });
  it('totals invoice items in minor units', () => expect(invoiceTotal([{ quantity: 2, unitMinor: 1250 }, { quantity: 1, unitMinor: 500 }])).toBe(3000));
  it('never reports a negative invoice balance', () => expect(invoiceRemaining(3000, [{ amountMinor: 1250 }, { amountMinor: 2500 }])).toBe(0));
});

describe('public form validation', () => {
  it('rejects invalid contact details', () => expect(contactSchema.safeParse({ name: 'A', email: 'nope', category: '', message: 'short', consent: 'off' }).success).toBe(false));
  it('accepts a complete referral payload', () => expect(referralSchema.safeParse({ referrerName: 'J. Whitfield', referrerEmail: 'j@example.test', personName: 'A. Morgan', currentLocation: 'Temporary accommodation', serviceId: 'svc', housingSituation: 'Housing has broken down and a safe place is needed.', supportNeeds: 'Tenancy support and a stable home.', consentGiven: 'on', privacyAcknowledged: 'on' }).success).toBe(true));
});

describe('governance safeguards', () => {
  it('blocks closing a request while a legal hold is active', () => {
    expect(canCloseDataSubjectRequest('COMPLETED', true)).toBe(false);
    expect(canCloseDataSubjectRequest('DECLINED', true)).toBe(false);
    expect(canCloseDataSubjectRequest('COMPLETED', false)).toBe(true);
  });
});
