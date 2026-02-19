import { Router } from "express";
import {
  changeAdminPasswordController,
  changeStudentPasswordController,
  login,
  logoutController,
  updateMyFcmTokenController,
} from "../../controllers/auth.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { studentMiddleware } from "../../middlewares/student.middleware.js";

const router = Router();

router.post("/login", login);
router.put("/fcm-token", authMiddleware, updateMyFcmTokenController);
router.post("/logout", authMiddleware, logoutController);
router.put("/admin/change-password", adminMiddleware, changeAdminPasswordController);
router.put("/student/change-password", studentMiddleware, changeStudentPasswordController);

export default router;
