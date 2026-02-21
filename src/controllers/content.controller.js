import fs from "node:fs";
import path from "node:path";
import Content from "../models/Content.model.js";
import {
  createContentByTeacher,
  getStudentContentList,
  getTeacherContentList,
} from "../services/content.service.js";

function pickTypeFromRequest(req) {
  return req.params.type || req.query.type || req.body.type;
}

function toAbsoluteUrl(req, rawPath = "") {
  const normalizedPath = String(rawPath || "").startsWith("/")
    ? String(rawPath)
    : `/${String(rawPath || "")}`;
  return `${req.protocol}://${req.get("host")}${normalizedPath}`;
}

export async function createTeacherContentController(req, res) {
  try {
    const payload = { ...req.body, type: pickTypeFromRequest(req) };
    const result = await createContentByTeacher(req.user?._id, payload, req.file);

    return res.status(201).json({
      success: true,
      message: `${result.type} created successfully`,
      data: result,
    });
  } catch (error) {
    console.error(
      `[content:create:error] teacher=${req.user?._id || "unknown"} type=${pickTypeFromRequest(req) || "n/a"} classId=${req.body?.classId || "n/a"} file=${req.file?.originalname || "none"} size=${req.file?.size || 0} message=${error.message}`
    );
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create content",
    });
  }
}

export async function getTeacherContentController(req, res) {
  try {
    const query = { ...req.query, type: pickTypeFromRequest(req) || req.query.type };
    const result = await getTeacherContentList(req.user?._id, query);
    const mappedData = (result.data || []).map((item) => {
      if (!item.file?.url) return item;
      return {
        ...item,
        file: {
          ...item.file,
          url: toAbsoluteUrl(req, item.file.url),
          openUrl: toAbsoluteUrl(req, item.file.url),
          downloadUrl: toAbsoluteUrl(req, `/api/v1/teacher/me/content/download/${item.id}`),
        },
      };
    });

    return res.status(200).json({
      success: true,
      ...result,
      data: mappedData,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch teacher content",
    });
  }
}

export async function getStudentContentController(req, res) {
  try {
    const query = { ...req.query, type: pickTypeFromRequest(req) || req.query.type };
    const result = await getStudentContentList(req.user?._id, query);
    const mappedData = (result.data || []).map((item) => {
      if (!item.file?.url) return item;
      return {
        ...item,
        file: {
          ...item.file,
          url: toAbsoluteUrl(req, item.file.url),
          openUrl: toAbsoluteUrl(req, item.file.url),
          downloadUrl: toAbsoluteUrl(req, `/api/v1/student/me/content/download/${item.id}`),
        },
      };
    });

    return res.status(200).json({
      success: true,
      ...result,
      data: mappedData,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch student content",
    });
  }
}

export async function downloadContentController(req, res) {
  try {
    const content = await Content.findById(req.params.id).lean();
    if (!content || !content.file?.storagePath) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const filePath = path.resolve(process.cwd(), content.file.storagePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File missing from server",
      });
    }

    const mimeType = content.file.mimeType || "application/octet-stream";
    const originalName = content.file.originalName || "document";
    const encodedName = encodeURIComponent(originalName);
    const mode = String(req.query.mode || "").toLowerCase();
    const inlineTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];
    const dispositionType =
      mode === "open" || inlineTypes.includes(mimeType) ? "inline" : "attachment";

    res.setHeader(
      "Content-Disposition",
      `${dispositionType}; filename="${originalName.replace(/"/g, "")}"; filename*=UTF-8''${encodedName}`
    );
    res.setHeader("Content-Type", mimeType);
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Download failed",
    });
  }
}
