const cron = require('node-cron');
const { generateMonthlyDues } = require('./generateMonthlyDues');

function startScheduler() {
  cron.schedule(
    '5 0 1 * *',
    async () => {
      try {
        await generateMonthlyDues();
      } catch (err) {
        console.error('Scheduled due generation failed:', err);
      }
    },
    { timezone: process.env.TZ || 'Asia/Kolkata' }
  );

  console.log('Monthly dues cron scheduled: 00:05 on the 1st of each month');
}

module.exports = { startScheduler };