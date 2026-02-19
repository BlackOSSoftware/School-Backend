import { Router } from "express";
import {
  getAdminAttendanceDateSummaryController,
  getAdminClassAttendanceByDateController,
  getMyClassAttendanceByDateController,
  getMyStudentAttendanceReportController,
  getStudentMyAttendanceReportController,
  markMyClassAttendanceController,
} from "../../controllers/attendance.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { teacherMiddleware } from "../../middlewares/teacher.middleware.js";
import { studentMiddleware } from "../../middlewares/student.middleware.js";

const router = Router();

router.put("/teacher/class/:classId/mark", teacherMiddleware, markMyClassAttendanceController);
router.get("/teacher/class/:classId/date", teacherMiddleware, getMyClassAttendanceByDateController);
router.get(
  "/teacher/class/:classId/student/:studentId/report",
  teacherMiddleware,
  getMyStudentAttendanceReportController
);

router.get("/admin/date-summary", adminMiddleware, getAdminAttendanceDateSummaryController);
router.get("/admin/class/:classId/date", adminMiddleware, getAdminClassAttendanceByDateController);

router.get("/student/me/report", studentMiddleware, getStudentMyAttendanceReportController);

export default router;
