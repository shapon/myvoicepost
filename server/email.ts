import nodemailer from "nodemailer";

export const RESET_TOKEN_EXPIRY_HOURS = 1;

const WEB_APP_URL = process.env.WEB_APP_URL || "https://myvoicepost.com";

// --- Shared SMTP helper ------------------------------------------------------

function createSmtpTransporter(): { transporter: nodemailer.Transporter; emailFrom: string } | null {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser || "";

  if (!smtpHost || !smtpUser || !smtpPass) return null;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
    ...(smtpPort === 587 && !smtpSecure && {
      requireTLS: true,
      tls: { ciphers: "SSLv3", rejectUnauthorized: false },
    }),
  });

  return { transporter, emailFrom };
}

// --- Branded HTML template builder ------------------------------------------

function buildNotificationEmail(
  subject: string,
  bodyHtml: string,
  ctaLabel: string,
  ctaUrl: string,
  headerColor = "linear-gradient(135deg,#667eea 0%,#764ba2 100%)"
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${subject}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:${headerColor};padding:30px;text-align:center;border-radius:10px 10px 0 0;">
    <h1 style="color:white;margin:0;font-size:28px;">MyVoicePost</h1>
  </div>
  <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
    ${bodyHtml}
    <div style="text-align:center;margin:28px 0;">
      <a href="${ctaUrl}" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">${ctaLabel}</a>
    </div>
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:25px 0;">
    <p style="color:#888;font-size:13px;margin-bottom:0;">— The MyVoicePost Team</p>
  </div>
  <div style="text-align:center;padding:20px;color:#999;font-size:12px;">
    <p>&copy; ${new Date().getFullYear()} MyVoicePost. All rights reserved.</p>
  </div>
</body>
</html>`;
}

// --- Notification email functions --------------------------------------------

export async function sendSubscriptionRenewedEmail(email: string, planName: string): Promise<void> {
  const smtp = createSmtpTransporter();
  if (!smtp) { console.warn("[Email] SMTP not configured — skipping subscription_renewed email"); return; }
  try {
    const body = `
      <h2 style="margin-top:0;">Your subscription has been renewed</h2>
      <p>Great news! Your <strong>${planName}</strong> subscription has been successfully renewed. Your recording minutes have been refreshed and are ready to use.</p>
      <p style="color:#666;font-size:14px;">You can check your remaining minutes and subscription details in the app at any time.</p>`;
    const html = buildNotificationEmail(
      "Subscription Renewed",
      body,
      "Open App",
      `${WEB_APP_URL}/subscription`
    );
    await smtp.transporter.sendMail({
      from: smtp.emailFrom,
      to: email,
      subject: `MyVoicePost - ${planName} Subscription Renewed`,
      text: `Your MyVoicePost ${planName} subscription has been renewed. Your recording minutes are ready to use.`,
      html,
    });
    console.log(`[Email] subscription_renewed sent to ${email}`);
  } catch (err: any) {
    console.error(`[Email] subscription_renewed failed: ${err.message}`);
  }
}

export async function sendPaymentFailedEmail(email: string): Promise<void> {
  const smtp = createSmtpTransporter();
  if (!smtp) { console.warn("[Email] SMTP not configured — skipping payment_failed email"); return; }
  try {
    const body = `
      <h2 style="margin-top:0;">We couldn't process your payment</h2>
      <p>Unfortunately, your recent payment for your MyVoicePost subscription could not be processed. This can happen when a card expires or has insufficient funds.</p>
      <p style="background:#fff3f3;border-left:4px solid #e53935;border-radius:0 6px 6px 0;padding:12px 16px;color:#555;">Please update your payment method to keep your subscription active. Stripe will automatically retry the charge.</p>
      <p style="color:#666;font-size:14px;">If you need help, contact our support team.</p>`;
    const html = buildNotificationEmail(
      "Payment Failed",
      body,
      "Update Payment Method",
      `${WEB_APP_URL}/subscription`,
      "linear-gradient(135deg,#e53935 0%,#c62828 100%)"
    );
    await smtp.transporter.sendMail({
      from: smtp.emailFrom,
      to: email,
      subject: "MyVoicePost - Payment Failed",
      text: "Your MyVoicePost subscription payment could not be processed. Please update your payment method in the app.",
      html,
    });
    console.log(`[Email] payment_failed sent to ${email}`);
  } catch (err: any) {
    console.error(`[Email] payment_failed failed: ${err.message}`);
  }
}

export async function sendSubscriptionExpiredEmail(email: string): Promise<void> {
  const smtp = createSmtpTransporter();
  if (!smtp) { console.warn("[Email] SMTP not configured — skipping subscription_expired email"); return; }
  try {
    const body = `
      <h2 style="margin-top:0;">Your subscription has ended</h2>
      <p>Your MyVoicePost subscription has expired. We hope you enjoyed using the app!</p>
      <p style="color:#666;font-size:14px;">To continue recording and accessing your saved texts, subscribe again from the app. Your recording history is safe and will be available when you return.</p>`;
    const html = buildNotificationEmail(
      "Subscription Expired",
      body,
      "Renew Subscription",
      `${WEB_APP_URL}/subscription`
    );
    await smtp.transporter.sendMail({
      from: smtp.emailFrom,
      to: email,
      subject: "MyVoicePost - Your Subscription Has Ended",
      text: "Your MyVoicePost subscription has expired. Subscribe again to continue recording.",
      html,
    });
    console.log(`[Email] subscription_expired sent to ${email}`);
  } catch (err: any) {
    console.error(`[Email] subscription_expired failed: ${err.message}`);
  }
}

export async function sendTopUpCreditedEmail(email: string, minutes: number): Promise<void> {
  const smtp = createSmtpTransporter();
  if (!smtp) { console.warn("[Email] SMTP not configured — skipping topup_credited email"); return; }
  try {
    const body = `
      <h2 style="margin-top:0;">${minutes} minutes added to your account</h2>
      <p>Your top-up was successful! <strong>${minutes} recording minutes</strong> have been added to your account and are available immediately.</p>
      <p style="color:#666;font-size:14px;">Open the app to start recording.</p>`;
    const html = buildNotificationEmail(
      "Top-Up Credited",
      body,
      "Start Recording",
      WEB_APP_URL
    );
    await smtp.transporter.sendMail({
      from: smtp.emailFrom,
      to: email,
      subject: `MyVoicePost - ${minutes} Minutes Added to Your Account`,
      text: `${minutes} recording minutes have been added to your MyVoicePost account.`,
      html,
    });
    console.log(`[Email] topup_credited sent to ${email}`);
  } catch (err: any) {
    console.error(`[Email] topup_credited failed: ${err.message}`);
  }
}

export async function sendLowMinutesEmail(email: string, minsLeft: number): Promise<void> {
  const smtp = createSmtpTransporter();
  if (!smtp) { console.warn("[Email] SMTP not configured — skipping low_minutes email"); return; }
  try {
    const body = `
      <h2 style="margin-top:0;">You're running low on recording time</h2>
      <p>You have <strong>${minsLeft} minute${minsLeft === 1 ? "" : "s"}</strong> remaining in your current subscription. Top up now to keep recording without interruption.</p>
      <p style="color:#666;font-size:14px;">Top-ups are available instantly and are added on top of your existing balance.</p>`;
    const html = buildNotificationEmail(
      "Low on Minutes",
      body,
      "Top Up Now",
      `${WEB_APP_URL}/subscription`,
      "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)"
    );
    await smtp.transporter.sendMail({
      from: smtp.emailFrom,
      to: email,
      subject: `MyVoicePost - Only ${minsLeft} Minute${minsLeft === 1 ? "" : "s"} Remaining`,
      text: `You have ${minsLeft} recording minutes remaining in your MyVoicePost account. Top up now to keep recording.`,
      html,
    });
    console.log(`[Email] low_minutes sent to ${email}`);
  } catch (err: any) {
    console.error(`[Email] low_minutes failed: ${err.message}`);
  }
}

export async function sendSubscriptionExpiringSoonEmail(
  email: string,
  planName: string,
  daysLeft: number
): Promise<void> {
  const smtp = createSmtpTransporter();
  if (!smtp) { console.warn("[Email] SMTP not configured — skipping expiry_3days_manual email"); return; }
  try {
    const body = `
      <h2 style="margin-top:0;">Your subscription expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}</h2>
      <p>Your <strong>${planName}</strong> subscription is set to expire in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong> and will <em>not</em> renew automatically.</p>
      <p style="color:#666;font-size:14px;">To avoid any interruption, subscribe again before your expiry date. Your recording history will be preserved.</p>`;
    const html = buildNotificationEmail(
      "Subscription Expiring Soon",
      body,
      "Renew Now",
      `${WEB_APP_URL}/subscription`,
      "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)"
    );
    await smtp.transporter.sendMail({
      from: smtp.emailFrom,
      to: email,
      subject: `MyVoicePost - Your Subscription Expires in ${daysLeft} Day${daysLeft === 1 ? "" : "s"}`,
      text: `Your MyVoicePost ${planName} subscription expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} and will not auto-renew. Subscribe again to continue.`,
      html,
    });
    console.log(`[Email] expiry_3days_manual sent to ${email}`);
  } catch (err: any) {
    console.error(`[Email] expiry_3days_manual failed: ${err.message}`);
  }
}

// --- Password reset (existing) ------------------------------------------------

export async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
  isDeepLink = false
): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[EMAIL SERVICE - DEV] SMTP not configured. Password reset link for ${email}: ${resetLink}`);
      return;
    }
    throw new Error("Email service not configured properly");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
    ...(smtpPort === 587 && !smtpSecure && {
      requireTLS: true,
      tls: { ciphers: "SSLv3", rejectUnauthorized: false },
    }),
  });

  await transporter.verify();

  const linkType = isDeepLink ? "mobile app" : "web browser";
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reset Your Password</title></head>
    <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
        <h1 style="color:white;margin:0;">MyVoicePost</h1></div>
      <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
        <h2>Reset Your Password</h2><p>We received a request to reset your password.</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="${resetLink}" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Reset Password</a>
        </div>
        <p style="color:#666;font-size:14px;">Or copy and paste this link into your ${linkType}:</p>
        <p style="background:#f5f5f5;padding:12px;border-radius:6px;word-break:break-all;font-size:13px;">${resetLink}</p>
        <p style="color:#888;font-size:13px;"><strong>This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).</strong></p>
        <p style="color:#888;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    </body></html>`;

  await transporter.sendMail({
    from: emailFrom,
    to: email,
    subject: "Reset Your MyVoicePost Password",
    text: `Reset your MyVoicePost password: ${resetLink}\n\nThis link expires in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).`,
    html: htmlContent,
  });

  console.log("[EMAIL SERVICE] Password reset email sent to", email);
}

export function buildResetResponse(code: string): Record<string, unknown> {
  const response: Record<string, unknown> = {
    success: true,
    message: "If an account with that email exists, a password reset code has been sent.",
  };
  if (process.env.NODE_ENV !== "production") {
    response.code = code;
  }
  return response;
}
