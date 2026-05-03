import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import ClassModel from "../models/Class.model.js";
import Content from "../models/Content.model.js";
import Student from "../models/Student.model.js";
import Teacher from "../models/Teacher.model.js";
import Session from "../models/Session.model.js";

const CONTENT_BACKFILL_CHECK_INTERVAL_MS = 10 * 60 * 1000;
let lastContentBackfillCheckAt = 0;

function normalizeString(value = "") {
  return String(value || "").trim();
}

function normalizeSubject(value = "") {
  return normalizeString(value).toUpperCase();
}

function buildPagination(query = {}, defaults = { page: 1, limit: 10, maxLimit: 100 }) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
  const limit = Math.max(
    1,
    Math.min(defaults.maxLimit, parseInt(query.limit, 10) || defaults.limit)
  );
  return { page, limit, skip: (page - 1) * limit };
}

function normalizeType(rawType = "") {
  const type = normalizeString(rawType).toLowerCase();
  if (!["homework", "notes"].includes(type)) {
    throw new Error("Type must be homework or notes");
  }
  return type;
}

function normalizeOptionalType(rawType = "") {
  const type = normalizeString(rawType).toLowerCase();
  if (!type || type === "all") return null;
  return normalizeType(type);
}

function resolveMimeType(file = {}) {
  const incoming = normalizeString(file.mimetype).toLowerCase();
  if (incoming && incoming !== "application/octet-stream") {
    return incoming;
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  const mimeByExt = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  return mimeByExt[ext] || "application/octet-stream";
}

function toContentResponse(row) {
  const hasFile = Boolean(row.file?.storagePath);

  return {
    id: row._id,
    type: row.type,
    title: row.title,
    description: row.description,
    subject: row.subject,
    class: row.classId || null,
    session: row.sessionId || null,
    teacher: row.createdBy || null,
    createdAt: row.createdAt,
    file: hasFile
      ? {
          name: row.file.originalName || null,
          size: row.file.size || null,
          mimeType: row.file.mimeType || null,
          url: `/${row.file.storagePath.replace(/\\/g, "/")}`,
        }
      : null,
  };
}

async function resolveSessionId(sessionId) {
  const providedSessionId = normalizeString(sessionId);

  if (providedSessionId) {
    if (!mongoose.Types.ObjectId.isValid(providedSessionId)) {
      throw new Error("Invalid session ID");
    }

    const providedSession = await Session.findById(providedSessionId).lean();
    if (!providedSession) throw new Error("Session not found");
    return String(providedSession._id);
  }

  const activeSession = await Session.findOne({ isActive: true }).select("_id").lean();
  if (!activeSession?._id) return null;
  return String(activeSession._id);
}

async function backfillMissingContentSessions() {
  if (Date.now() - lastContentBackfillCheckAt < CONTENT_BACKFILL_CHECK_INTERVAL_MS) {
    return;
  }
  lastContentBackfillCheckAt = Date.now();

  const activeSession = await Session.findOne({ isActive: true }).select("_id").lean();
  if (!activeSession?._id) return;

  const missingExists = await Content.exists({
    $or: [{ sessionId: { $exists: false } }, { sessionId: null }],
  });
  if (!missingExists) return;

  await Content.updateMany(
    {
      $or: [{ sessionId: { $exists: false } }, { sessionId: null }],
    },
    {
      $set: { sessionId: activeSession._id },
    }
  );
}

async function deleteUploadedFile(file) {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch {
    // No-op: best effort cleanup for failed create
  }
}

async function getTeacherAssignmentsByClass(teacherId, classId) {
  const teacher = await Teacher.findById(teacherId).select("classTeacherOf").lean();
  if (!teacher) throw new Error("Teacher not found");

  if (String(teacher.classTeacherOf || "") === String(classId)) {
    const classRow = await ClassModel.findById(classId).select("subjects").lean();
    return [...new Set((classRow?.subjects || []).map((item) => normalizeSubject(item)).filter(Boolean))];
  }

  return [];
}

async function validateClassExists(classId) {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new Error("Invalid class ID");
  }

  const exists = await ClassModel.exists({ _id: classId });
  if (!exists) {
    throw new Error("Class not found");
  }
}

function resolveSubjectForCreate(inputSubject, allowedSubjects = []) {
  const uniqueSubjects = [...new Set(allowedSubjects.map((item) => normalizeSubject(item)).filter(Boolean))];
  if (uniqueSubjects.length === 0) {
    throw new Error("You are not assigned to this class");
  }

  const providedSubject = normalizeSubject(inputSubject);

  if (!providedSubject) {
    if (uniqueSubjects.length === 1) {
      return uniqueSubjects[0];
    }
    throw new Error("Subject is required for this class");
  }

  if (!uniqueSubjects.includes(providedSubject)) {
    throw new Error("You are not assigned to this subject for selected class");
  }

  return providedSubject;
}

export async function createContentByTeacher(teacherId, payload = {}, file) {
  const classId = normalizeString(payload.classId);
  const title = normalizeString(payload.title);
  const description = normalizeString(payload.description);

  try {
    if (!classId) throw new Error("Class ID is required");
    if (!title) throw new Error("Title is required");
    if (!description) throw new Error("Description is required");

    const type = normalizeType(payload.type);

    const [sessionId, assignedSubjects] = await Promise.all([
      resolveSessionId(payload.sessionId),
      getTeacherAssignmentsByClass(teacherId, classId),
      validateClassExists(classId),
    ]);
    const subject = resolveSubjectForCreate(payload.subject, assignedSubjects);

    const created = await Content.create({
      type,
      classId,
      sessionId,
      subject,
      title,
      description,
      createdBy: teacherId,
      file: file
        ? {
            originalName: file.originalname,
            mimeType: resolveMimeType(file),
            size: file.size,
            storagePath: pathRelativeToUploads(file.path),
          }
        : undefined,
    });

    const hydrated = await Content.findById(created._id)
      .populate("classId", "name section")
      .populate("sessionId", "name startDate endDate isActive")
      .populate("createdBy", "name email")
      .lean();

    return toContentResponse(hydrated);
  } catch (error) {
    await deleteUploadedFile(file);
    throw error;
  }
}

function pathRelativeToUploads(absolutePath = "") {
  const normalizedAbsolute = normalizeString(absolutePath).replace(/\\/g, "/");
  const marker = "/uploads/";
  const markerIndex = normalizedAbsolute.lastIndexOf(marker);

  if (markerIndex >= 0) {
    return normalizedAbsolute.slice(markerIndex + 1);
  }

  return `uploads/content/${normalizeString(absolutePath).split(/[/\\]/).pop()}`;
}

function applyCommonFilters(filter, query = {}) {
  const type = normalizeOptionalType(query.type);
  if (type) filter.type = type;

  const subject = normalizeSubject(query.subject);
  if (subject && subject !== "ALL") filter.subject = subject;
}

export async function getTeacherContentList(teacherId, query = {}) {
  await backfillMissingContentSessions();

  const teacher = await Teacher.findById(teacherId).lean();
  if (!teacher) throw new Error("Teacher not found");

  const { page, limit, skip } = buildPagination(query);
  const filter = { createdBy: teacherId };
  const sessionId = await resolveSessionId(query.sessionId);
  if (sessionId) {
    filter.sessionId = sessionId;
  }

  const classId = normalizeString(query.classId);
  if (classId) {
    await validateClassExists(classId);
    const assignedSubjects = await getTeacherAssignmentsByClass(teacherId, classId);
    if (assignedSubjects.length === 0) {
      throw new Error("You are not assigned to this class");
    }
    filter.classId = classId;
  }

  applyCommonFilters(filter, query);

  const [rows, total] = await Promise.all([
    Content.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("classId", "name section")
      .populate("sessionId", "name startDate endDate isActive")
      .populate("createdBy", "name email")
      .lean(),
    Content.countDocuments(filter),
  ]);

  return {
    data: rows.map(toContentResponse),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  };
}

export async function getStudentContentList(studentId, query = {}) {
  await backfillMissingContentSessions();

  const student = await Student.findById(studentId).select("classId sessionId").lean();
  if (!student) throw new Error("Student not found");

  const { page, limit, skip } = buildPagination(query);
  const filter = { classId: student.classId };
  if (student.sessionId) {
    filter.sessionId = student.sessionId;
  }
  applyCommonFilters(filter, query);

  const [rows, total] = await Promise.all([
    Content.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("classId", "name section")
      .populate("sessionId", "name startDate endDate isActive")
      .populate("createdBy", "name email")
      .lean(),
    Content.countDocuments(filter),
  ]);

  return {
    data: rows.map(toContentResponse),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  };
}
