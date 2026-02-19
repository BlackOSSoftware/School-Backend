import jwt from "jsonwebtoken";
import Student from "../models/Student.model.js";

export async function studentMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const student = await Student.findById(decoded.id).select(
      "_id name scholarNumber role status classId sessionId"
    );

    if (!student) {
      return res.status(401).json({ message: "Student not found" });
    }

    if (student.role !== "student") {
      return res.status(403).json({ message: "Student access only" });
    }

    if (student.status !== "active") {
      return res.status(403).json({ message: "Account inactive" });
    }

    req.user = student;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
