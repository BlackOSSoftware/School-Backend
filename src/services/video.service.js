import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import Video from "../models/Video.model.js";

function normalizeString(value = "") {
  return String(value || "").trim();
}

function buildPagination(query = {}, defaults = { page: 1, limit: 10, maxLimit: 100 }) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
  const limit = Math.max(
    1,
    Math.min(defaults.maxLimit, parseInt(query.limit, 10) || defaults.limit)
  );
  return { page, limit, skip: (page - 1) * limit };
}

function pathRelativeToUploads(absolutePath = "") {
  const normalizedAbsolute = normalizeString(absolutePath).replace(/\\/g, "/");
  const marker = "/uploads/";
  const markerIndex = normalizedAbsolute.lastIndexOf(marker);

  if (markerIndex >= 0) {
    return normalizedAbsolute.slice(markerIndex + 1);
  }

  return `uploads/videos/${normalizeString(absolutePath).split(/[/\\]/).pop()}`;
}

function toVideoResponse(row) {
  return {
    id: row._id,
    title: row.title,
    description: row.description,
    uploadedBy: row.uploadedBy || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    file: {
      name: row.file?.originalName || null,
      mimeType: row.file?.mimeType || null,
      size: row.file?.size || null,
      url: row.file?.storagePath ? `/${row.file.storagePath.replace(/\\/g, "/")}` : null,
    },
  };
}

async function deleteFileBestEffort(storagePath) {
  if (!storagePath) return;
  try {
    const absolutePath = path.resolve(process.cwd(), storagePath);
    await fs.unlink(absolutePath);
  } catch {
    // Best effort cleanup.
  }
}

export async function createVideoByAdmin(adminId, payload = {}, file) {
  if (!file?.path) {
    throw new Error("Video file is required");
  }

  const title = normalizeString(payload.title);
  const description = normalizeString(payload.description);
  if (!title) throw new Error("Video title is required");
  if (!description) throw new Error("Video description is required");

  try {
    const created = await Video.create({
      title,
      description,
      uploadedBy: adminId,
      file: {
        originalName: file.originalname,
        mimeType: normalizeString(file.mimetype) || "video/mp4",
        size: Number(file.size || 0),
        storagePath: pathRelativeToUploads(file.path),
      },
    });

    const hydrated = await Video.findById(created._id)
      .populate("uploadedBy", "name")
      .lean();
    return toVideoResponse(hydrated);
  } catch (error) {
    await deleteFileBestEffort(pathRelativeToUploads(file.path));
    throw error;
  }
}

export async function getVideoList(query = {}) {
  const { page, limit, skip } = buildPagination(query);
  const search = normalizeString(query.search);

  const filter = {};
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, total] = await Promise.all([
    Video.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("uploadedBy", "name")
      .lean(),
    Video.countDocuments(filter),
  ]);

  return {
    data: rows.map(toVideoResponse),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  };
}

export async function updateVideoByAdmin(videoId, payload = {}, file) {
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new Error("Invalid video ID");
  }

  const existing = await Video.findById(videoId);
  if (!existing) throw new Error("Video not found");

  const nextTitle = payload.title !== undefined ? normalizeString(payload.title) : existing.title;
  const nextDescription =
    payload.description !== undefined
      ? normalizeString(payload.description)
      : existing.description;

  if (!nextTitle) throw new Error("Video title is required");
  if (!nextDescription) throw new Error("Video description is required");

  const previousStoragePath = existing.file?.storagePath || "";

  existing.title = nextTitle;
  existing.description = nextDescription;

  if (file?.path) {
    existing.file = {
      originalName: file.originalname,
      mimeType: normalizeString(file.mimetype) || "video/mp4",
      size: Number(file.size || 0),
      storagePath: pathRelativeToUploads(file.path),
    };
  }

  const updated = await existing.save();
  if (file?.path && previousStoragePath) {
    await deleteFileBestEffort(previousStoragePath);
  }

  const hydrated = await Video.findById(updated._id)
    .populate("uploadedBy", "name")
    .lean();
  return toVideoResponse(hydrated);
}

export async function deleteVideoByAdmin(videoId) {
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new Error("Invalid video ID");
  }

  const deleted = await Video.findByIdAndDelete(videoId).lean();
  if (!deleted) {
    throw new Error("Video not found");
  }

  await deleteFileBestEffort(deleted.file?.storagePath);
  return { id: deleted._id };
}
