import { Router } from "express";
import {
  deleteAdminHomeworkController,
  downloadContentController,
  getAdminHomeworkController,
  updateAdminHomeworkController,
} from "../../controllers/content.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";

const router = Router();

router.get("/homework", adminMiddleware, getAdminHomeworkController);
router.patch("/homework/:id", adminMiddleware, updateAdminHomeworkController);
router.delete("/homework/:id", adminMiddleware, deleteAdminHomeworkController);
router.get("/homework/download/:id", adminMiddleware, downloadContentController);

export default router;
