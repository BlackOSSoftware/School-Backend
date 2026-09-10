import mongoose from "mongoose";
import Result, { EXAM_TYPES, EXAM_TYPES_NEEDING_MONTH } from "../models/Result.model.js";
import Session from "../models/Session.model.js";
import Student from "../models/Student.model.js";
import Teacher from "../models/Teacher.model.js";
import { sendPushNotificationToTokens } from "./notification.service.js";

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function str(value) {
  return String(value || "").trim();
}

function entityId(value, label) {
  const id = str(value);
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

function examKeyOf(examType, month, examTitle) {
  return str(`${examType}-${month || ""}-${examTitle}`).toLowerCase().replace(/\s+/g, " ");
}

function normalizeExamType(value) {
  const examType = str(value);
  if (!EXAM_TYPES.includes(examType)) throw new Error("Invalid exam type");
  return examType;
}

function normalizeMonth(value, examType) {
  const month = str(value);
  if (EXAM_TYPES_NEEDING_MONTH.includes(examType)) {
    if (!month) throw new Error(`Month is required for ${examType}`);
    if (!MONTH_OPTIONS.includes(month)) throw new Error("Invalid month");
    return month;
  }
  return null;
}

function defaultExamTitle(examType, month) {
  if (EXAM_TYPES_NEEDING_MONTH.includes(examType) && month) {
    return `${month} ${examType}`;
  }
  return examType;
}

function normalizeOutOf(value) {
  const outOf = Number(value);
  if (!Number.isFinite(outOf) || outOf <= 0) {
    throw new Error("Out of is required and must be a valid number");
  }
  if (outOf > 1000) throw new Error("Out of cannot exceed 1000");
  return outOf;
}

function normalizeSubjectMarks(subjectMarks, allowedSubjects = [], defaultOutOf = 100) {
  const payload = Array.isArray(subjectMarks) ? subjectMarks : [];
  if (!payload.length) throw new Error("Subject marks are required");

  const allowed = new Set(
    allowedSubjects
      .map((item) => str(item).toUpperCase())
      .filter(Boolean)
      .filter((item) => item !== "ALL")
  );

  const normalized = payload.map((entry, index) => {
    const subject = str(entry?.subject).toUpperCase();
    const isAbsent = Boolean(entry?.isAbsent);
    const outOf = normalizeOutOf(entry?.outOf ?? defaultOutOf);
    const marks = isAbsent ? 0 : Number(entry?.marks);

    if (!subject) throw new Error(`Subject name is required at row ${index + 1}`);
    if (allowed.size && !allowed.has(subject)) {
      throw new Error(`${subject} is not part of the class subjects`);
    }
    if (!isAbsent && (!Number.isFinite(marks) || marks < 0)) {
      throw new Error(`Valid marks are required for ${subject}`);
    }
    if (!isAbsent && marks > outOf) {
      throw new Error(`Marks for ${subject} cannot exceed out of (${outOf})`);
    }

    return { subject, marks, outOf, isAbsent };
  });

  const seen = new Set();
  for (const item of normalized) {
    if (seen.has(item.subject)) throw new Error(`Duplicate subject found: ${item.subject}`);
    seen.add(item.subject);
  }

  if (allowed.size) {
    const missing = [...allowed].filter((subject) => !seen.has(subject));
    if (missing.length) {
      throw new Error(`Marks are required for all subjects. Missing: ${missing.join(", ")}`);
    }
  }

  return normalized;
}

function sumTotals(subjectMarks = []) {
  return subjectMarks.reduce(
    (acc, item) => {
      acc.totalOutOf += Number(item.outOf || 0);
      if (!item.isAbsent) acc.totalMarks += Number(item.marks || 0);
      return acc;
    },
    { totalMarks: 0, totalOutOf: 0 }
  );
}

function formatResultRecord(row) {
  if (!row) return null;

  const subjectMarks = (Array.isArray(row.subjectMarks) ? row.subjectMarks : []).map((item) => ({
    subject: item.subject,
    marks: item.isAbsent ? null : Number(item.marks ?? 0),
    outOf: Number(item.outOf ?? row.outOf ?? 0),
    isAbsent: Boolean(item.isAbsent),
  }));
  const { totalMarks, totalOutOf } = sumTotals(
    subjectMarks.map((item) => ({
      ...item,
      marks: item.isAbsent ? 0 : Number(item.marks || 0),
    }))
  );

  return {
    id: row._id,
    examTitle: row.examTitle,
    examType: row.examType,
    month: row.month || null,
    examKey: row.examKey,
    totalMarks,
    totalOutOf,
    outOf: row.outOf,
    subjectMarks,
    class: row.classId && typeof row.classId === "object" ? row.classId : null,
    student: row.studentId && typeof row.studentId === "object" ? row.studentId : null,
    session: row.sessionId && typeof row.sessionId === "object" ? row.sessionId : null,
    submittedByTeacherId: row.submittedByTeacherId,
    updatedByTeacherId: row.updatedByTeacherId,
    isLive: Boolean(row.isLive),
    liveAt: row.liveAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let liveBackfillDone = false;
async function ensureLegacyResultsLive() {
  if (liveBackfillDone) return;
  await Result.updateMany(
    { $or: [{ isLive: { $exists: false } }, { isLive: null }] },
    { $set: { isLive: true } }
  );
  liveBackfillDone = true;
}

async function getTeacherWithAssignedClass(teacherId) {
  const teacher = await Teacher.findById(teacherId)
    .populate("classTeacherOf", "name section subjects")
    .lean();
  if (!teacher) throw new Error("Teacher not found");
  if (!teacher.classTeacherOf?._id) throw new Error("No class is assigned to this teacher");
  return teacher;
}

async function getStudentForTeacherClass(studentId, classId) {
  const student = await Student.findOne({ _id: studentId, classId, status: "active" })
    .populate("classId", "name section subjects")
    .populate("sessionId", "name startDate endDate isActive")
    .select("name scholarNumber classId sessionId status fcmToken")
    .lean();
  if (!student) throw new Error("Student not found in your assigned class");
  return student;
}

async function resolveSessionId(student = {}) {
  const fromStudent = str(student?.sessionId?._id || student?.sessionId);
  if (fromStudent && mongoose.Types.ObjectId.isValid(fromStudent)) return fromStudent;
  const active = await Session.findOne({ isActive: true }).select("_id").lean();
  const id = str(active?._id);
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("No active session found for result submission");
  }
  return id;
}

async function assertStudentExists(studentId) {
  const student = await Student.findById(studentId)
    .populate("classId", "name section subjects")
    .populate("sessionId", "name startDate endDate isActive")
    .select("name scholarNumber classId sessionId status fcmToken")
    .lean();
  if (!student) throw new Error("Student not found");
  if (student.status !== "active") throw new Error("Student account inactive");
  return student;
}

async function notifyResult({ student, classInfo, examTitle, examType, month, totalMarks, totalOutOf, action = "uploaded" }) {
  const token = str(student?.fcmToken);
  if (!token) return;

  const classLabel = [str(classInfo?.name), str(classInfo?.section)].filter(Boolean).join(" ");
  const examLabel = str(examTitle) || str(examType) || "Result";
  const scoreLabel = `${Number(totalMarks)} / ${Number(totalOutOf)}`;

  await sendPushNotificationToTokens([token], {
    title: "Result Published",
    body: [
      `${examLabel}${month ? ` (${month})` : ""} result ${action}.`,
      classLabel ? `Class: ${classLabel}.` : "",
      `Score: ${scoreLabel}.`,
    ].filter(Boolean).join(" "),
    data: {
      type: "result_published",
      targetTab: "results",
      examTitle: examLabel,
      examType: str(examType),
      month: str(month),
      className: str(classInfo?.name),
      classSection: str(classInfo?.section),
      score: scoreLabel,
    },
  });
}

function orderSubjectMarks(normalized, classSubjects) {
  const order = classSubjects
    .map((item) => str(item).toUpperCase())
    .filter(Boolean)
    .filter((item) => item !== "ALL");
  return order.map((subject) => normalized.find((item) => item.subject === subject));
}

function marksheetSubjects(subjects = []) {
  return (Array.isArray(subjects) ? subjects : [])
    .map((item) => str(item))
    .filter(Boolean)
    .filter((item) => item.toUpperCase() !== "ALL");
}

async function loadResultsForStudent(studentId, { liveOnly = false } = {}) {
  await ensureLegacyResultsLive();
  const filter = { studentId };
  if (liveOnly) filter.isLive = true;

  const rows = await Result.find(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .populate("classId", "name section subjects")
    .populate("studentId", "name scholarNumber")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();
  return rows.map(formatResultRecord);
}

function buildResultFields(payload, row, classSubjects, teacherId) {
  const examType = normalizeExamType(payload.examType ?? row?.examType);
  const month = normalizeMonth(payload.month ?? row?.month, examType);
  const examTitle = str(payload.examTitle) || defaultExamTitle(examType, month);
  const outOf = normalizeOutOf(payload.outOf ?? row?.outOf ?? 100);
  const subjectSource = Array.isArray(payload.subjectMarks) ? payload.subjectMarks : row?.subjectMarks;
  const ordered = orderSubjectMarks(
    normalizeSubjectMarks(subjectSource, classSubjects, outOf),
    classSubjects
  );
  const { totalMarks } = sumTotals(ordered);

  return {
    examType,
    month,
    examTitle,
    examKey: examKeyOf(examType, month, examTitle),
    outOf,
    subjectMarks: ordered,
    totalMarks,
    updatedByTeacherId: teacherId,
  };
}

export async function submitTeacherResult(teacherId, payload = {}) {
  const studentId = entityId(payload.studentId, "student ID");
  const teacher = await getTeacherWithAssignedClass(teacherId);
  const assignedClass = teacher.classTeacherOf;
  const classId = String(assignedClass._id);
  const classSubjects = marksheetSubjects(assignedClass.subjects);
  if (!classSubjects.length) throw new Error("No subjects are configured for this class");

  const student = await getStudentForTeacherClass(studentId, classId);
  const sessionId = await resolveSessionId(student);
  const fields = buildResultFields(payload, null, classSubjects, teacherId);

  const existing = await Result.findOne({ studentId, classId, sessionId, examKey: fields.examKey });
  if (existing) {
    Object.assign(existing, fields);
    await existing.save();
  } else {
    await Result.create({
      ...fields,
      studentId,
      classId,
      sessionId,
      submittedByTeacherId: teacherId,
      isLive: false,
    });
  }

  const saved = await Result.findOne({ studentId, classId, sessionId, examKey: fields.examKey })
    .populate("classId", "name section subjects")
    .populate("studentId", "name scholarNumber")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  const formatted = formatResultRecord(saved);
  if (formatted.isLive) {
    await notifyResult({
      student,
      classInfo: assignedClass,
      examTitle: fields.examTitle,
      examType: fields.examType,
      month: fields.month,
      totalMarks: formatted.totalMarks,
      totalOutOf: formatted.totalOutOf,
      action: existing ? "updated" : "uploaded",
    });
  }

  return formatted;
}

export async function getTeacherStudentResults(teacherId, studentId) {
  const normalizedStudentId = entityId(studentId, "student ID");
  const teacher = await getTeacherWithAssignedClass(teacherId);
  await getStudentForTeacherClass(normalizedStudentId, String(teacher.classTeacherOf?._id || ""));
  return loadResultsForStudent(normalizedStudentId);
}

export async function updateTeacherResult(teacherId, resultId, payload = {}) {
  const row = await Result.findById(entityId(resultId, "result ID"));
  if (!row) throw new Error("Result not found");

  const teacher = await getTeacherWithAssignedClass(teacherId);
  const assignedClassId = String(teacher.classTeacherOf?._id || "");
  if (String(row.classId) !== assignedClassId) {
    throw new Error("You can edit results of your assigned class only");
  }

  const student = await getStudentForTeacherClass(row.studentId, assignedClassId);
  const classSubjects = marksheetSubjects(student.classId?.subjects);
  Object.assign(row, buildResultFields(payload, row, classSubjects, teacherId));
  await row.save();

  const saved = await Result.findById(row._id)
    .populate("classId", "name section subjects")
    .populate("studentId", "name scholarNumber")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  const formatted = formatResultRecord(saved);
  if (formatted.isLive) {
    await notifyResult({
      student,
      classInfo: student?.classId,
      examTitle: row.examTitle,
      examType: row.examType,
      month: row.month,
      totalMarks: formatted.totalMarks,
      totalOutOf: formatted.totalOutOf,
      action: "updated",
    });
  }
  return formatted;
}

export async function deleteTeacherResult(teacherId, resultId) {
  const row = await Result.findById(entityId(resultId, "result ID"));
  if (!row) throw new Error("Result not found");

  const teacher = await getTeacherWithAssignedClass(teacherId);
  if (String(row.classId) !== String(teacher.classTeacherOf?._id || "")) {
    throw new Error("You can delete results of your assigned class only");
  }

  await Result.deleteOne({ _id: row._id });
  return { id: String(row._id) };
}

export async function updateAdminResult(adminId, resultId, payload = {}) {
  entityId(adminId, "admin ID");
  const row = await Result.findById(entityId(resultId, "result ID"));
  if (!row) throw new Error("Result not found");

  const student = await assertStudentExists(row.studentId);
  const classSubjects = marksheetSubjects(student.classId?.subjects);
  const fields = buildResultFields(payload, row, classSubjects, row.updatedByTeacherId);
  Object.assign(row, fields);
  await row.save();

  const saved = await Result.findById(row._id)
    .populate("classId", "name section subjects")
    .populate("studentId", "name scholarNumber")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  const formatted = formatResultRecord(saved);
  if (formatted.isLive) {
    await notifyResult({
      student,
      classInfo: student?.classId,
      examTitle: row.examTitle,
      examType: row.examType,
      month: row.month,
      totalMarks: formatted.totalMarks,
      totalOutOf: formatted.totalOutOf,
      action: "updated",
    });
  }
  return formatted;
}

export async function deleteAdminResult(adminId, resultId) {
  entityId(adminId, "admin ID");
  const row = await Result.findById(entityId(resultId, "result ID"));
  if (!row) throw new Error("Result not found");
  await Result.deleteOne({ _id: row._id });
  return { id: String(row._id) };
}

export async function getStudentResults(studentId) {
  entityId(studentId, "student ID");
  const student = await Student.findById(studentId).select("_id");
  if (!student) throw new Error("Student not found");
  return loadResultsForStudent(studentId, { liveOnly: true });
}

export async function getAdminStudentResults(studentId) {
  entityId(studentId, "student ID");
  const student = await Student.findById(studentId).select("_id");
  if (!student) throw new Error("Student not found");
  return loadResultsForStudent(studentId, { liveOnly: false });
}

export async function getClassResultLiveStatus(classId) {
  await ensureLegacyResultsLive();
  const normalizedClassId = entityId(classId, "class ID");
  const [pending, live] = await Promise.all([
    Result.countDocuments({ classId: normalizedClassId, isLive: false }),
    Result.countDocuments({ classId: normalizedClassId, isLive: true }),
  ]);
  return { classId: normalizedClassId, pending, live };
}

export async function goLiveClassResults(adminId, classId) {
  entityId(adminId, "admin ID");
  await ensureLegacyResultsLive();
  const normalizedClassId = entityId(classId, "class ID");

  const pending = await Result.find({ classId: normalizedClassId, isLive: false })
    .populate("studentId", "name fcmToken")
    .populate("classId", "name section")
    .lean();

  if (!pending.length) {
    return { classId: normalizedClassId, updated: 0, pending: 0, live: await Result.countDocuments({ classId: normalizedClassId, isLive: true }) };
  }

  const now = new Date();
  await Result.updateMany(
    { classId: normalizedClassId, isLive: false },
    { $set: { isLive: true, liveAt: now } }
  );

  const notified = new Set();
  for (const row of pending) {
    const studentKey = String(row.studentId?._id || row.studentId || "");
    if (!studentKey || notified.has(studentKey)) continue;
    notified.add(studentKey);
    await notifyResult({
      student: row.studentId,
      classInfo: row.classId,
      examTitle: row.examTitle,
      examType: row.examType,
      month: row.month,
      totalMarks: row.totalMarks,
      totalOutOf: sumTotals(row.subjectMarks || []).totalOutOf || row.outOf,
      action: "published",
    });
  }

  return {
    classId: normalizedClassId,
    updated: pending.length,
    pending: 0,
    live: await Result.countDocuments({ classId: normalizedClassId, isLive: true }),
  };
}
