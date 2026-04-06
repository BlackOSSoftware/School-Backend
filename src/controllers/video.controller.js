import {
  createVideoByAdmin,
  deleteVideoByAdmin,
  getVideoList,
  updateVideoByAdmin,
} from "../services/video.service.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const CHUNK_DIR = path.resolve(process.cwd(), "uploads", "videos", "chunks");

function getChunkSessionPaths(uploadId) {
  const normalized = String(uploadId || "").trim();
  return {
    metaPath: path.resolve(CHUNK_DIR, `${normalized}.json`),
    tempPath: path.resolve(CHUNK_DIR, `${normalized}.part`),
  };
}

async function ensureChunkDir() {
  await fs.mkdir(CHUNK_DIR, { recursive: true });
}

async function readSessionMeta(uploadId) {
  const { metaPath } = getChunkSessionPaths(uploadId);
  const raw = await fs.readFile(metaPath, "utf8");
  return JSON.parse(raw);
}

async function writeSessionMeta(uploadId, payload) {
  const { metaPath } = getChunkSessionPaths(uploadId);
  await fs.writeFile(metaPath, JSON.stringify(payload), "utf8");
}

async function cleanupSession(uploadId) {
  const { metaPath, tempPath } = getChunkSessionPaths(uploadId);
  await Promise.all([
    fs.rm(metaPath, { force: true }),
    fs.rm(tempPath, { force: true }),
  ]);
}

function sanitizeVideoFileName(filename = "") {
  const value = String(filename || "").trim();
  const ext = path.extname(value).toLowerCase() || ".mp4";
  const base = path
    .basename(value, ext)
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return `${base || "video"}${ext}`;
}

function toAbsoluteUrl(req, rawPath = "") {
  const normalizedPath = String(rawPath || "").startsWith("/")
    ? String(rawPath)
    : `/${String(rawPath || "")}`;
  return `${req.protocol}://${req.get("host")}${normalizedPath}`;
}

function mapVideoFileUrls(req, row) {
  if (!row?.file?.url) return row;
  return {
    ...row,
    file: {
      ...row.file,
      url: toAbsoluteUrl(req, row.file.url),
      openUrl: toAbsoluteUrl(req, row.file.url),
    },
  };
}

export async function createAdminVideoController(req, res) {
  try {
    const created = await createVideoByAdmin(req.user?._id, req.body, req.file);
    return res.status(201).json({
      success: true,
      message: "Video uploaded successfully",
      data: mapVideoFileUrls(req, created),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to upload video",
    });
  }
}

export async function createAdminVideoChunkInitController(req, res) {
  try {
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const fileName = String(req.body?.fileName || "video.mp4").trim() || "video.mp4";
    const mimeType = String(req.body?.mimeType || "video/mp4").trim() || "video/mp4";
    const totalSize = Number(req.body?.totalSize || 0);

    if (!title) {
      return res.status(400).json({ success: false, message: "Video title is required" });
    }
    if (!description) {
      return res.status(400).json({ success: false, message: "Video description is required" });
    }
    if (!Number.isFinite(totalSize) || totalSize <= 0) {
      return res.status(400).json({ success: false, message: "Invalid video size" });
    }

    await ensureChunkDir();
    const uploadId = randomUUID();
    const session = {
      uploadId,
      title,
      description,
      fileName,
      mimeType,
      totalSize,
      receivedBytes: 0,
      nextIndex: 0,
      createdAt: Date.now(),
    };
    await writeSessionMeta(uploadId, session);

    return res.status(200).json({
      success: true,
      data: {
        uploadId,
        chunkSizeBytes: 384 * 1024,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to initialize chunk upload",
    });
  }
}

export async function createAdminVideoChunkAppendController(req, res) {
  try {
    const uploadId = String(req.params?.uploadId || "").trim();
    const chunkBase64 = String(req.body?.chunkBase64 || "").trim();
    const index = Number(req.body?.index);

    if (!uploadId) {
      return res.status(400).json({ success: false, message: "Invalid upload session" });
    }
    if (!chunkBase64) {
      return res.status(400).json({ success: false, message: "Chunk payload is required" });
    }
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ success: false, message: "Invalid chunk index" });
    }

    const session = await readSessionMeta(uploadId);
    if (index !== Number(session.nextIndex || 0)) {
      return res.status(409).json({
        success: false,
        message: `Unexpected chunk index. Expected ${session.nextIndex}, received ${index}`,
      });
    }

    const { tempPath } = getChunkSessionPaths(uploadId);
    const chunkBuffer = Buffer.from(chunkBase64, "base64");
    if (!chunkBuffer.length) {
      return res.status(400).json({ success: false, message: "Invalid chunk content" });
    }

    await fs.appendFile(tempPath, chunkBuffer);

    session.receivedBytes = Number(session.receivedBytes || 0) + chunkBuffer.length;
    session.nextIndex = Number(session.nextIndex || 0) + 1;
    await writeSessionMeta(uploadId, session);

    return res.status(200).json({
      success: true,
      data: {
        uploadId,
        receivedBytes: session.receivedBytes,
        totalSize: Number(session.totalSize || 0),
        nextIndex: session.nextIndex,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to upload chunk",
    });
  }
}

export async function createAdminVideoChunkCompleteController(req, res) {
  try {
    const uploadId = String(req.params?.uploadId || "").trim();
    if (!uploadId) {
      return res.status(400).json({ success: false, message: "Invalid upload session" });
    }

    const session = await readSessionMeta(uploadId);
    const { tempPath } = getChunkSessionPaths(uploadId);
    const stat = await fs.stat(tempPath);

    if (!stat?.size) {
      return res.status(400).json({ success: false, message: "Uploaded file is empty" });
    }

    const finalName = sanitizeVideoFileName(session.fileName);
    const ext = path.extname(finalName);
    const base = path.basename(finalName, ext);
    const persistedName = `${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const finalPath = path.resolve(process.cwd(), "uploads", "videos", persistedName);
    await fs.rename(tempPath, finalPath);

    const created = await createVideoByAdmin(
      req.user?._id,
      { title: session.title, description: session.description },
      {
        path: finalPath,
        originalname: session.fileName || persistedName,
        mimetype: session.mimeType || "video/mp4",
        size: Number(stat.size || session.receivedBytes || 0),
      }
    );

    await fs.rm(getChunkSessionPaths(uploadId).metaPath, { force: true });

    return res.status(201).json({
      success: true,
      message: "Video uploaded successfully",
      data: mapVideoFileUrls(req, created),
    });
  } catch (error) {
    try {
      await cleanupSession(req.params?.uploadId);
    } catch {
      // Best effort cleanup.
    }
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to finalize video upload",
    });
  }
}

export async function getAdminVideosController(req, res) {
  try {
    const result = await getVideoList(req.query);
    return res.status(200).json({
      success: true,
      ...result,
      data: result.data.map((row) => mapVideoFileUrls(req, row)),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch videos",
    });
  }
}

export async function updateAdminVideoController(req, res) {
  try {
    const updated = await updateVideoByAdmin(req.params.id, req.body, req.file);
    return res.status(200).json({
      success: true,
      message: "Video updated successfully",
      data: mapVideoFileUrls(req, updated),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update video",
    });
  }
}

export async function deleteAdminVideoController(req, res) {
  try {
    await deleteVideoByAdmin(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to delete video",
    });
  }
}

export async function getTeacherVideosController(req, res) {
  try {
    const result = await getVideoList(req.query);
    return res.status(200).json({
      success: true,
      ...result,
      data: result.data.map((row) => mapVideoFileUrls(req, row)),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch videos",
    });
  }
}

export async function getStudentVideosController(req, res) {
  try {
    const result = await getVideoList(req.query);
    return res.status(200).json({
      success: true,
      ...result,
      data: result.data.map((row) => mapVideoFileUrls(req, row)),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch videos",
    });
  }
}
