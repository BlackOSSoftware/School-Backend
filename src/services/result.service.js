import mongoose from "mongoose";
import ClassModel from "../models/Class.model.js";
import Result from "../models/Result.model.js";
import Session from "../models/Session.model.js";
import Student from "../models/Student.model.js";
import Teacher from "../models/Teacher.model.js";
import { sendPushNotificationToTokens } from "./notification.service.js";

const EXAM_TYPE_OPTIONS = ["Monthly Test", "Quarterly Exam", "Half-Yearly Exam", "Annual Exam"];
const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeEntityId(value, label) {
  const id = normalizeString(value);
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

function normalizeExamKey(value) {
  return normalizeString(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeExamType(value) {
  const examType = normalizeString(value);
  if (!EXAM_TYPE_OPTIONS.includes(examType)) {
    throw new Error("Invalid exam type");
  }
  return examType;
}

function normalizeMonth(value, examType) {
  const month = normalizeString(value);
  if (examType === "Monthly Test") {
    if (!month) {
      throw new Error("Month is required for Monthly Test");
    }
    if (!MONTH_OPTIONS.includes(month)) {
      throw new Error("Invalid month");
    }
    return month;
  }
  return null;
}

function buildDefaultExamTitle(examType, month) {
  if (examType === "Monthly Test") {
    return `${month} Monthly Test`;
  }
  return examType;
}

function normalizeOutOf(value) {
  const outOf = Number(value);
  if (!Number.isFinite(outOf) || outOf <= 0) {
    throw new Error("Out of is required and must be a valid number");
  }
  if (outOf > 1000) {
    throw new Error("Out of cannot exceed 1000");
  }
  return outOf;
}

function normalizeSubjectMarks(subjectMarks, allowedSubjects = [], outOf = 100) {
  const payload = Array.isArray(subjectMarks) ? subjectMarks : [];
  if (payload.length === 0) {
    throw new Error("Subject marks are required");
  }

  const allowedSubjectSet = new Set(
    allowedSubjects.map((item) => normalizeString(item).toUpperCase()).filter(Boolean)
  );

  const normalized = payload.map((entry, index) => {
    const subject = normalizeString(entry?.subject).toUpperCase();
    const rawMarks = entry?.marks;
    const marks = Number(rawMarks);

    if (!subject) {
      throw new Error(`Subject name is required at row ${index + 1}`);
    }
    if (!Number.isFinite(marks) || marks < 0) {
      throw new Error(`Valid marks are required for ${subject}`);
    }
    if (marks > outOf) {
      throw new Error(`Marks for ${subject} cannot exceed out of (${outOf})`);
    }
    if (allowedSubjectSet.size > 0 && !allowedSubjectSet.has(subject)) {
      throw new Error(`${subject} is not part of the class subjects`);
    }

    return {
      subject,
      marks,
    };
  });

  const seenSubjects = new Set();
  for (const item of normalized) {
    if (seenSubjects.has(item.subject)) {
      throw new Error(`Duplicate subject found: ${item.subject}`);
    }
    seenSubjects.add(item.subject);
  }

  if (allowedSubjectSet.size > 0) {
    const missingSubjects = [...allowedSubjectSet].filter(
      (subject) => !seenSubjects.has(subject)
    );
    if (missingSubjects.length > 0) {
      throw new Error(`Marks are required for all subjects. Missing: ${missingSubjects.join(", ")}`);
    }
  }

  return normalized;
}

function formatResultRecord(row) {
  if (!row) return null;

  const classInfo = row.classId && typeof row.classId === "object"
    ? row.classId
    : null;
  const studentInfo = row.studentId && typeof row.studentId === "object"
    ? row.studentId
    : null;
  const sessionInfo = row.sessionId && typeof row.sessionId === "object"
    ? row.sessionId
    : null;

  return {
    id: row._id,
    examTitle: row.examTitle,
    examType: row.examType,
    month: row.month || null,
    examKey: row.examKey,
    totalMarks: row.totalMarks,
    outOf: row.outOf,
    subjectMarks: Array.isArray(row.subjectMarks) ? row.subjectMarks : [],
    class: classInfo,
    student: studentInfo,
    session: sessionInfo,
    submittedByTeacherId: row.submittedByTeacherId,
    updatedByTeacherId: row.updatedByTeacherId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getTeacherWithAssignedClass(teacherId) {
  const teacher = await Teacher.findById(teacherId)
    .populate("classTeacherOf", "name section subjects")
    .lean();

  if (!teacher) {
    throw new Error("Teacher not found");
  }
  if (!teacher.classTeacherOf?._id) {
    throw new Error("No class is assigned to this teacher");
  }

  return teacher;
}

async function getStudentForTeacherClass(studentId, classId) {
  const student = await Student.findOne({
    _id: studentId,
    classId,
    status: "active",
  })
    .populate("classId", "name section subjects")
    .populate("sessionId", "name startDate endDate isActive")
    .select("name scholarNumber classId sessionId status fcmToken")
    .lean();

  if (!student) {
    throw new Error("Student not found in your assigned class");
  }

  return student;
}

async function resolveSessionId(student = {}) {
  const studentSessionId = normalizeString(student?.sessionId?._id || student?.sessionId);
  if (studentSessionId && mongoose.Types.ObjectId.isValid(studentSessionId)) {
    return studentSessionId;
  }

  const activeSession = await Session.findOne({ isActive: true }).select("_id").lean();
  const activeSessionId = normalizeString(activeSession?._id);
  if (!activeSessionId || !mongoose.Types.ObjectId.isValid(activeSessionId)) {
    throw new Error("No active session found for result submission");
  }
  return activeSessionId;
}

async function assertStudentExists(studentId) {
  const student = await Student.findById(studentId)
    .populate("classId", "name section subjects")
    .populate("sessionId", "name startDate endDate isActive")
    .select("name scholarNumber classId sessionId status fcmToken")
    .lean();

  if (!student) {
    throw new Error("Student not found");
  }
  if (student.status !== "active") {
    throw new Error("Student account inactive");
  }
  return student;
}

async function dispatchResultNotification({ student, classInfo, examTitle, examType, month, totalMarks, outOf, action = "uploaded" }) {
  const token = normalizeString(student?.fcmToken);
  if (!token) {
    return;
  }

  const className = normalizeString(classInfo?.name);
  const classSection = normalizeString(classInfo?.section);
  const classLabel = [className, classSection].filter(Boolean).join(" ").trim();
  const examLabel = normalizeString(examTitle) || normalizeString(examType) || "Result";
  const monthLabel = normalizeString(month);
  const scoreLabel = Number.isFinite(Number(totalMarks)) && Number.isFinite(Number(outOf))
    ? `${Number(totalMarks)} / ${Number(outOf)}`
    : "";

  const bodyParts = [
    `${examLabel}${monthLabel ? ` (${monthLabel})` : ""} result ${action}.`,
    classLabel ? `Class: ${classLabel}.` : "",
    scoreLabel ? `Score: ${scoreLabel}.` : "",
  ].filter(Boolean);

  await sendPushNotificationToTokens([token], {
    title: "Result Published",
    body: bodyParts.join(" "),
    data: {
      type: "result_published",
      targetTab: "results",
      examTitle: examLabel,
      examType: normalizeString(examType),
      month: monthLabel,
      className,
      classSection,
      score: scoreLabel,
    },
  });
}

async function loadResultsForStudent(studentId) {
  const rows = await Result.find({ studentId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .populate("classId", "name section subjects")
    .populate("studentId", "name scholarNumber")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  return rows.map(formatResultRecord);
}

export async function submitTeacherResult(teacherId, payload = {}) {
  const examType = normalizeExamType(payload.examType);
  const month = normalizeMonth(payload.month, examType);
  const autoExamTitle = buildDefaultExamTitle(examType, month);
  const examTitle = normalizeString(payload.examTitle) || autoExamTitle;
  const examKey = normalizeExamKey(`${examType}-${month || ""}-${examTitle}`);
  const outOf = normalizeOutOf(payload.outOf);
  const studentId = normalizeEntityId(payload.studentId, "student ID");

  const teacher = await getTeacherWithAssignedClass(teacherId);
  const assignedClass = teacher.classTeacherOf;
  const classId = String(assignedClass._id);
  const classSubjects = Array.isArray(assignedClass.subjects) ? assignedClass.subjects : [];

  if (classSubjects.length === 0) {
    throw new Error("No subjects are configured for this class");
  }

  const student = await getStudentForTeacherClass(studentId, classId);
  const sessionId = await resolveSessionId(student);

  const normalizedSubjectMarks = normalizeSubjectMarks(payload.subjectMarks, classSubjects, outOf);
  const subjectOrder = classSubjects.map((item) => normalizeString(item).toUpperCase());
  const orderedSubjectMarks = subjectOrder.map((subject) =>
    normalizedSubjectMarks.find((item) => item.subject === subject)
  );
  const totalMarks = orderedSubjectMarks.reduce((sum, item) => sum + Number(item?.marks || 0), 0);

  const existing = await Result.findOne({
    studentId,
    classId,
    sessionId,
    examKey,
  });

  if (existing) {
    existing.examType = examType;
    existing.month = month;
    existing.examTitle = examTitle;
    existing.outOf = outOf;
    existing.subjectMarks = orderedSubjectMarks;
    existing.totalMarks = totalMarks;
    existing.updatedByTeacherId = teacherId;
    await existing.save();
  } else {
    await Result.create({
      examType,
      month,
      examTitle,
      examKey,
      studentId,
      classId,
      sessionId,
      outOf,
      subjectMarks: orderedSubjectMarks,
      totalMarks,
      submittedByTeacherId: teacherId,
      updatedByTeacherId: teacherId,
    });
  }

  const saved = await Result.findOne({
    studentId,
    classId,
    sessionId,
    examKey,
  })
    .populate("classId", "name section subjects")
    .populate("studentId", "name scholarNumber")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  await dispatchResultNotification({
    student,
    classInfo: assignedClass,
    examTitle,
    examType,
    month,
    totalMarks,
    outOf,
    action: existing ? "updated" : "uploaded",
  });

  return formatResultRecord(saved);
}

export async function getTeacherStudentResults(teacherId, studentId) {
  const normalizedStudentId = normalizeEntityId(studentId, "student ID");
  const teacher = await getTeacherWithAssignedClass(teacherId);
  const classId = String(teacher.classTeacherOf?._id || "");
  const student = await getStudentForTeacherClass(normalizedStudentId, classId);
  const data = await loadResultsForStudent(student._id);
  return data;
}

export async function updateTeacherResult(teacherId, resultId, payload = {}) {
  const normalizedResultId = normalizeEntityId(resultId, "result ID");
  const row = await Result.findById(normalizedResultId);
  if (!row) {
    throw new Error("Result not found");
  }

  const teacher = await getTeacherWithAssignedClass(teacherId);
  const assignedClassId = String(teacher.classTeacherOf?._id || "");
  if (String(row.classId) !== assignedClassId) {
    throw new Error("You can edit results of your assigned class only");
  }

  const student = await getStudentForTeacherClass(row.studentId, assignedClassId);
  const classSubjects = Array.isArray(student.classId?.subjects) ? student.classId.subjects : [];
  const examType = normalizeExamType(payload.examType ?? row.examType);
  const month = normalizeMonth(payload.month ?? row.month, examType);
  const autoExamTitle = buildDefaultExamTitle(examType, month);
  const examTitle = normalizeString(payload.examTitle) || autoExamTitle;
  const outOf = normalizeOutOf(payload.outOf ?? row.outOf);
  const subjectMarksPayload = Array.isArray(payload.subjectMarks) ? payload.subjectMarks : row.subjectMarks;
  const normalizedSubjectMarks = normalizeSubjectMarks(subjectMarksPayload, classSubjects, outOf);
  const subjectOrder = classSubjects.map((item) => normalizeString(item).toUpperCase());
  const orderedSubjectMarks = subjectOrder.map((subject) =>
    normalizedSubjectMarks.find((item) => item.subject === subject)
  );
  const totalMarks = orderedSubjectMarks.reduce((sum, item) => sum + Number(item?.marks || 0), 0);

  row.examType = examType;
  row.month = month;
  row.examTitle = examTitle;
  row.examKey = normalizeExamKey(`${examType}-${month || ""}-${examTitle}`);
  row.outOf = outOf;
  row.subjectMarks = orderedSubjectMarks;
  row.totalMarks = totalMarks;
  row.updatedByTeacherId = teacherId;
  await row.save();

  const saved = await Result.findById(row._id)
    .populate("classId", "name section subjects")
    .populate("studentId", "name scholarNumber")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  await dispatchResultNotification({
    student,
    classInfo: student?.classId,
    examTitle: row.examTitle,
    examType: row.examType,
    month: row.month,
    totalMarks: row.totalMarks,
    outOf: row.outOf,
    action: "updated",
  });

  return formatResultRecord(saved);
}

export async function updateAdminResult(adminId, resultId, payload = {}) {
  normalizeEntityId(adminId, "admin ID");
  const normalizedResultId = normalizeEntityId(resultId, "result ID");
  const row = await Result.findById(normalizedResultId);
  if (!row) {
    throw new Error("Result not found");
  }

  const student = await assertStudentExists(row.studentId);
  const classSubjects = Array.isArray(student.classId?.subjects) ? student.classId.subjects : [];
  const examType = normalizeExamType(payload.examType ?? row.examType);
  const month = normalizeMonth(payload.month ?? row.month, examType);
  const autoExamTitle = buildDefaultExamTitle(examType, month);
  const examTitle = normalizeString(payload.examTitle) || autoExamTitle;
  const outOf = normalizeOutOf(payload.outOf ?? row.outOf);
  const subjectMarksPayload = Array.isArray(payload.subjectMarks) ? payload.subjectMarks : row.subjectMarks;
  const normalizedSubjectMarks = normalizeSubjectMarks(subjectMarksPayload, classSubjects, outOf);
  const subjectOrder = classSubjects.map((item) => normalizeString(item).toUpperCase());
  const orderedSubjectMarks = subjectOrder.map((subject) =>
    normalizedSubjectMarks.find((item) => item.subject === subject)
  );
  const totalMarks = orderedSubjectMarks.reduce((sum, item) => sum + Number(item?.marks || 0), 0);

  row.examType = examType;
  row.month = month;
  row.examTitle = examTitle;
  row.examKey = normalizeExamKey(`${examType}-${month || ""}-${examTitle}`);
  row.outOf = outOf;
  row.subjectMarks = orderedSubjectMarks;
  row.totalMarks = totalMarks;
  await row.save();

  const saved = await Result.findById(row._id)
    .populate("classId", "name section subjects")
    .populate("studentId", "name scholarNumber")
    .populate("sessionId", "name startDate endDate isActive")
    .lean();

  await dispatchResultNotification({
    student,
    classInfo: student?.classId,
    examTitle: row.examTitle,
    examType: row.examType,
    month: row.month,
    totalMarks: row.totalMarks,
    outOf: row.outOf,
    action: "updated",
  });

  return formatResultRecord(saved);
}

export async function getStudentResults(studentId) {
  normalizeEntityId(studentId, "student ID");

  const student = await Student.findById(studentId).select("_id");
  if (!student) {
    throw new Error("Student not found");
  }

  return loadResultsForStudent(studentId);
}

export async function getAdminStudentResults(studentId) {
  const normalizedStudentId = normalizeEntityId(studentId, "student ID");
  return getStudentResults(normalizedStudentId);
}
