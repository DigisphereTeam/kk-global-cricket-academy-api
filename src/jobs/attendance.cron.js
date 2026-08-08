const cron = require("node-cron");
const { syncAttendanceForCron } = require("../controllers/attendanceController");

function startAttendanceCron() {
  cron.schedule(
    "0 23 * * *",
    async () => {
      try {
        const today = new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        });

        const syncedCount = await syncAttendanceForCron(today);

      } catch (error) {
        console.error(
          "Attendance sync failed:",
          error.response?.data || error.message
        );
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );

  console.log("Attendance cron started.");
}

module.exports = {
  startAttendanceCron,
};