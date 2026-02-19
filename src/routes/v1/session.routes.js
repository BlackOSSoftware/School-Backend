import { Router } from "express";
import { createSessionController, getActiveSessionController, getAllSessionsController, updateSessionController } from "../../controllers/session.controller.js";
import { adminMiddleware } from "../../middlewares/admin.middleware.js";

const router = Router();

router.post("/create", adminMiddleware, createSessionController);
router.get("/all", adminMiddleware, getAllSessionsController);
router.get("/active", getActiveSessionController);
router.put("/:id", adminMiddleware, updateSessionController);


export default router;
