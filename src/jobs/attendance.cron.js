const cron = require("node-cron");
const { syncAttendance } = require("../controllers/attendanceController");

function startAttendanceCron() {
  cron.schedule(
    "0 23 * * *", // Every day at 11:00 PM
    async () => {
      try {
        await syncAttendance();
      } catch (error) {
        console.error(
          "Attendance sync failed:",
          error.message
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