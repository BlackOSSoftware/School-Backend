import { Router } from "express";
import {
  createTeacherController,
  deleteTeacherController,
  getAllTeachersController,
  getMyStudentsByClassController,
  getMyStudentsController,
  getMyTeacherClassesController,
  getTeacherByIdController,
  updateTeacherController,
} from "../../controllers/teacher.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { teacherMiddleware } from "../../middlewares/teacher.middleware.js";

const router = Router();

router.post("/create", adminMiddleware, createTeacherController);
router.get("/all", adminMiddleware, getAllTeachersController);
router.get("/me/classes", teacherMiddleware, getMyTeacherClassesController);
router.get("/me/students", teacherMiddleware, getMyStudentsController);
router.get("/me/students/:classId", teacherMiddleware, getMyStudentsByClassController);
router.get("/:id", adminMiddleware, getTeacherByIdController);
router.put("/:id", adminMiddleware, updateTeacherController);
router.delete("/:id", adminMiddleware, deleteTeacherController);

export default router;
