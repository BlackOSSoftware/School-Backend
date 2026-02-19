import { Router } from "express";
import {
  createClassController,
  deleteClassController,
  getAllClassesController,
  getClassByIdController,
  updateClassController,
} from "../../controllers/class.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";

const router = Router();

router.post("/create", adminMiddleware, createClassController);
router.get("/all", adminMiddleware, getAllClassesController);
router.get("/:id", adminMiddleware, getClassByIdController);
router.put("/:id", adminMiddleware, updateClassController);
router.delete("/:id", adminMiddleware, deleteClassController);

export default router;
