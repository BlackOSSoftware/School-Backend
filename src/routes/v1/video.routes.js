import { Router } from "express";
import {
  createAdminVideoController,
  deleteAdminVideoController,
  getAdminVideosController,
  getStudentVideosController,
  getTeacherVideosController,
  updateAdminVideoController,
} from "../../controllers/video.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { studentMiddleware } from "../../middlewares/student.middleware.js";
import { teacherMiddleware } from "../../middlewares/teacher.middleware.js";
import {
  uploadErrorHandler,
  uploadSingleVideoFile,
} from "../../middlewares/upload.middleware.js";

const router = Router();

router.post(
  "/admin/create",
  adminMiddleware,
  uploadSingleVideoFile,
  uploadErrorHandler,
  createAdminVideoController
);
router.get("/admin/all", adminMiddleware, getAdminVideosController);
router.put(
  "/admin/:id",
  adminMiddleware,
  uploadSingleVideoFile,
  uploadErrorHandler,
  updateAdminVideoController
);
router.delete("/admin/:id", adminMiddleware, deleteAdminVideoController);

router.get("/teacher/all", teacherMiddleware, getTeacherVideosController);
router.get("/student/all", studentMiddleware, getStudentVideosController);

export default router;
