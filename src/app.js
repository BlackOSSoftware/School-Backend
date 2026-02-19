import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

/* -----------------------------
   Security Hardening
------------------------------ */
app.disable("x-powered-by");

/* -----------------------------
   CORS Configuration
------------------------------ */
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

/* -----------------------------
   Body Parsers
------------------------------ */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

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

export default app;
