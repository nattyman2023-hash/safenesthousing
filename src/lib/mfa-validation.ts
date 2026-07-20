import { z } from 'zod';

export const mfaCodeSchema = z.object({ code: z.string().trim().min(6).max(20).refine((value) => /^\d{6}$/.test(value) || /^[A-HJ-NP-Z2-9]{5}-?[A-HJ-NP-Z2-9]{5}$/i.test(value), 'Enter a six-digit authenticator code or a recovery code.') });
