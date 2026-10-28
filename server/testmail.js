require('dotenv').config();
console.log('key set:', !!process.env.RESEND_API_KEY);
require('./services/mailer')
  .sendAlert('PulseMesh test', 'Hello from PulseMesh', 'pateljay082007@gmail.com')
  .then(() => console.log('done'));