import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { SITE } from './site';

export const mailEnabled = Boolean(
  process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD
);

let transport: Transporter | undefined;

/** Sends a plain-text message. Returns false, without throwing, when it could not be sent. */
export async function sendMail(to: string, subject: string, lines: string[]) {
  if (!mailEnabled) return false;
  const port = Number(process.env.SMTP_PORT) || 465;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASSWORD! },
    connectionTimeout: 15000,
  });
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM?.trim() || `${SITE.name} <${process.env.SMTP_USER!.trim()}>`,
      to,
      subject,
      text: [...lines, '', `— ${SITE.name} by ${SITE.publisher}`, SITE.url].join('\n'),
    });
    return true;
  } catch {
    console.error('An email could not be sent.');
    return false;
  }
}
