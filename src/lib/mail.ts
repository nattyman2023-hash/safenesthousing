import nodemailer from 'nodemailer';
import { config } from './env';

function emailProvider(environment: NodeJS.ProcessEnv = process.env) {
  return environment.EMAIL_PROVIDER ?? (environment.EMAILIT_API_KEY ? 'emailit' : 'smtp');
}

export function mailAdapterStatus(environment: NodeJS.ProcessEnv = process.env) {
  const provider = emailProvider(environment);
  if (provider === 'emailit') return { provider, configured: !!environment.EMAILIT_API_KEY, authenticated: !!environment.EMAILIT_API_KEY };
  return { provider: 'smtp', configured: !!environment.SMTP_HOST && !!environment.SMTP_PORT, authenticated: !!environment.SMTP_USER };
}

export async function sendSafeEmail(input: { to: string; subject: string; text: string; html: string }): Promise<{ sent: boolean; messageId?: string }> {
  const provider = emailProvider();
  if (provider === 'emailit') {
    const apiKey = process.env.EMAILIT_API_KEY;
    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') throw new Error('EMAILIT_NOT_CONFIGURED');
      console.info(`[safe-email:development] ${input.subject} -> ${input.to}`);
      return { sent: false };
    }
    const response = await fetch(process.env.EMAILIT_API_URL ?? 'https://api.emailit.com/v2/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.emailFrom, to: input.to, subject: input.subject, text: input.text, html: input.html })
    });
    if (!response.ok) throw new Error('EMAILIT_SEND_FAILED');
    const result = await response.json() as { id?: string; message_id?: string };
    return { sent: true, messageId: result.message_id ?? result.id };
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_NOT_CONFIGURED');
    console.info(`[safe-email:development] ${input.subject} -> ${input.to}`);
    return { sent: false };
  }
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined });
  const result = await transport.sendMail({ from: config.emailFrom, to: input.to, subject: input.subject, text: input.text, html: input.html });
  return { sent: true, messageId: result.messageId };
}
