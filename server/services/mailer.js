const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendAlert(subject, text, to) {
  if (!resend || !to) { console.log('[MAIL] Skipped | key set:', !!resend, '| to:', to); return; }
  try {
    const { error } = await resend.emails.send({
      from: 'PulseMesh Alerts <onboarding@resend.dev>', to, subject, text,
    });
    if (error) console.log('[MAIL] Failed:', error.message);
    else console.log('[MAIL] Sent to', to);
  } catch (e) { console.log('[MAIL] Failed:', e.message); }
}
module.exports = { sendAlert };