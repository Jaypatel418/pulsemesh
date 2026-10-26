const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

async function sendAlert(subject, text) {
  if (!resend || !process.env.ALERT_EMAIL_TO) {
    console.warn('[MAIL] Skipped: RESEND_API_KEY or ALERT_EMAIL_TO not set');
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from: 'PulseMesh Alerts <onboarding@resend.dev>',
      to: process.env.ALERT_EMAIL_TO,
      subject,
      text
    });
    if (error) {
      console.error('[MAIL] Failed:', error.message);
    } else {
      console.log(`[MAIL] Sent: ${subject}`);
    }
  } catch (err) {
    console.error('[MAIL] Failed:', err.message);
  }
}

module.exports = { sendAlert };