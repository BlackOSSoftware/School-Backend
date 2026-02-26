import { Router } from "express";

import {
  bulkPromoteStudentsController,
  createStudentController,
  createStudentsBulkController,
  deleteStudentController,
  getAllStudentsController,
  getMyStudentProfileController,
  getStudentByIdController,
  getStudentsByClassController,
  updateStudentController,
} from "../../controllers/student.controller.js";

import {
  getStudentContentController,
  downloadContentController,
} from "../../controllers/content.controller.js";

import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { studentMiddleware } from "../../middlewares/student.middleware.js";

const router = Router();

/* =========================
   ADMIN ROUTES
========================= */

router.post("/create", adminMiddleware, createStudentController);
router.post("/create-bulk", adminMiddleware, createStudentsBulkController);
router.post("/session-transition", adminMiddleware, bulkPromoteStudentsController);
router.get("/all", adminMiddleware, getAllStudentsController);
router.get("/class/:classId", adminMiddleware, getStudentsByClassController);

/* =========================
   STUDENT SELF ROUTES
========================= */

router.get("/me", studentMiddleware, getMyStudentProfileController);

/* =========================
   STUDENT CONTENT VIEW
========================= */

router.get(
  "/me/content/:type",   // homework | notes
  studentMiddleware,
  getStudentContentController
);

router.get(
  "/me/content",
  studentMiddleware,
  getStudentContentController
);

/* =========================
   STUDENT DOWNLOAD FILE
========================= */

router.get(
  "/me/content/download/:id",
  studentMiddleware,
  downloadContentController
);

/* =========================
   ADMIN ID ROUTES
========================= */

router.get("/:id", adminMiddleware, getStudentByIdController);
router.put("/:id", adminMiddleware, updateStudentController);
router.delete("/:id", adminMiddleware, deleteStudentController);

export default router;
