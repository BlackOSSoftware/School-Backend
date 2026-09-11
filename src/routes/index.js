import { Router } from "express";
import authRoutes from "./v1/auth.routes.js";
import sessionRoutes from "./v1/session.routes.js";
import classRoutes from "./v1/class.routes.js";
import teacherRoutes from "./v1/teacher.routes.js";
import studentRoutes from "./v1/student.routes.js";
import announcementRoutes from "./v1/announcement.routes.js";
import attendanceRoutes from "./v1/attendance.routes.js";
import busRoutes from "./v1/bus.routes.js";
import videoRoutes from "./v1/video.routes.js";
import resultRoutes from "./v1/result.routes.js";
import timetableRoutes from "./v1/timetable.routes.js";
import adminRoutes from "./v1/admin.routes.js";
const router = Router();

router.use("/auth", authRoutes);
router.use("/session", sessionRoutes);
router.use("/class", classRoutes);
router.use("/teacher", teacherRoutes);
router.use("/student", studentRoutes);
router.use("/bus", busRoutes);
router.use("/announcement", announcementRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/video", videoRoutes);
router.use("/result", resultRoutes);
router.use("/timetable", timetableRoutes);
router.use("/admin", adminRoutes);

export default router;
