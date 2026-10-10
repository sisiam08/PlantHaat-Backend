import type { MailMessage } from "./mail.service";

export function buildVerificationEmail(params: { name: string; url: string }): MailMessage {
  const { name, url } = params;
  return {
    to: "",
    subject: "Verify your PlantHaat account",
    text: [
      `Hi ${name},`,
      "",
      "Welcome to PlantHaat! Please verify your email address to activate your account:",
      url,
      "",
      "This link expires in 24 hours. If you did not create an account, you can ignore this email.",
      "",
      "— The PlantHaat Team",
    ].join("\n"),
  };
}

export function buildSellerApprovedEmail(params: { name: string; shopName?: string }): MailMessage {
  const { name, shopName } = params;
  return {
    to: "",
    subject: "Your PlantHaat seller account is approved",
    text: [
      `Hi ${name},`,
      "",
      `Great news — your seller application${shopName ? ` for "${shopName}"` : ""} has been approved.`,
      "You can now list products and start receiving orders.",
      "",
      "— The PlantHaat Team",
    ].join("\n"),
  };
}

export function buildSellerRejectedEmail(params: { name: string; reason: string }): MailMessage {
  const { name, reason } = params;
  return {
    to: "",
    subject: "Your PlantHaat seller application needs attention",
    text: [
      `Hi ${name},`,
      "",
      "Unfortunately your seller application was not approved this time.",
      "",
      `Reason: ${reason}`,
      "",
      "You can update your application and submit it again.",
      "",
      "— The PlantHaat Team",
    ].join("\n"),
  };
}

export function buildPasswordResetEmail(params: { name: string; url: string }): MailMessage {
  const { name, url } = params;
  return {
    to: "",
    subject: "Reset your PlantHaat password",
    text: [
      `Hi ${name},`,
      "",
      "We received a request to reset your PlantHaat password. Use the link below to choose a new one:",
      url,
      "",
      "This link expires in 1 hour. If you did not request this, you can safely ignore this email.",
      "",
      "— The PlantHaat Team",
    ].join("\n"),
  };
}
