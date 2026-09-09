import { Router } from "express";
import {
  createAdminTimetableController,
  createTeacherTimetableController,
  deleteAdminTimetableController,
  deleteTeacherTimetableController,
  getAdminTimetablesController,
  getStudentTimetablesController,
  getTeacherTimetablesController,
  updateAdminTimetableController,
  updateTeacherTimetableController,
} from "../../controllers/timetable.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { studentMiddleware } from "../../middlewares/student.middleware.js";
import { teacherMiddleware } from "../../middlewares/teacher.middleware.js";
import { uploadErrorHandler, uploadSingleFile } from "../../middlewares/upload.middleware.js";

const router = Router();

router.get("/teacher/me", teacherMiddleware, getTeacherTimetablesController);
router.post("/teacher/me", teacherMiddleware, uploadSingleFile, uploadErrorHandler, createTeacherTimetableController);
router.put("/teacher/:timetableId", teacherMiddleware, uploadSingleFile, uploadErrorHandler, updateTeacherTimetableController);
router.delete("/teacher/:timetableId", teacherMiddleware, deleteTeacherTimetableController);

router.get("/admin", adminMiddleware, getAdminTimetablesController);
router.post("/admin", adminMiddleware, uploadSingleFile, uploadErrorHandler, createAdminTimetableController);
router.put("/admin/:timetableId", adminMiddleware, uploadSingleFile, uploadErrorHandler, updateAdminTimetableController);
router.delete("/admin/:timetableId", adminMiddleware, deleteAdminTimetableController);

router.get("/student/me", studentMiddleware, getStudentTimetablesController);

export default router;
