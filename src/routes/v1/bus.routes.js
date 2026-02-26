import { Router } from "express";
import {
  createBusController,
  getAllBusesController,
  getBusByIdController,
  updateBusController,
} from "../../controllers/bus.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";

const router = Router();

router.post("/create", adminMiddleware, createBusController);
router.get("/all", adminMiddleware, getAllBusesController);
router.get("/:id", adminMiddleware, getBusByIdController);
router.put("/:id", adminMiddleware, updateBusController);

export default router;
