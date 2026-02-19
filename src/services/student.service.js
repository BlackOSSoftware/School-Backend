import mongoose from "mongoose";
import Student from "../models/Student.model.js";
import ClassModel from "../models/Class.model.js";
import Session from "../models/Session.model.js";
import { deleteCacheByPattern, getCache, setCache } from "../config/redis.js";

const STUDENT_LIST_CACHE_TTL_SECONDS = 120;
const STUDENT_DETAIL_CACHE_TTL_SECONDS = 180;
const BACKFILL_CHECK_INTERVAL_MS = 10 * 60 * 1000;
let lastBackfillCheckAt = 0;

function normalizeString(value) {
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

function generateStudentPassword(name, scholarNumber) {
  const firstWord = normalizeString(name).split(/\s+/)[0] || "";
  const onlyLetters = firstWord.toLowerCase().replace(/[^a-z]/g, "");
  const prefix = `${onlyLetters}xxxx`.slice(0, 4);
  return `${prefix}${scholarNumber}`;
}

async function validateClassId(classId) {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new Error("Invalid class ID");
  }

  const row = await ClassModel.findById(classId).lean();
  if (!row) throw new Error("Class not found");
  return row;
}

async function resolveSessionId(sessionId) {
  const providedSessionId = normalizeString(sessionId);

  if (providedSessionId) {
    if (!mongoose.Types.ObjectId.isValid(providedSessionId)) {
      throw new Error("Invalid session ID");
    }

    const providedSession = await Session.findById(providedSessionId).lean();
    if (!providedSession) throw new Error("Session not found");
    return providedSessionId;
  }

  const activeSession = await Session.findOne({ isActive: true }).lean();
  if (!activeSession) {
    throw new Error("No active session found. Provide sessionId.");
  }

  return String(activeSession._id);
}

async function invalidateStudentCache() {
  await deleteCacheByPattern("students:*");
  await deleteCacheByPattern("teachers:*");
}

async function backfillMissingStudentSessions() {
  if (Date.now() - lastBackfillCheckAt < BACKFILL_CHECK_INTERVAL_MS) {
    return;
  }
  lastBackfillCheckAt = Date.now();

  const activeSession = await Session.findOne({ isActive: true }).select("_id").lean();
  if (!activeSession?._id) return;

  const missingExists = await Student.exists({
    $or: [{ sessionId: { $exists: false } }, { sessionId: null }],
  });
  if (!missingExists) return;

  const result = await Student.updateMany(
    {
      $or: [{ sessionId: { $exists: false } }, { sessionId: null }],
    },
    {
      $set: { sessionId: activeSession._id },
    }
  );

  if ((result.modifiedCount || 0) > 0) {
    await invalidateStudentCache();
  }
}

export async function createStudent(payload = {}) {
  const name = normalizeString(payload.name || payload.firstName);
  const scholarNumber = normalizeString(payload.scholarNumber);
  const parentName = normalizeString(payload.parentName);
  const phoneNumber = normalizeString(payload.number || payload.phoneNumber);
  const classId = normalizeString(payload.classId);
  const status = normalizeString(payload.status || "active").toLowerCase();

  if (!name) throw new Error("Student name is required");
  if (!scholarNumber) throw new Error("Scholar number is required");
  if (!parentName) throw new Error("Parent name is required");
  if (!phoneNumber) throw new Error("Number is required");
  if (!classId) throw new Error("Class ID is required");
  if (!["active", "inactive"].includes(status)) {
    throw new Error("Status must be active or inactive");
  }

  const [sessionId] = await Promise.all([resolveSessionId(payload.sessionId), validateClassId(classId)]);
  const generatedPassword = generateStudentPassword(name, scholarNumber);

  try {
    const created = await Student.create({
      name,
      scholarNumber,
      parentName,
      phoneNumber,
      password: generatedPassword,
      classId,
      sessionId,
      status,
    });

    await invalidateStudentCache();
    return {
      student: created,
      generatedPassword,
    };
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.scholarNumber) {
      throw new Error("Scholar number already exists");
    }
    throw error;
  }
}

export async function getAllStudents(query = {}) {
  await backfillMissingStudentSessions();

  const { page, limit, skip } = buildPagination(query);
  const search = normalizeString(query.search);
  const classId = normalizeString(query.classId);

  if (classId) {
    await validateClassId(classId);
  }

  const cacheKey = `students:list:page=${page}:limit=${limit}:search=${search}:class=${classId}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = {};
  if (classId) {
    filter.classId = classId;
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { scholarNumber: { $regex: search, $options: "i" } },
      { parentName: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, total] = await Promise.all([
    Student.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("classId", "name section")
      .populate("sessionId", "name startDate endDate isActive")
      .lean(),
    Student.countDocuments(filter),
  ]);

  const result = {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  };

  await setCache(cacheKey, JSON.stringify(result), STUDENT_LIST_CACHE_TTL_SECONDS);
  return result;
}

export async function getStudentById(studentId) {
  await backfillMissingStudentSessions();

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error("Invalid student ID");
  }

  const cacheKey = `students:detail:${studentId}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const row = await Student.findById(studentId)
    .populate("classId", "name section")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  if (!row) throw new Error("Student not found");
  await setCache(cacheKey, JSON.stringify(row), STUDENT_DETAIL_CACHE_TTL_SECONDS);
  return row;
}

export async function getMyStudentProfile(studentId) {
  await backfillMissingStudentSessions();

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error("Invalid student ID");
  }

  const cacheKey = `students:me:${studentId}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const row = await Student.findById(studentId)
    .select("name scholarNumber classId sessionId status")
    .populate("classId", "name section")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  if (!row) throw new Error("Student not found");

  const result = {
    id: row._id,
    name: row.name,
    scholarNumber: row.scholarNumber,
    class: row.classId || null,
    session: row.sessionId || null,
    status: row.status,
  };

  await setCache(cacheKey, JSON.stringify(result), STUDENT_DETAIL_CACHE_TTL_SECONDS);
  return result;
}

export async function updateStudent(studentId, payload = {}) {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error("Invalid student ID");
  }

  const student = await Student.findById(studentId).select("+password");
  if (!student) throw new Error("Student not found");

  const nextName =
    payload.name !== undefined || payload.firstName !== undefined
      ? normalizeString(payload.name || payload.firstName)
      : student.name;
  const nextScholarNumber =
    payload.scholarNumber !== undefined
      ? normalizeString(payload.scholarNumber)
      : student.scholarNumber;
  const nextParentName =
    payload.parentName !== undefined ? normalizeString(payload.parentName) : student.parentName;
  const nextPhoneNumber =
    payload.number !== undefined || payload.phoneNumber !== undefined
      ? normalizeString(payload.number || payload.phoneNumber)
      : student.phoneNumber;
  const nextPasswordRaw =
    payload.newPassword !== undefined
      ? payload.newPassword
      : payload.password !== undefined
        ? payload.password
        : undefined;
  const nextPassword =
    nextPasswordRaw !== undefined ? String(nextPasswordRaw || "") : undefined;
  const nextClassId =
    payload.classId !== undefined ? normalizeString(payload.classId) : String(student.classId);
  const nextSessionId = payload.sessionId !== undefined
    ? await resolveSessionId(payload.sessionId)
    : String(student.sessionId);
  const nextStatus =
    payload.status !== undefined ? normalizeString(payload.status).toLowerCase() : student.status;

  if (!nextName) throw new Error("Student name is required");
  if (!nextScholarNumber) throw new Error("Scholar number is required");
  if (!nextParentName) throw new Error("Parent name is required");
  if (!nextPhoneNumber) throw new Error("Number is required");
  if (!nextClassId) throw new Error("Class ID is required");
  if (!nextSessionId) throw new Error("Session ID is required");
  if (!["active", "inactive"].includes(nextStatus)) {
    throw new Error("Status must be active or inactive");
  }

  await validateClassId(nextClassId);

  student.name = nextName;
  student.scholarNumber = nextScholarNumber;
  student.parentName = nextParentName;
  student.phoneNumber = nextPhoneNumber;
  student.classId = nextClassId;
  student.sessionId = nextSessionId;
  student.status = nextStatus;

  if (nextPassword !== undefined) {
    if (!nextPassword) throw new Error("Password cannot be empty");
    student.password = nextPassword;
  }

  try {
    const updated = await student.save();
    await invalidateStudentCache();
    return updated;
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.scholarNumber) {
      throw new Error("Scholar number already exists");
    }
    throw error;
  }
}

export async function getStudentsByClass(classId, query = {}) {
  await validateClassId(classId);
  return getAllStudents({ ...query, classId });
}

export async function deleteStudent(studentId) {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error("Invalid student ID");
  }

  const deleted = await Student.findByIdAndDelete(studentId);
  if (!deleted) throw new Error("Student not found");

  await invalidateStudentCache();
  return deleted;
}
