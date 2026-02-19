import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import Teacher from "../models/Teacher.model.js";
import Student from "../models/Student.model.js";

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = null;

    if (decoded.role === "teacher") {
      user = await Teacher.findById(decoded.id).select("_id name email role status");
    } else if (decoded.role === "student") {
      user = await Student.findById(decoded.id).select("_id name role status classId");
    } else {
      user = await User.findById(decoded.id).select("_id name email role status");
    }

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "Account inactive" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}
