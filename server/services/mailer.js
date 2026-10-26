const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
});

async function sendAlert(subject, text) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS || !process.env.ALERT_EMAIL_TO) {
    console.warn('[MAIL] Skipped: mail env vars not set');
    return;
  }
  try {
    await transporter.sendMail({
      from: `"PulseMesh Alerts" <${process.env.MAIL_USER}>`,
      to: process.env.ALERT_EMAIL_TO,
      subject,
      text
    });
    console.log(`[MAIL] Sent: ${subject}`);
  } catch (err) {
    console.error('[MAIL] Failed:', err.message);
  }
}

module.exports = { sendAlert };