import nodemailer from 'nodemailer';
import { config } from './env';

export function mailAdapterStatus(environment: NodeJS.ProcessEnv = process.env) {
  return { provider: 'smtp', configured: !!environment.SMTP_HOST && !!environment.SMTP_PORT, authenticated: !!environment.SMTP_USER };
}

export async function sendSafeEmail(input: { to: string; subject: string; text: string; html: string }): Promise<{ sent: boolean; messageId?: string }> {
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
