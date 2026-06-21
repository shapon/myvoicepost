import nodemailer from "nodemailer";

export const RESET_TOKEN_EXPIRY_HOURS = 1;

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
