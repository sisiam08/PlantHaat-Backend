import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

import { AppConfigService } from "../../config/app-config.service";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: AppConfigService) {
    this.transporter =
      config.values.MAIL_TRANSPORT === "smtp"
        ? nodemailer.createTransport({
            host: config.values.SMTP_HOST,
            port: config.values.SMTP_PORT ?? 587,
            auth: config.values.SMTP_USER
              ? { user: config.values.SMTP_USER, pass: config.values.SMTP_PASS }
              : undefined,
          })
        : null;
  }

  /** Fire-and-forget: mail failures must never fail the main request. */
  queue(message: MailMessage): void {
    this.send(message).catch((error: unknown) => {
      this.logger.error(
        `Failed to send email to ${message.to}`,
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  private async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[mail:log] to=${message.to} subject="${message.subject}"\n${message.text}`);
      return;
    }
    await this.transporter.sendMail({
      from: this.config.values.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
