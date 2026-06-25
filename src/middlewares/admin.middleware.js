import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import { isTokenVersionValid } from "../utils/token-version.js";

export async function adminMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("_id name email role status tokenVersion");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!isTokenVersionValid(decoded, user)) {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
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
