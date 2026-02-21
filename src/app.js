import express from "express";
import cors from "cors";
import path from "node:path";
import routes from "./routes/index.js";

const app = express();
const fallbackOrigins = ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"];
const configuredOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : fallbackOrigins;
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
};

/* -----------------------------
   Security Hardening
------------------------------ */
app.disable("x-powered-by");

/* -----------------------------
   CORS Configuration
------------------------------ */
app.use(
  cors(corsOptions)
);
app.options(/.*/, cors(corsOptions));

/* -----------------------------
   Body Parsers
------------------------------ */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

/* -----------------------------
   Routes
------------------------------ */
app.use("/api/v1", routes);

/* -----------------------------
   Health Check
------------------------------ */
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "School Management API running",
  });
});

/* -----------------------------
   404 Handler
------------------------------ */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((error, _req, res, _next) => {
  if (error?.message === "CORS origin not allowed") {
    return res.status(403).json({
      success: false,
      message: "Origin is not allowed by CORS policy",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

export default app;
