import { Router } from "express";
import {
  createStudentController,
  deleteStudentController,
  getAllStudentsController,
  getMyStudentProfileController,
  getStudentByIdController,
  getStudentsByClassController,
  updateStudentController,
} from "../../controllers/student.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { studentMiddleware } from "../../middlewares/student.middleware.js";

const router = Router();

router.post("/create", adminMiddleware, createStudentController);
router.get("/me", studentMiddleware, getMyStudentProfileController);
router.get("/all", adminMiddleware, getAllStudentsController);
router.get("/class/:classId", adminMiddleware, getStudentsByClassController);
router.get("/:id", adminMiddleware, getStudentByIdController);
router.put("/:id", adminMiddleware, updateStudentController);
router.delete("/:id", adminMiddleware, deleteStudentController);

export default router;
