import { Router } from "express";
import {
  getAdminAttendanceDateSummaryController,
  getAdminClassAttendanceByDateController,
  getAdminDashboardSummaryController,
  getAdminStudentAttendanceReportController,
  getTeacherAttendancePolicyController,
  getMyClassAttendanceByDateController,
  getMyStudentAttendanceReportController,
  getStudentMyAttendanceReportController,
  updateTeacherAttendancePolicyController,
  updateAdminStudentAttendanceByDateController,
  markMyClassAttendanceController,
  markMyClassHolidayController,
  unmarkMyClassHolidayController,
} from "../../controllers/attendance.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { teacherMiddleware } from "../../middlewares/teacher.middleware.js";
import { studentMiddleware } from "../../middlewares/student.middleware.js";

const router = Router();

router.put("/teacher/class/:classId/mark", teacherMiddleware, markMyClassAttendanceController);
router.put("/teacher/class/:classId/holiday", teacherMiddleware, markMyClassHolidayController);
router.delete("/teacher/class/:classId/holiday", teacherMiddleware, unmarkMyClassHolidayController);
router.get("/teacher/class/:classId/date", teacherMiddleware, getMyClassAttendanceByDateController);
router.get("/teacher/policy", teacherMiddleware, getTeacherAttendancePolicyController);
router.get(
  "/teacher/class/:classId/student/:studentId/report",
  teacherMiddleware,
  getMyStudentAttendanceReportController
);

router.get("/admin/date-summary", adminMiddleware, getAdminAttendanceDateSummaryController);
router.get("/admin/dashboard-summary", adminMiddleware, getAdminDashboardSummaryController);
router.get("/admin/teacher-policy", adminMiddleware, getTeacherAttendancePolicyController);
router.put("/admin/teacher-policy", adminMiddleware, updateTeacherAttendancePolicyController);
router.get("/admin/class/:classId/date", adminMiddleware, getAdminClassAttendanceByDateController);
router.get(
  "/admin/class/:classId/student/:studentId/report",
  adminMiddleware,
  getAdminStudentAttendanceReportController
);
router.put(
  "/admin/class/:classId/student/:studentId/date",
  adminMiddleware,
  updateAdminStudentAttendanceByDateController
);

router.get("/student/me/report", studentMiddleware, getStudentMyAttendanceReportController);

export default router;
