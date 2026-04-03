import fs from "node:fs";
import path from "node:path";
import multer from "multer";

function resolvePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

const MAX_FILE_SIZE_MB = resolvePositiveNumber(process.env.MAX_FILE_SIZE_MB, 20);
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE_MB = resolvePositiveNumber(process.env.MAX_VIDEO_FILE_SIZE_MB, 200);
const MAX_VIDEO_FILE_SIZE = MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024;
const UPLOAD_REQUEST_TIMEOUT_MS = Number(process.env.UPLOAD_REQUEST_TIMEOUT_MS || 0);
const ALLOWED_FILE_FIELDS = ["file", "document", "attachment", "upload"];
const ALLOWED_VIDEO_FILE_FIELDS = ["video", "file", "upload", "attachment"];

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const uploadRoot = path.resolve(process.cwd(), "uploads", "content");
const videoUploadRoot = path.resolve(process.cwd(), "uploads", "videos");

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}
if (!fs.existsSync(videoUploadRoot)) {
  fs.mkdirSync(videoUploadRoot, { recursive: true });
}

function sanitizeBaseName(filename = "") {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  const safe = baseName
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return safe || "file";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const safeBase = sanitizeBaseName(file.originalname || "");
    const uniqueName = `${safeBase}-${Date.now()}-${Math.round(Math.random() * 1e6)}${extension}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 30,
    parts: 40,
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const mimeType = String(file.mimetype || "").toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.has(extension);
    const hasValidMime = ALLOWED_MIME_TYPES.has(mimeType);

    if (!hasValidExtension && !hasValidMime) {
      return cb(
        new Error(
          "Unsupported file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, JPG, PNG, WEBP"
        )
      );
    }

    return cb(null, true);
  },
});

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, videoUploadRoot),
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname || "").toLowerCase();
      const safeBase = sanitizeBaseName(file.originalname || "");
      const uniqueName = `${safeBase}-${Date.now()}-${Math.round(Math.random() * 1e6)}${extension}`;
      cb(null, uniqueName);
    },
  }),
  limits: {
    fileSize: MAX_VIDEO_FILE_SIZE,
    files: 1,
    fields: 20,
    parts: 30,
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const mimeType = String(file.mimetype || "").toLowerCase();
    const validExtensions = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"]);
    const validMime = mimeType.startsWith("video/");
    const validExtension = validExtensions.has(extension);

    if (!validMime && !validExtension) {
      return cb(new Error("Unsupported video type. Allowed: MP4, MOV, M4V, AVI, MKV, WEBM"));
    }

    return cb(null, true);
  },
});
const uploadVideoFields = videoUpload.fields(
  ALLOWED_VIDEO_FILE_FIELDS.map((fieldName) => ({ name: fieldName, maxCount: 1 }))
);

const uploadContentFields = upload.fields(
  ALLOWED_FILE_FIELDS.map((fieldName) => ({ name: fieldName, maxCount: 1 }))
);

export function uploadSingleFile(req, res, next) {
  const startedAt = Date.now();
  const teacherId = req.user?._id ? String(req.user._id) : "unknown";
  const requestPath = req.originalUrl || req.url;

  console.info(
    `[upload:start] teacher=${teacherId} path=${requestPath} contentType=${req.headers["content-type"] || "n/a"} contentLength=${req.headers["content-length"] || "n/a"}`
  );

  if (UPLOAD_REQUEST_TIMEOUT_MS > 0) {
    req.setTimeout(UPLOAD_REQUEST_TIMEOUT_MS, () => {
      console.error(
        `[upload:timeout] teacher=${teacherId} path=${requestPath} timeoutMs=${UPLOAD_REQUEST_TIMEOUT_MS}`
      );
    });
  } else {
    req.setTimeout(0);
  }

  res.setTimeout(0);

  req.on("aborted", () => {
    console.error(`[upload:aborted] teacher=${teacherId} path=${requestPath}`);
  });

  res.on("finish", () => {
    console.info(
      `[upload:finish] teacher=${teacherId} path=${requestPath} status=${res.statusCode} durationMs=${Date.now() - startedAt}`
    );
  });

  uploadContentFields(req, res, (error) => {
    if (error) {
      console.error(
        `[upload:multer-error] teacher=${teacherId} path=${requestPath} code=${error.code || "unknown"} message=${error.message}`
      );
      return next(error);
    }

    const filesByField = req.files && typeof req.files === "object" ? req.files : {};
    const allFiles = Object.values(filesByField).flat();

    if (allFiles.length > 1) {
      return next(new Error("Upload only one file in a single field"));
    }

    req.file = allFiles[0];
    if (req.file) {
      console.info(
        `[upload:parsed] teacher=${teacherId} path=${requestPath} field=${req.file.fieldname} name=${req.file.originalname} size=${req.file.size} mime=${req.file.mimetype} durationMs=${Date.now() - startedAt}`
      );
    } else {
      console.info(
        `[upload:parsed] teacher=${teacherId} path=${requestPath} no-file durationMs=${Date.now() - startedAt}`
      );
    }

    return next();
  });
}

export function uploadSingleVideoFile(req, res, next) {
  const startedAt = Date.now();
  const actorId = req.user?._id ? String(req.user._id) : "unknown";
  const requestPath = req.originalUrl || req.url;

  console.info(
    `[video-upload:start] actor=${actorId} path=${requestPath} contentType=${req.headers["content-type"] || "n/a"} contentLength=${req.headers["content-length"] || "n/a"}`
  );

  if (UPLOAD_REQUEST_TIMEOUT_MS > 0) {
    req.setTimeout(UPLOAD_REQUEST_TIMEOUT_MS, () => {
      console.error(
        `[video-upload:timeout] actor=${actorId} path=${requestPath} timeoutMs=${UPLOAD_REQUEST_TIMEOUT_MS}`
      );
    });
  } else {
    req.setTimeout(0);
  }

  res.setTimeout(0);

  req.on("aborted", () => {
    console.error(`[video-upload:aborted] actor=${actorId} path=${requestPath}`);
  });

  res.on("finish", () => {
    console.info(
      `[video-upload:finish] actor=${actorId} path=${requestPath} status=${res.statusCode} durationMs=${Date.now() - startedAt}`
    );
  });

  uploadVideoFields(req, res, (error) => {
    if (error) {
      console.error(
        `[video-upload:multer-error] actor=${actorId} path=${requestPath} code=${error.code || "unknown"} message=${error.message}`
      );
      return next(error);
    }

    const filesByField = req.files && typeof req.files === "object" ? req.files : {};
    const allFiles = Object.values(filesByField).flat();

    if (allFiles.length > 1) {
      return next(new Error("Upload only one video file in a single field"));
    }

    req.file = allFiles[0];
    if (req.file) {
      console.info(
        `[video-upload:parsed] actor=${actorId} path=${requestPath} field=${req.file.fieldname} name=${req.file.originalname} size=${req.file.size} mime=${req.file.mimetype} durationMs=${Date.now() - startedAt}`
      );
    } else {
      console.info(
        `[video-upload:parsed] actor=${actorId} path=${requestPath} no-file durationMs=${Date.now() - startedAt}`
      );
    }

    return next();
  });
}

export function uploadErrorHandler(error, _req, res, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      const isVideoUpload = String(_req?.originalUrl || "").includes("/video/");
      return res.status(400).json({
        success: false,
        message: isVideoUpload
          ? `File size must be ${MAX_VIDEO_FILE_SIZE_MB}MB or less`
          : `File size must be ${MAX_FILE_SIZE_MB}MB or less`,
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      const isVideoUpload = String(_req?.originalUrl || "").includes("/video/");
      return res.status(400).json({
        success: false,
        message: isVideoUpload
          ? `Invalid video field. Use one of: ${ALLOWED_VIDEO_FILE_FIELDS.join(", ")}`
          : `Invalid file field. Use one of: ${ALLOWED_FILE_FIELDS.join(", ")}`,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "File upload error",
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "File upload failed",
    });
  }

  return next();
}
