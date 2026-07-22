import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120),
  email: z.string().trim().email('Enter a valid email address.').max(160),
  phone: z.string().trim().max(40).optional(),
  category: z.string().trim().min(1, 'Choose an enquiry type.').max(80),
  message: z.string().trim().min(10, 'Please tell us a little more.').max(5000),
  consent: z.literal('on', { errorMap: () => ({ message: 'Please acknowledge the privacy notice.' }) }),
  website: z.string().max(0).optional()
});

export const referralSchema = z.object({
  referrerName: z.string().trim().min(2, 'Enter the referrer’s name.').max(120),
  referrerOrganisation: z.string().trim().max(160).optional(),
  referrerRole: z.string().trim().max(120).optional(),
  referrerEmail: z.string().trim().email('Enter a valid referrer email.').max(160),
  referrerPhone: z.string().trim().max(40).optional(),
  relationship: z.string().trim().max(120).optional(),
  personName: z.string().trim().min(2, 'Enter a name or permitted anonymous identifier.').max(160),
  ageRange: z.string().trim().max(40).optional(),
  contactDetails: z.string().trim().max(500).optional(),
  currentLocation: z.string().trim().min(2, 'Tell us where the person is currently staying.').max(500),
  serviceId: z.string().trim().min(1, 'Choose a service.'),
  housingSituation: z.string().trim().min(10, 'Tell us about the current housing situation.').max(4000),
  supportNeeds: z.string().trim().min(10, 'Tell us about the support needs.').max(4000),
  knownRisks: z.string().trim().max(4000).optional(),
  accessibilityNeeds: z.string().trim().max(1000).optional(),
  fundingRoute: z.string().trim().max(200).optional(),
  consentGiven: z.literal('on', { errorMap: () => ({ message: 'Please confirm consent or use the anonymous route.' }) }),
  privacyAcknowledged: z.literal('on', { errorMap: () => ({ message: 'Please acknowledge the privacy notice.' }) }),
  anonymousDomesticAbuse: z.string().optional(),
  website: z.string().max(0).optional()
});
