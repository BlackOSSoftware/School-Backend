import mongoose from "mongoose";
import Teacher from "../models/Teacher.model.js";
import ClassModel from "../models/Class.model.js";
import Student from "../models/Student.model.js";
import Session from "../models/Session.model.js";
import { deleteCacheByPattern, getCache, setCache } from "../config/redis.js";
import { generateAccessToken } from "../utils/jwt-utils.js";

async function validateClassId(classId, label = "Class ID") {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new Error(`Invalid ${label}`);
  }

  const exists = await ClassModel.exists({ _id: classId });
  if (!exists) {
    throw new Error(`${label.replace(" ID", "")} not found`);
  }
}

async function invalidateTeacherCache() {
  await deleteCacheByPattern("teachers:*");
}

function buildPagination(query = {}, defaults = { page: 1, limit: 10, maxLimit: 100 }) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
  const limit = Math.max(
    1,
    Math.min(defaults.maxLimit, parseInt(query.limit, 10) || defaults.limit)
  );
  return { page, limit, skip: (page - 1) * limit };
}

function normalizeTeacherPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    password: String(payload.password || ""),
    classTeacherOf: String(payload.classTeacherOf || "").trim(),
  };
}

async function validateTeacherPayload(payload = {}) {
  const normalized = normalizeTeacherPayload(payload);
  const { name, email, password, classTeacherOf } = normalized;

  if (!name) throw new Error("Teacher name is required");
  if (!email) throw new Error("Teacher email is required");
  if (!password) throw new Error("Teacher password is required");
  if (!classTeacherOf) throw new Error("Class teacher class ID is required");

  await validateClassId(classTeacherOf, "Class teacher class ID");
  return normalized;
}

export async function createTeacher(payload = {}, adminId) {
  const { name, email, password, classTeacherOf } = await validateTeacherPayload(payload);

  try {
    const created = await Teacher.create({
      name,
      email,
      password,
      classTeacherOf,
      createdBy: adminId,
    });

    await invalidateTeacherCache();
    return created;
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) {
      throw new Error("Teacher email already exists");
    }
    if (error.code === 11000 && error.keyPattern?.classTeacherOf) {
      throw new Error("This class already has a class teacher");
    }
    throw error;
  }
}

export async function bulkCreateTeachers(payload = {}, adminId) {
  const teachers = Array.isArray(payload?.teachers) ? payload.teachers : [];
  if (!teachers.length) {
    throw new Error("teachers array is required");
  }

  const normalizedTeachers = [];
  const seenEmails = new Set();
  const seenClassTeacherOf = new Set();

  for (let index = 0; index < teachers.length; index += 1) {
    const normalized = await validateTeacherPayload(teachers[index]);
    const label = `Teacher at row ${index + 1}`;

    if (seenEmails.has(normalized.email)) {
      throw new Error(`${label}: duplicate email in request`);
    }
    seenEmails.add(normalized.email);

    if (seenClassTeacherOf.has(normalized.classTeacherOf)) {
      throw new Error(`${label}: duplicate classTeacherOf in request`);
    }
    seenClassTeacherOf.add(normalized.classTeacherOf);

    normalizedTeachers.push(normalized);
  }

  const [existingTeachersByEmail, existingTeachersByClass] = await Promise.all([
    Teacher.find({ email: { $in: normalizedTeachers.map((item) => item.email) } })
      .select("email")
      .lean(),
    Teacher.find({ classTeacherOf: { $in: [...seenClassTeacherOf] } })
      .select("classTeacherOf")
      .lean(),
  ]);

  if (existingTeachersByEmail.length) {
    throw new Error(`Teacher email already exists: ${existingTeachersByEmail[0].email}`);
  }

  if (existingTeachersByClass.length) {
    throw new Error("One or more classes already have a class teacher");
  }

  try {
    const createdTeachers = [];

    for (const teacher of normalizedTeachers) {
      const created = await Teacher.create({
        name: teacher.name,
        email: teacher.email,
        password: teacher.password,
        classTeacherOf: teacher.classTeacherOf,
        createdBy: adminId,
      });
      createdTeachers.push(created);
    }

    await invalidateTeacherCache();
    return {
      createdCount: createdTeachers.length,
      teachers: createdTeachers,
    };
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) {
      throw new Error("Teacher email already exists");
    }
    if (error.code === 11000 && error.keyPattern?.classTeacherOf) {
      throw new Error("This class already has a class teacher");
    }
    throw error;
  }
}

export async function getAllTeachers(query = {}) {
  const { page, limit, skip } = buildPagination(query);
  const search = String(query.search || "").trim();

  const cacheKey = `teachers:list:page=${page}:limit=${limit}:search=${search}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = search
    ? {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    Teacher.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("classTeacherOf", "name section subjects")
      .lean(),
    Teacher.countDocuments(filter),
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

  await setCache(cacheKey, JSON.stringify(result), 120);
  return result;
}

export async function getTeacherById(teacherId) {
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    throw new Error("Invalid teacher ID");
  }

  const cacheKey = `teachers:detail:${teacherId}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const row = await Teacher.findById(teacherId)
    .populate("classTeacherOf", "name section subjects")
    .lean();

  if (!row) throw new Error("Teacher not found");
  await setCache(cacheKey, JSON.stringify(row), 180);
  return row;
}

export async function updateTeacher(teacherId, payload = {}) {
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    throw new Error("Invalid teacher ID");
  }

  const existing = await Teacher.findById(teacherId).select("+password");
  if (!existing) throw new Error("Teacher not found");

  const nextName = payload.name !== undefined ? String(payload.name).trim() : existing.name;
  const nextEmail =
    payload.email !== undefined
      ? String(payload.email).trim().toLowerCase()
      : existing.email;
  const nextPassword = payload.password !== undefined ? String(payload.password) : undefined;
  const nextStatus =
    payload.status !== undefined ? String(payload.status).trim() : existing.status;
  const nextClassTeacherOf =
    payload.classTeacherOf !== undefined
      ? String(payload.classTeacherOf).trim()
      : String(existing.classTeacherOf || "").trim();

  if (!nextName) throw new Error("Teacher name is required");
  if (!nextEmail) throw new Error("Teacher email is required");
  if (!nextClassTeacherOf) throw new Error("Class teacher class ID is required");
  if (!["active", "inactive"].includes(nextStatus)) {
    throw new Error("Status must be active or inactive");
  }

  await validateClassId(nextClassTeacherOf, "Class teacher class ID");

  existing.name = nextName;
  existing.email = nextEmail;
  existing.status = nextStatus;
  existing.classTeacherOf = nextClassTeacherOf;

  if (nextPassword !== undefined) {
    if (!nextPassword) throw new Error("Password cannot be empty");
    existing.password = nextPassword;
  }

  try {
    const updated = await existing.save();
    await invalidateTeacherCache();
    return updated;
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) {
      throw new Error("Teacher email already exists");
    }
    if (error.code === 11000 && error.keyPattern?.classTeacherOf) {
      throw new Error("This class already has a class teacher");
    }
    throw error;
  }
}

export async function deleteTeacher(teacherId) {
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    throw new Error("Invalid teacher ID");
  }

  const deleted = await Teacher.findByIdAndDelete(teacherId);
  if (!deleted) throw new Error("Teacher not found");

  await invalidateTeacherCache();
  return deleted;
}

export async function loginTeacher(payload = {}) {
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");

  if (!email) throw new Error("Email required");
  if (!password) throw new Error("Password required");

  const teacher = await Teacher.findOne({ email }).select("+password");
  if (!teacher) throw new Error("Invalid credentials");
  if (teacher.status !== "active") throw new Error("Account inactive");

  const isMatch = await teacher.comparePassword(password);
  if (!isMatch) throw new Error("Invalid credentials");

  const accessToken = generateAccessToken(teacher);

  return {
    accessToken,
    user: {
      id: teacher._id,
      name: teacher.name,
      role: teacher.role,
      email: teacher.email,
    },
  };
}

export async function getTeacherClassesAndStudents(teacherId, query = {}) {
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    throw new Error("Invalid teacher ID");
  }

  const { page, limit, skip } = buildPagination(query);

  const teacher = await Teacher.findById(teacherId)
    .populate("classTeacherOf", "name section subjects")
    .lean();

  if (!teacher) throw new Error("Teacher not found");

  const assignedClassIds = teacher.classTeacherOf?._id ? [String(teacher.classTeacherOf._id)] : [];
  const requestedSessionId = String(query.sessionId || "").trim();
  if (requestedSessionId && !mongoose.Types.ObjectId.isValid(requestedSessionId)) {
    throw new Error("Invalid session ID");
  }
  const activeSession = requestedSessionId
    ? null
    : await Session.findOne({ isActive: true }).select("_id").lean();
  const resolvedSessionId = requestedSessionId || String(activeSession?._id || "");

  const cacheKey = `teachers:me:classes:teacher=${teacherId}:session=${resolvedSessionId || "none"}:page=${page}:limit=${limit}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = assignedClassIds.length
    ? {
        status: "active",
        classId: { $in: assignedClassIds },
        ...(resolvedSessionId ? { sessionId: resolvedSessionId } : {}),
      }
    : null;

  const [students, totalStudents] = filter
    ? await Promise.all([
        Student.find(filter)
          .select("name scholarNumber parentName phoneNumber classId sessionId status")
          .populate("classId", "name section subjects")
          .populate("sessionId", "name startDate endDate isActive")
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Student.countDocuments(filter),
      ])
    : [[], 0];

  const result = {
    teacher: {
      id: teacher._id,
      name: teacher.name,
      email: teacher.email,
      classTeacherOf: teacher.classTeacherOf,
      classSubjects: Array.isArray(teacher.classTeacherOf?.subjects)
        ? teacher.classTeacherOf.subjects
        : [],
    },
    assignedClasses: teacher.classTeacherOf ? [teacher.classTeacherOf] : [],
    students,
    totalStudents,
    page,
    limit,
    totalPages: Math.ceil(totalStudents / limit),
    hasNextPage: page < Math.ceil(totalStudents / limit),
    hasPrevPage: page > 1,
  };

  await setCache(cacheKey, JSON.stringify(result), 120);
  return result;
}

export async function getTeacherStudentsByAssignedClasses(teacherId, query = {}) {
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    throw new Error("Invalid teacher ID");
  }

  const { page, limit, skip } = buildPagination(query);
  const teacher = await Teacher.findById(teacherId).lean();
  if (!teacher) throw new Error("Teacher not found");

  const assignedClassIds = new Set();
  if (teacher.classTeacherOf) assignedClassIds.add(String(teacher.classTeacherOf));

  const selectedClassId = String(query.classId || "").trim();
  if (selectedClassId && !assignedClassIds.has(selectedClassId)) {
    throw new Error("You are not assigned to this class");
  }

  const search = String(query.search || "").trim();
  const requestedSessionId = String(query.sessionId || "").trim();
  if (requestedSessionId && !mongoose.Types.ObjectId.isValid(requestedSessionId)) {
    throw new Error("Invalid session ID");
  }
  const activeSession = requestedSessionId
    ? null
    : await Session.findOne({ isActive: true }).select("_id").lean();
  const resolvedSessionId = requestedSessionId || String(activeSession?._id || "");

  const classFilter = selectedClassId ? [selectedClassId] : [...assignedClassIds];

  if (classFilter.length === 0) {
    return {
      data: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: page > 1,
    };
  }

  const cacheKey = `teachers:me:students:teacher=${teacherId}:class=${selectedClassId || "all"}:session=${resolvedSessionId || "none"}:page=${page}:limit=${limit}:search=${search}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = {
    status: "active",
    classId: { $in: classFilter },
    ...(resolvedSessionId ? { sessionId: resolvedSessionId } : {}),
  };

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
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .select("name scholarNumber parentName phoneNumber classId sessionId status")
      .populate("classId", "name section subjects")
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

  await setCache(cacheKey, JSON.stringify(result), 120);
  return result;
}

export async function getTeacherStudentsByClassId(teacherId, classId, query = {}) {
  const selectedClassId = String(classId || "").trim();
  if (!selectedClassId) throw new Error("Class ID is required");

  return getTeacherStudentsByAssignedClasses(teacherId, {
    ...query,
    classId: selectedClassId,
  });
}
