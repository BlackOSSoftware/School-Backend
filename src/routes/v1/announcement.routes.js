import { Router } from "express";
import {
  createAdminAnnouncementController,
  createTeacherAnnouncementController,
  getAllAnnouncementsForAdminController,
  getMyAnnouncementsController,
} from "../../controllers/announcement.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { teacherMiddleware } from "../../middlewares/teacher.middleware.js";

const router = Router();

router.post("/admin/create", adminMiddleware, createAdminAnnouncementController);
router.post("/teacher/create", teacherMiddleware, createTeacherAnnouncementController);
router.get("/admin/all", adminMiddleware, getAllAnnouncementsForAdminController);
router.get("/me", authMiddleware, getMyAnnouncementsController);

export default router;
