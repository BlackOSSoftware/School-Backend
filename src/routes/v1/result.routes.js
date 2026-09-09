import { Router } from "express";
import {
  deleteAdminResultController,
  deleteTeacherResultController,
  getAdminStudentResultsController,
  getMyStudentResultsController,
  getTeacherStudentResultsController,
  submitTeacherResultController,
  updateAdminResultController,
  updateTeacherResultController,
} from "../../controllers/result.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { studentMiddleware } from "../../middlewares/student.middleware.js";
import { teacherMiddleware } from "../../middlewares/teacher.middleware.js";

const router = Router();

router.post("/teacher/submit", teacherMiddleware, submitTeacherResultController);
router.get("/teacher/student/:studentId", teacherMiddleware, getTeacherStudentResultsController);
router.put("/teacher/:resultId", teacherMiddleware, updateTeacherResultController);
router.delete("/teacher/:resultId", teacherMiddleware, deleteTeacherResultController);
router.get("/student/me", studentMiddleware, getMyStudentResultsController);
router.get("/admin/student/:studentId", adminMiddleware, getAdminStudentResultsController);
router.put("/admin/:resultId", adminMiddleware, updateAdminResultController);
router.delete("/admin/:resultId", adminMiddleware, deleteAdminResultController);

export default router;
