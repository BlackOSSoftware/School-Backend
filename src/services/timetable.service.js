import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import ClassModel from "../models/Class.model.js";
import Session from "../models/Session.model.js";
import Student from "../models/Student.model.js";
import Teacher from "../models/Teacher.model.js";
import Timetable from "../models/Timetable.model.js";
import { sendPushNotificationToTokens } from "./notification.service.js";

function str(value = "") {
  return String(value || "").trim();
}

function entityId(value, label) {
  const id = str(value);
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

function pathRelativeToUploads(absolutePath = "") {
  const normalized = str(absolutePath).replace(/\\/g, "/");
  const marker = "/uploads/";
  const idx = normalized.lastIndexOf(marker);
  if (idx >= 0) return normalized.slice(idx + 1);
  return `uploads/content/${normalized.split(/[/\\]/).pop()}`;
}

function absoluteFromStoragePath(storagePath = "") {
  const relative = str(storagePath).replace(/\\/g, "/").replace(/^\/+/, "");
  return path.resolve(process.cwd(), relative);
}

function resolveMimeType(file = {}) {
  const incoming = str(file.mimetype).toLowerCase();
  if (incoming && incoming !== "application/octet-stream") return incoming;
  const ext = path.extname(file.originalname || "").toLowerCase();
  const map = {
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
  return map[ext] || "application/octet-stream";
}

function buildFilePayload(file) {
  if (!file?.path) return null;
  return {
    originalName: str(file.originalname) || "attachment",
    mimeType: resolveMimeType(file),
    size: Number(file.size || 0),
    storagePath: pathRelativeToUploads(file.path),
  };
}

async function deleteStoredFile(storagePath) {
  const relative = str(storagePath);
  if (!relative) return;
  try {
    await fs.unlink(absoluteFromStoragePath(relative));
  } catch {
    // best effort
  }
}

async function deleteUploadedTemp(file) {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch {
    // best effort
  }
}

function formatTimetable(row) {
  if (!row) return null;
  const hasFile = Boolean(row.file?.storagePath);
  return {
    id: row._id,
    title: row.title,
    description: row.description || "",
    class: row.classId && typeof row.classId === "object" ? row.classId : null,
    session: row.sessionId && typeof row.sessionId === "object" ? row.sessionId : null,
    file: hasFile
      ? {
          name: row.file.originalName || null,
          size: row.file.size || null,
          mimeType: row.file.mimeType || null,
          url: `/${String(row.file.storagePath).replace(/\\/g, "/")}`,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveSessionId(preferred) {
  const provided = str(preferred);
  if (provided) {
    if (!mongoose.Types.ObjectId.isValid(provided)) throw new Error("Invalid session ID");
    const exists = await Session.findById(provided).select("_id").lean();
    if (!exists) throw new Error("Session not found");
    return String(exists._id);
  }
  const active = await Session.findOne({ isActive: true }).select("_id").lean();
  return active?._id ? String(active._id) : null;
}

async function assertClassExists(classId) {
  const row = await ClassModel.findById(classId).select("name section").lean();
  if (!row) throw new Error("Class not found");
  return row;
}

async function getTeacherAssignedClassId(teacherId) {
  const teacher = await Teacher.findById(teacherId).select("classTeacherOf").lean();
  if (!teacher) throw new Error("Teacher not found");
  if (!teacher.classTeacherOf) throw new Error("No class is assigned to this teacher");
  return String(teacher.classTeacherOf);
}

async function notifyClassStudents({ classId, title, action = "uploaded" }) {
  const students = await Student.find({
    classId,
    status: "active",
    fcmToken: { $type: "string", $ne: "" },
  })
    .select("fcmToken")
    .lean();

  const tokens = students.map((item) => str(item.fcmToken)).filter(Boolean);
  if (!tokens.length) return;

  await sendPushNotificationToTokens(tokens, {
    title: "Timetable Updated",
    body: `${str(title) || "Class timetable"} was ${action}.`,
    data: {
      type: "timetable_published",
      targetTab: "timetable",
      title: str(title),
    },
  });
}

async function loadTimetable(id) {
  return Timetable.findById(id)
    .populate("classId", "name section")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();
}

async function listByClass(classId, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const filter = { classId };
  const [total, rows] = await Promise.all([
    Timetable.countDocuments(filter),
    Timetable.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("classId", "name section")
      .populate("sessionId", "name startDate endDate isActive")
      .lean(),
  ]);

  return {
    data: rows.map(formatTimetable),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function createTeacherTimetable(teacherId, payload = {}, file) {
  const classId = await getTeacherAssignedClassId(teacherId);
  await assertClassExists(classId);
  const title = str(payload.title);
  if (!title) {
    await deleteUploadedTemp(file);
    throw new Error("Title is required");
  }

  try {
    const sessionId = await resolveSessionId(payload.sessionId);
    const row = await Timetable.create({
      title,
      description: str(payload.description),
      classId,
      sessionId,
      file: buildFilePayload(file),
      createdByTeacherId: teacherId,
      updatedByTeacherId: teacherId,
    });

    const saved = await loadTimetable(row._id);
    await notifyClassStudents({ classId, title, action: "uploaded" });
    return formatTimetable(saved);
  } catch (error) {
    await deleteUploadedTemp(file);
    throw error;
  }
}

export async function updateTeacherTimetable(teacherId, timetableId, payload = {}, file) {
  const classId = await getTeacherAssignedClassId(teacherId);
  const row = await Timetable.findById(entityId(timetableId, "timetable ID"));
  if (!row) {
    await deleteUploadedTemp(file);
    throw new Error("Timetable not found");
  }
  if (String(row.classId) !== classId) {
    await deleteUploadedTemp(file);
    throw new Error("You can edit timetables of your assigned class only");
  }

  const title = str(payload.title ?? row.title);
  if (!title) {
    await deleteUploadedTemp(file);
    throw new Error("Title is required");
  }

  const removeFile = String(payload.removeFile || "").toLowerCase() === "true";
  const oldStoragePath = row.file?.storagePath || null;

  try {
    row.title = title;
    if (payload.description !== undefined) row.description = str(payload.description);
    row.updatedByTeacherId = teacherId;

    if (file?.path) {
      row.file = buildFilePayload(file);
    } else if (removeFile) {
      row.set("file", null);
    }

    await row.save();

    if ((file?.path || removeFile) && oldStoragePath) {
      await deleteStoredFile(oldStoragePath);
    }

    const saved = await loadTimetable(row._id);
    await notifyClassStudents({ classId, title: row.title, action: "updated" });
    return formatTimetable(saved);
  } catch (error) {
    await deleteUploadedTemp(file);
    throw error;
  }
}

export async function deleteTeacherTimetable(teacherId, timetableId) {
  const classId = await getTeacherAssignedClassId(teacherId);
  const row = await Timetable.findById(entityId(timetableId, "timetable ID"));
  if (!row) throw new Error("Timetable not found");
  if (String(row.classId) !== classId) {
    throw new Error("You can delete timetables of your assigned class only");
  }

  const storagePath = row.file?.storagePath || null;
  await Timetable.deleteOne({ _id: row._id });
  await deleteStoredFile(storagePath);
  return { id: String(row._id) };
}

export async function getTeacherTimetables(teacherId, query = {}) {
  const classId = await getTeacherAssignedClassId(teacherId);
  return listByClass(classId, query);
}

export async function createAdminTimetable(adminId, payload = {}, file) {
  const classId = entityId(payload.classId, "class ID");
  await assertClassExists(classId);
  const title = str(payload.title);
  if (!title) {
    await deleteUploadedTemp(file);
    throw new Error("Title is required");
  }

  try {
    const sessionId = await resolveSessionId(payload.sessionId);
    const row = await Timetable.create({
      title,
      description: str(payload.description),
      classId,
      sessionId,
      file: buildFilePayload(file),
      createdByAdminId: adminId,
      updatedByAdminId: adminId,
    });

    const saved = await loadTimetable(row._id);
    await notifyClassStudents({ classId, title, action: "uploaded" });
    return formatTimetable(saved);
  } catch (error) {
    await deleteUploadedTemp(file);
    throw error;
  }
}

export async function updateAdminTimetable(adminId, timetableId, payload = {}, file) {
  const row = await Timetable.findById(entityId(timetableId, "timetable ID"));
  if (!row) {
    await deleteUploadedTemp(file);
    throw new Error("Timetable not found");
  }

  const nextClassId = payload.classId ? entityId(payload.classId, "class ID") : String(row.classId);
  await assertClassExists(nextClassId);

  const title = str(payload.title ?? row.title);
  if (!title) {
    await deleteUploadedTemp(file);
    throw new Error("Title is required");
  }

  const removeFile = String(payload.removeFile || "").toLowerCase() === "true";
  const oldStoragePath = row.file?.storagePath || null;

  try {
    row.title = title;
    if (payload.description !== undefined) row.description = str(payload.description);
    row.classId = nextClassId;
    row.updatedByAdminId = adminId;

    if (file?.path) {
      row.file = buildFilePayload(file);
    } else if (removeFile) {
      row.set("file", null);
    }

    await row.save();

    if ((file?.path || removeFile) && oldStoragePath) {
      await deleteStoredFile(oldStoragePath);
    }

    const saved = await loadTimetable(row._id);
    await notifyClassStudents({ classId: nextClassId, title: row.title, action: "updated" });
    return formatTimetable(saved);
  } catch (error) {
    await deleteUploadedTemp(file);
    throw error;
  }
}

export async function deleteAdminTimetable(adminId, timetableId) {
  entityId(adminId, "admin ID");
  const row = await Timetable.findById(entityId(timetableId, "timetable ID"));
  if (!row) throw new Error("Timetable not found");

  const storagePath = row.file?.storagePath || null;
  await Timetable.deleteOne({ _id: row._id });
  await deleteStoredFile(storagePath);
  return { id: String(row._id) };
}

export async function getAdminTimetables(query = {}) {
  const classId = str(query.classId);
  if (!classId) throw new Error("Class is required");
  await assertClassExists(entityId(classId, "class ID"));
  return listByClass(classId, query);
}

export async function getStudentTimetables(studentId, query = {}) {
  const student = await Student.findById(entityId(studentId, "student ID"))
    .select("classId status")
    .lean();
  if (!student) throw new Error("Student not found");
  if (student.status !== "active") throw new Error("Student account inactive");
  if (!student.classId) throw new Error("Student class not assigned");
  return listByClass(String(student.classId), query);
}
