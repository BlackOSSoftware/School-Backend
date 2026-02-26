import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Student from "../models/Student.model.js";
import ClassModel from "../models/Class.model.js";
import Session from "../models/Session.model.js";
import Bus from "../models/Bus.model.js";
import { deleteCacheByPattern, getCache, setCache } from "../config/redis.js";

const STUDENT_LIST_CACHE_TTL_SECONDS = 120;
const STUDENT_DETAIL_CACHE_TTL_SECONDS = 180;
const STUDENT_CACHE_VERSION = "v4";
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

function hasPopulatedBus(busValue) {
  return Boolean(
    busValue &&
      typeof busValue === "object" &&
      !Array.isArray(busValue) &&
      busValue._id
  );
}

function formatStudentForResponse(row) {
  if (!row) return row;

  const bus = hasPopulatedBus(row.busId) ? row.busId : null;
  const isTransferred = Boolean(row.isTransferred);
  const statusLabel = isTransferred ? "transferred" : row.status;
  const transfer = isTransferred
    ? {
        isTransferred: true,
        transferredAt: row.transferredAt || null,
      }
    : null;

  return {
    ...row,
    bus,
    statusLabel,
    transfer,
  };
}

function normalizeStatusFilter(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return "active";
  if (normalized === "all") return "";
  if (!["active", "inactive"].includes(normalized)) {
    throw new Error("Status filter must be active, inactive or all");
  }
  return normalized;
}

async function validateClassId(classId) {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new Error("Invalid class ID");
  }

  const row = await ClassModel.findById(classId).lean();
  if (!row) throw new Error("Class not found");
  return row;
}

async function resolveBusId(busId) {
  const providedBusId = normalizeString(busId);
  if (!providedBusId) return null;

  if (!mongoose.Types.ObjectId.isValid(providedBusId)) {
    throw new Error("Invalid bus ID");
  }

  const bus = await Bus.findById(providedBusId).lean();
  if (!bus) throw new Error("Bus not found");
  return providedBusId;
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
  const name = normalizeString(payload.name);
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

  const [sessionId, busId] = await Promise.all([
    resolveSessionId(payload.sessionId),
    resolveBusId(payload.busId),
    validateClassId(classId),
  ]);
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
      busId,
      status,
      isTransferred: false,
      transferredAt: null,
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

export async function createStudentsBulk(payload = {}) {
  const inputRows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.students)
      ? payload.students
      : [];
  if (inputRows.length === 0) {
    throw new Error("students array is required");
  }

  if (inputRows.length > 1000) {
    throw new Error("Cannot create more than 1000 students in one request");
  }

  const rootSessionId =
    payload && !Array.isArray(payload) ? normalizeString(payload.sessionId) : "";
  const rootBusId =
    payload && !Array.isArray(payload) ? normalizeString(payload.busId) : "";
  const activeSession = await Session.findOne({ isActive: true }).select("_id").lean();
  if (!activeSession?._id) {
    throw new Error("No active session found. Provide sessionId.");
  }

  if (rootBusId && !mongoose.Types.ObjectId.isValid(rootBusId)) {
    throw new Error("Invalid bus ID");
  }

  const normalizedRows = inputRows.map((row, index) => {
    const name = normalizeString(row?.name);
    const scholarNumber = normalizeString(row?.scholarNumber);
    const parentName = normalizeString(row?.parentName);
    const phoneNumber = normalizeString(row?.number || row?.phoneNumber);
    const classId = normalizeString(row?.classId);
    const busId = normalizeString(row?.busId || rootBusId);
    const status = normalizeString(row?.status || "active").toLowerCase();
    const sessionId = normalizeString(row?.sessionId || rootSessionId || activeSession._id);

    if (!name) throw new Error(`name is required at index ${index}`);
    if (!scholarNumber) throw new Error(`Scholar number is required at index ${index}`);
    if (!parentName) throw new Error(`Parent name is required at index ${index}`);
    if (!phoneNumber) throw new Error(`Number is required at index ${index}`);
    if (!classId) throw new Error(`Class ID is required at index ${index}`);
    if (!["active", "inactive"].includes(status)) {
      throw new Error(`Status must be active or inactive at index ${index}`);
    }
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      throw new Error(`Invalid class ID at index ${index}`);
    }
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new Error(`Invalid session ID at index ${index}`);
    }
    if (busId && !mongoose.Types.ObjectId.isValid(busId)) {
      throw new Error(`Invalid bus ID at index ${index}`);
    }

    return {
      name,
      scholarNumber,
      parentName,
      phoneNumber,
      classId,
      sessionId,
      busId: busId || null,
      status,
    };
  });

  const duplicateScholarInPayload = normalizedRows.find(
    (row, index) =>
      normalizedRows.findIndex((inner) => inner.scholarNumber === row.scholarNumber) !== index
  );
  if (duplicateScholarInPayload) {
    throw new Error(`Duplicate scholar number in request: ${duplicateScholarInPayload.scholarNumber}`);
  }

  const classIds = [...new Set(normalizedRows.map((row) => row.classId))];
  const sessionIds = [...new Set(normalizedRows.map((row) => row.sessionId))];
  const busIds = [...new Set(normalizedRows.map((row) => row.busId).filter(Boolean))];
  const scholarNumbers = normalizedRows.map((row) => row.scholarNumber);

  const [classes, sessions, buses, existingScholars] = await Promise.all([
    ClassModel.find({ _id: { $in: classIds } }).select("_id").lean(),
    Session.find({ _id: { $in: sessionIds } }).select("_id").lean(),
    busIds.length > 0 ? Bus.find({ _id: { $in: busIds } }).select("_id").lean() : Promise.resolve([]),
    Student.find({ scholarNumber: { $in: scholarNumbers } }).select("scholarNumber").lean(),
  ]);

  const classSet = new Set(classes.map((row) => String(row._id)));
  const sessionSet = new Set(sessions.map((row) => String(row._id)));
  const busSet = new Set(buses.map((row) => String(row._id)));

  for (const row of normalizedRows) {
    if (!classSet.has(row.classId)) {
      throw new Error(`Class not found for scholar number ${row.scholarNumber}`);
    }
    if (!sessionSet.has(row.sessionId)) {
      throw new Error(`Session not found for scholar number ${row.scholarNumber}`);
    }
    if (row.busId && !busSet.has(row.busId)) {
      throw new Error(`Bus not found for scholar number ${row.scholarNumber}`);
    }
  }

  if (existingScholars.length > 0) {
    throw new Error(`Scholar number already exists: ${existingScholars[0].scholarNumber}`);
  }

  const rowsToInsert = await Promise.all(
    normalizedRows.map(async (row) => {
      const generatedPassword = generateStudentPassword(row.name, row.scholarNumber);
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      return {
        ...row,
        password: hashedPassword,
        role: "student",
        isTransferred: false,
        transferredAt: null,
        generatedPassword,
      };
    })
  );

  const insertPayload = rowsToInsert.map(({ generatedPassword, ...rest }) => rest);
  const createdRows = await Student.insertMany(insertPayload, { ordered: true });

  await invalidateStudentCache();

  return {
    students: createdRows,
    passwords: rowsToInsert.map((row) => ({
      scholarNumber: row.scholarNumber,
      password: row.generatedPassword,
      generatedPassword: row.generatedPassword,
    })),
    totalCreated: createdRows.length,
  };
}

export async function getAllStudents(query = {}) {
  await backfillMissingStudentSessions();

  const { page, limit, skip } = buildPagination(query);
  const search = normalizeString(query.search);
  const classId = normalizeString(query.classId);
  const status = normalizeStatusFilter(query.status);
  const sessionId = normalizeString(query.sessionId);

  if (classId) {
    await validateClassId(classId);
  }

  if (sessionId && !mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new Error("Invalid session ID");
  }

  const cacheKey = `students:${STUDENT_CACHE_VERSION}:list:page=${page}:limit=${limit}:search=${search}:class=${classId}:status=${status}:session=${sessionId}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = {};
  if (classId) {
    filter.classId = classId;
  }
  if (status) {
    filter.status = status;
  }
  if (sessionId) {
    filter.sessionId = sessionId;
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
      .populate("busId", "busNumber trackingUsername trackingPassword")
      .lean(),
    Student.countDocuments(filter),
  ]);

  const result = {
    data: rows.map(formatStudentForResponse),
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

  const cacheKey = `students:${STUDENT_CACHE_VERSION}:detail:${studentId}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const row = await Student.findById(studentId)
    .populate("classId", "name section")
    .populate("sessionId", "name startDate endDate isActive")
    .populate("busId", "busNumber trackingUsername trackingPassword")
    .lean();

  if (!row) throw new Error("Student not found");

  const formatted = formatStudentForResponse(row);
  await setCache(cacheKey, JSON.stringify(formatted), STUDENT_DETAIL_CACHE_TTL_SECONDS);
  return formatted;
}

export async function getMyStudentProfile(studentId) {
  await backfillMissingStudentSessions();

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error("Invalid student ID");
  }

  const cacheKey = `students:${STUDENT_CACHE_VERSION}:me:${studentId}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const row = await Student.findById(studentId)
    .select("name scholarNumber classId sessionId busId status")
    .populate("classId", "name section")
    .populate("sessionId", "name startDate endDate isActive")
    .populate("busId", "busNumber trackingUsername trackingPassword")
    .lean();

  if (!row) throw new Error("Student not found");

  const result = {
    id: row._id,
    name: row.name,
    scholarNumber: row.scholarNumber,
    class: row.classId || null,
    session: row.sessionId || null,
    bus: row.busId || null,
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
    payload.name !== undefined
      ? normalizeString(payload.name)
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
  const nextBusId = payload.busId !== undefined
    ? await resolveBusId(payload.busId)
    : student.busId
      ? String(student.busId)
      : null;
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
  student.busId = nextBusId;
  student.status = nextStatus;

  if (nextStatus === "active") {
    student.isTransferred = false;
    student.transferredAt = null;
  }

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

  const hasExplicitStatus = normalizeString(query.status) !== "";
  return getAllStudents({
    ...query,
    classId,
    status: hasExplicitStatus ? query.status : "active",
  });
}

export async function bulkPromoteStudents(payload = {}) {
  const targetSessionId = await resolveSessionId(payload.sessionId);
  const sourceClassId = normalizeString(payload.sourceClassId);
  const rawUpdates = Array.isArray(payload.updates) ? payload.updates : [];

  if (!targetSessionId) throw new Error("Target session is required");
  if (rawUpdates.length === 0) {
    throw new Error("At least one student update is required");
  }

  if (sourceClassId) {
    await validateClassId(sourceClassId);
  }

  const normalizedUpdates = rawUpdates.map((item, index) => {
    const studentId = normalizeString(item.studentId || item.id);
    const action = normalizeString(item.action).toLowerCase();
    const targetClassId = normalizeString(item.targetClassId || item.classId);

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      throw new Error(`Invalid student ID at index ${index}`);
    }

    if (!["promote", "retain", "transfer"].includes(action)) {
      throw new Error(`Invalid action at index ${index}. Use promote, retain or transfer`);
    }

    if (action !== "transfer" && targetClassId && !mongoose.Types.ObjectId.isValid(targetClassId)) {
      throw new Error(`Invalid target class ID at index ${index}`);
    }

    return {
      studentId,
      action,
      targetClassId,
    };
  });

  const duplicateStudentId = normalizedUpdates.find(
    (item, index) =>
      normalizedUpdates.findIndex((inner) => inner.studentId === item.studentId) !== index
  );
  if (duplicateStudentId) {
    throw new Error("Duplicate student IDs are not allowed in updates");
  }

  const studentIds = normalizedUpdates.map((item) => item.studentId);
  const allTargetClassIds = [
    ...new Set(
      normalizedUpdates
        .map((item) => item.targetClassId)
        .filter(Boolean)
    ),
  ];

  const [students, classes] = await Promise.all([
    Student.find({ _id: { $in: studentIds } })
      .select("_id classId status")
      .lean(),
    allTargetClassIds.length > 0
      ? ClassModel.find({ _id: { $in: allTargetClassIds } }).select("_id").lean()
      : Promise.resolve([]),
  ]);

  if (students.length !== studentIds.length) {
    throw new Error("One or more students were not found");
  }

  const existingClassIdSet = new Set(classes.map((item) => String(item._id)));
  for (const update of normalizedUpdates) {
    if (update.targetClassId && !existingClassIdSet.has(update.targetClassId)) {
      throw new Error(`Target class not found for student ${update.studentId}`);
    }
  }

  const studentById = new Map(students.map((item) => [String(item._id), item]));

  if (sourceClassId) {
    const invalidSourceMatch = normalizedUpdates.find((item) => {
      const student = studentById.get(item.studentId);
      return String(student?.classId || "") !== sourceClassId;
    });
    if (invalidSourceMatch) {
      throw new Error(`Student ${invalidSourceMatch.studentId} does not belong to source class`);
    }
  }

  const operations = normalizedUpdates.map((item) => {
    const student = studentById.get(item.studentId);
    const currentClassId = String(student.classId);
    const isTransfer = item.action === "transfer";

    const nextClassId = isTransfer
      ? currentClassId
      : item.targetClassId || (item.action === "retain" ? currentClassId : "");

    if (!isTransfer && !nextClassId) {
      throw new Error(`Target class is required for action ${item.action} on student ${item.studentId}`);
    }

    return {
      updateOne: {
        filter: { _id: item.studentId },
        update: {
          $set: {
            classId: nextClassId,
            sessionId: targetSessionId,
            status: isTransfer ? "inactive" : "active",
            isTransferred: isTransfer,
            transferredAt: isTransfer ? new Date() : null,
          },
        },
      },
    };
  });

  const session = await mongoose.startSession();
  let bulkResult;
  try {
    await session.withTransaction(async () => {
      bulkResult = await Student.bulkWrite(operations, {
        ordered: false,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  await invalidateStudentCache();

  const summary = normalizedUpdates.reduce(
    (acc, item) => {
      if (item.action === "transfer") acc.transferred += 1;
      if (item.action === "retain") acc.retained += 1;
      if (item.action === "promote") acc.promoted += 1;
      return acc;
    },
    { promoted: 0, retained: 0, transferred: 0 }
  );

  return {
    sessionId: targetSessionId,
    totalRequested: normalizedUpdates.length,
    updatedCount: bulkResult?.modifiedCount || 0,
    ...summary,
  };
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
