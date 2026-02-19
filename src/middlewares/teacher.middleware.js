import jwt from "jsonwebtoken";
import Teacher from "../models/Teacher.model.js";

export async function teacherMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const teacher = await Teacher.findById(decoded.id).select("_id name email role status");

    if (!teacher) {
      return res.status(401).json({ message: "Teacher not found" });
    }

    if (teacher.role !== "teacher") {
      return res.status(403).json({ message: "Teacher access only" });
    }

    if (teacher.status !== "active") {
      return res.status(403).json({ message: "Account inactive" });
    }

    req.user = teacher;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
