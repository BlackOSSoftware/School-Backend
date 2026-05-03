import { Router } from "express";

import {
  bulkCreateTeachersController,
  createTeacherController,
  deleteTeacherController,
  getAllTeachersController,
  getMyStudentsByClassController,
  getMyStudentsController,
  getMyTeacherClassesController,
  getTeacherByIdController,
  updateTeacherController,
} from "../../controllers/teacher.controller.js";

import {
  createTeacherContentController,
  downloadContentController,
  getTeacherContentController,
} from "../../controllers/content.controller.js";

import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { teacherMiddleware } from "../../middlewares/teacher.middleware.js";

import {
  uploadSingleFile,
  uploadErrorHandler,
} from "../../middlewares/upload.middleware.js";

const router = Router();

/* =========================
   ADMIN ROUTES
========================= */

router.post("/create", adminMiddleware, createTeacherController);
router.post("/bulk-create", adminMiddleware, bulkCreateTeachersController);
router.get("/all", adminMiddleware, getAllTeachersController);
router.get("/:id", adminMiddleware, getTeacherByIdController);
router.put("/:id", adminMiddleware, updateTeacherController);
router.delete("/:id", adminMiddleware, deleteTeacherController);

/* =========================
   TEACHER SELF ROUTES
========================= */

router.get("/me/classes", teacherMiddleware, getMyTeacherClassesController);
router.get("/me/students", teacherMiddleware, getMyStudentsController);
router.get("/me/students/:classId", teacherMiddleware, getMyStudentsByClassController);

/* =========================
   TEACHER CONTENT
========================= */

router.post(
  "/me/content/:type",   // homework | notes
  teacherMiddleware,
  uploadSingleFile,
  uploadErrorHandler,
  createTeacherContentController
);

router.get(
  "/me/content/:type",
  teacherMiddleware,
  getTeacherContentController
);

router.get(
  "/me/content",
  teacherMiddleware,
  getTeacherContentController
);

router.get(
  "/me/content/download/:id",
  teacherMiddleware,
  downloadContentController
);

export default router;
