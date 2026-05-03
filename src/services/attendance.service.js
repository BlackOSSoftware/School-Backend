import mongoose from "mongoose";
import Attendance from "../models/Attendance.model.js";
import Teacher from "../models/Teacher.model.js";
import Student from "../models/Student.model.js";
import ClassModel from "../models/Class.model.js";
import Session from "../models/Session.model.js";
import User from "../models/User.model.js";
import AppSetting from "../models/AppSetting.model.js";
import { sendPushNotificationToTokens } from "./notification.service.js";

function normalizeString(value) {
  return String(value || "").trim();
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function toUtcDateKey(dateValue = new Date()) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyToUtcDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function getTodayUtcDateKey() {
  return toUtcDateKey(new Date());
}

function toLocalDateKey(dateValue = new Date()) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayLocalDateKey() {
  return toLocalDateKey(new Date());
}

function parseDateInputOrToday(rawDate) {
  const value = normalizeString(rawDate);
  const dateKey = value || getTodayLocalDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("date must be in YYYY-MM-DD format");
  }
  return dateKey;
}

function parseDateRange(query = {}) {
  const from = normalizeString(query.from);
  const to = normalizeString(query.to);

  const fromKey = from || null;
  const toKey = to || null;

  if (fromKey && !/^\d{4}-\d{2}-\d{2}$/.test(fromKey)) {
    throw new Error("from must be in YYYY-MM-DD format");
  }

  if (toKey && !/^\d{4}-\d{2}-\d{2}$/.test(toKey)) {
    throw new Error("to must be in YYYY-MM-DD format");
  }

  if (fromKey && toKey && fromKey > toKey) {
    throw new Error("from cannot be greater than to");
  }

  return { fromKey, toKey };
}

function calculatePercentage(present, total) {
  if (!total) return 0;
  return Number(((present / total) * 100).toFixed(2));
}

async function getGlobalAppSetting() {
  return AppSetting.findOneAndUpdate(
    { key: "global" },
    {
      $setOnInsert: {
        key: "global",
        teacherPastAttendanceEnabled: false,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
}

async function isTeacherPastAttendanceEnabled() {
  const settings = await getGlobalAppSetting();
  return Boolean(settings?.teacherPastAttendanceEnabled);
}

async function getClassOrThrow(classId) {
  if (!isValidObjectId(classId)) {
    throw new Error("Invalid class ID");
  }

  const row = await ClassModel.findById(classId).lean();
  if (!row) throw new Error("Class not found");
  return row;
}

async function getTeacherClassAuthOrThrow(teacherId, classId) {
  if (!isValidObjectId(teacherId)) {
    throw new Error("Invalid teacher ID");
  }

  const teacher = await Teacher.findById(teacherId).select("_id name classTeacherOf status").lean();
  if (!teacher) throw new Error("Teacher not found");
  if (teacher.status !== "active") throw new Error("Account inactive");

  if (String(teacher.classTeacherOf) !== String(classId)) {
    throw new Error("You can only manage attendance for your class");
  }

  return teacher;
}

async function getSessionByDateKeyOrThrow(dateKey) {
  const session = await getSessionByDateKey(dateKey);
  if (!session) {
    throw new Error("No academic session found for selected date");
  }
  return session;
}

async function getSessionByDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("date must be in YYYY-MM-DD format");
  }

  const date = dateKeyToUtcDate(dateKey);
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);

  return Session.findOne({
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart },
  })
    .sort({ startDate: -1 })
    .lean();
}

async function getActiveSession() {
  return Session.findOne({ isActive: true }).lean();
}

async function resolveSessionForClassAttendance(dateKey) {
  const todayKey = getTodayLocalDateKey();
  const [activeSession, sessionByDate] = await Promise.all([
    getActiveSession(),
    getSessionByDateKey(dateKey),
  ]);

  if (dateKey === todayKey && activeSession?._id) {
    return activeSession;
  }

  if (sessionByDate?._id) {
    return sessionByDate;
  }

  if (activeSession?._id) {
    return activeSession;
  }

  throw new Error("No academic session found for selected date");
}

async function resolveSummarySessionOrThrow(query = {}, dateKey) {
  const requestedSessionId = normalizeString(query.sessionId);

  if (requestedSessionId) {
    if (!isValidObjectId(requestedSessionId)) {
      throw new Error("Invalid session ID");
    }
    const row = await Session.findById(requestedSessionId).lean();
    if (!row) throw new Error("Session not found");
    return row;
  }

  const activeSession = await getActiveSession();
  if (activeSession?._id) {
    return activeSession;
  }

  return getSessionByDateKeyOrThrow(dateKey);
}

async function getStudentsByClassSession(classId, sessionId) {
  return Student.find({
    classId,
    sessionId,
    status: "active",
  })
    .select("_id name scholarNumber classId sessionId fcmToken")
    .sort({ name: 1 })
    .lean();
}

function buildClassAttendanceResponse(classRow, attendanceDoc, students) {
  const records = attendanceDoc?.records || [];
  const presentStudents = records.filter((item) => item.status === "present");
  const absentStudents = records.filter((item) => item.status === "absent");
  const statusByStudentId = new Map(records.map((item) => [String(item.studentId), item.status]));
  const allStudents = students.map((student) => ({
    studentId: student._id,
    studentName: student.name,
    scholarNumber: student.scholarNumber,
    status: statusByStudentId.get(String(student._id)) || "not_marked",
  }));

  const totalStudents = students.length || records.length;
  const presentCount = presentStudents.length;
  const absentCount = absentStudents.length;

  return {
    class: {
      id: classRow._id,
      name: classRow.name,
      section: classRow.section,
    },
    attendanceTaken: Boolean(attendanceDoc),
    date: attendanceDoc?.dateKey || null,
    presentCount,
    absentCount,
    totalStudents,
    presentPercentage: calculatePercentage(presentCount, totalStudents),
    presentStudents,
    absentStudents,
    allStudents,
  };
}

function resolveStatusMap(students, payload = {}) {
  const attendanceArray = Array.isArray(payload.attendance) ? payload.attendance : [];
  const presentStudentIds = Array.isArray(payload.presentStudentIds)
    ? payload.presentStudentIds.map((item) => normalizeString(item))
    : [];

  if (attendanceArray.length === 0 && presentStudentIds.length === 0) {
    throw new Error("Provide attendance array or presentStudentIds");
  }

  const studentMap = new Map(students.map((row) => [String(row._id), row]));
  const statusMap = new Map(students.map((row) => [String(row._id), "absent"]));

  for (const studentId of presentStudentIds) {
    if (!studentMap.has(studentId)) {
      throw new Error(`Student ${studentId} does not belong to this class`);
    }
    statusMap.set(studentId, "present");
  }

  for (const item of attendanceArray) {
    const studentId = normalizeString(item.studentId);
    const status = normalizeString(item.status).toLowerCase();

    if (!studentMap.has(studentId)) {
      throw new Error(`Student ${studentId} does not belong to this class`);
    }
    if (!["present", "absent"].includes(status)) {
      throw new Error("status must be present or absent");
    }

    statusMap.set(studentId, status);
  }

  return students.map((student) => ({
    studentId: student._id,
    studentName: student.name,
    scholarNumber: student.scholarNumber,
    status: statusMap.get(String(student._id)) || "absent",
  }));
}

function buildAttendanceRangeFilter(fromKey, toKey) {
  if (!fromKey && !toKey) return {};

  if (fromKey && toKey) {
    return { dateKey: { $gte: fromKey, $lte: toKey } };
  }

  if (fromKey) {
    return { dateKey: { $gte: fromKey } };
  }

  return { dateKey: { $lte: toKey } };
}

async function dispatchAttendanceNotifications({ classRow, dateKey, records, students }) {
  const tokenEntries = records
    .map((record) => {
      const student = students.find((item) => String(item._id) === String(record.studentId));
      const token = normalizeString(student?.fcmToken);
      if (!token) return null;
      return {
        token,
        status: record.status,
      };
    })
    .filter(Boolean);

  if (!tokenEntries.length) {
    return;
  }

  const presentTokens = [...new Set(tokenEntries.filter((item) => item.status === "present").map((item) => item.token))];
  const absentTokens = [...new Set(tokenEntries.filter((item) => item.status === "absent").map((item) => item.token))];

  const commonData = {
    type: "attendance_marked",
    classId: String(classRow?._id || ""),
    className: String(classRow?.name || ""),
    classSection: String(classRow?.section || ""),
    date: String(dateKey || ""),
  };

  const [presentDelivery, absentDelivery] = await Promise.all([
    presentTokens.length
      ? sendPushNotificationToTokens(presentTokens, {
        title: "Attendance Marked",
        body: `Marked Present for ${classRow?.name || "class"} ${classRow?.section || ""} on ${dateKey}.`,
        data: { ...commonData, attendanceStatus: "present" },
      })
      : Promise.resolve(null),
    absentTokens.length
      ? sendPushNotificationToTokens(absentTokens, {
        title: "Attendance Marked",
        body: `Marked Absent for ${classRow?.name || "class"} ${classRow?.section || ""} on ${dateKey}.`,
        data: { ...commonData, attendanceStatus: "absent" },
      })
      : Promise.resolve(null),
  ]);

  const invalidTokens = [
    ...(Array.isArray(presentDelivery?.invalidTokens) ? presentDelivery.invalidTokens : []),
    ...(Array.isArray(absentDelivery?.invalidTokens) ? absentDelivery.invalidTokens : []),
  ];

  if (invalidTokens.length > 0) {
    await Student.updateMany({ fcmToken: { $in: invalidTokens } }, { $set: { fcmToken: null } });
  }
}

async function resolveReportDateRange(query = {}) {
  const { fromKey, toKey } = parseDateRange(query);

  if (fromKey || toKey) {
    return { fromKey, toKey };
  }

  const todayKey = getTodayUtcDateKey();
  const session = await getSessionByDateKeyOrThrow(todayKey);

  return {
    fromKey: toUtcDateKey(session.startDate),
    toKey: toUtcDateKey(session.endDate),
  };
}

export async function markMyClassAttendance(teacherId, classId, payload = {}) {
  const teacher = await getTeacherClassAuthOrThrow(teacherId, classId);
  const classRow = await getClassOrThrow(classId);

  const dateKey = parseDateInputOrToday(payload.date);
  const todayKey = getTodayLocalDateKey();
  const canEditPastDates = await isTeacherPastAttendanceEnabled();

  if (dateKey > todayKey) {
    throw new Error(`Attendance cannot be marked for future dates. Today is ${todayKey}`);
  }

  if (dateKey < todayKey && !canEditPastDates) {
    throw new Error("Past date attendance is locked by admin settings");
  }

  const session = await resolveSessionForClassAttendance(dateKey);
  const students = await getStudentsByClassSession(classId, session._id);

  if (students.length === 0) {
    throw new Error("No active students found in this class for the selected session");
  }

  const records = resolveStatusMap(students, payload);

  const attendance = await Attendance.findOneAndUpdate(
    {
      classId,
      sessionId: session._id,
      dateKey,
    },
    {
      $set: {
        classId,
        sessionId: session._id,
        date: dateKeyToUtcDate(dateKey),
        dateKey,
        markedBy: teacherId,
        markedByModel: "Teacher",
        markedByRole: "teacher",
        markedByName: teacher?.name || "",
        records,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  await dispatchAttendanceNotifications({ classRow, dateKey, records, students });

  return buildClassAttendanceResponse(classRow, attendance, students);
}

export async function getTeacherAttendancePolicy() {
  const settings = await getGlobalAppSetting();

  return {
    canMarkPastDates: Boolean(settings?.teacherPastAttendanceEnabled),
    updatedAt: settings?.updatedAt || null,
    updatedByName: String(settings?.teacherPastAttendanceUpdatedByName || "").trim(),
  };
}

export async function updateTeacherAttendancePolicy(adminId, payload = {}) {
  const admin = await User.findById(adminId).select("_id name role status").lean();
  if (!admin) {
    throw new Error("Admin not found");
  }
  if (admin.role !== "admin") {
    throw new Error("Admin access only");
  }
  if (admin.status !== "active") {
    throw new Error("Account inactive");
  }

  if (typeof payload?.canMarkPastDates !== "boolean") {
    throw new Error("canMarkPastDates must be true or false");
  }

  const settings = await AppSetting.findOneAndUpdate(
    { key: "global" },
    {
      $set: {
        teacherPastAttendanceEnabled: payload.canMarkPastDates,
        teacherPastAttendanceUpdatedBy: admin._id,
        teacherPastAttendanceUpdatedByName: admin.name || "Admin",
      },
      $setOnInsert: {
        key: "global",
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  return {
    canMarkPastDates: Boolean(settings?.teacherPastAttendanceEnabled),
    updatedAt: settings?.updatedAt || null,
    updatedByName: String(settings?.teacherPastAttendanceUpdatedByName || "").trim(),
  };
}

export async function getMyClassAttendanceByDate(teacherId, classId, query = {}) {
  await getTeacherClassAuthOrThrow(teacherId, classId);
  const classRow = await getClassOrThrow(classId);

  const dateKey = parseDateInputOrToday(query.date);
  const session = await resolveSessionForClassAttendance(dateKey);

  const [attendance, students] = await Promise.all([
    Attendance.findOne({ classId, sessionId: session._id, dateKey }).lean(),
    getStudentsByClassSession(classId, session._id),
  ]);

  return buildClassAttendanceResponse(classRow, attendance, students);
}

export async function getMyStudentAttendanceReport(teacherId, classId, studentId, query = {}) {
  await getTeacherClassAuthOrThrow(teacherId, classId);
  await getClassOrThrow(classId);

  if (!isValidObjectId(studentId)) {
    throw new Error("Invalid student ID");
  }

  const student = await Student.findById(studentId)
    .select("_id name scholarNumber classId sessionId status")
    .lean();

  if (!student) throw new Error("Student not found");
  if (String(student.classId) !== String(classId)) {
    throw new Error("Student does not belong to this class");
  }

  const { fromKey, toKey } = await resolveReportDateRange(query);
  const dateFilter = buildAttendanceRangeFilter(fromKey, toKey);

  const attendanceDocs = await Attendance.find({
    classId,
    ...dateFilter,
  })
    .select("dateKey records")
    .sort({ dateKey: 1 })
    .lean();

  const daily = attendanceDocs.map((doc) => {
    const studentRecord = (doc.records || []).find(
      (item) => String(item.studentId) === String(student._id)
    );

    return {
      date: doc.dateKey,
      status: studentRecord?.status || "absent",
    };
  });

  const totalDays = daily.length;
  const presentDays = daily.filter((item) => item.status === "present").length;
  const absentDays = totalDays - presentDays;

  return {
    student: {
      id: student._id,
      name: student.name,
      scholarNumber: student.scholarNumber,
      classId: student.classId,
      sessionId: student.sessionId,
    },
    from: fromKey,
    to: toKey,
    totalDays,
    presentDays,
    absentDays,
    presentPercentage: calculatePercentage(presentDays, totalDays),
    daily,
  };
}

export async function getAdminAttendanceDateSummary(query = {}) {
  const dateKey = parseDateInputOrToday(query.date);
  const session = await resolveSummarySessionOrThrow(query, dateKey);

  const [classes, attendanceDocs, studentCounts] = await Promise.all([
    ClassModel.find({}).select("_id name section").sort({ name: 1, section: 1 }).lean(),
    Attendance.find({ sessionId: session._id, dateKey }).select("classId records dateKey").lean(),
    Student.aggregate([
      {
        $match: {
          sessionId: new mongoose.Types.ObjectId(String(session._id)),
          status: "active",
        },
      },
      {
        $group: {
          _id: "$classId",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const attendanceMap = new Map(attendanceDocs.map((doc) => [String(doc.classId), doc]));
  const studentCountMap = new Map(studentCounts.map((item) => [String(item._id), item.count]));

  const rows = classes.map((classRow) => {
    const attendance = attendanceMap.get(String(classRow._id));
    const totalStudents = studentCountMap.get(String(classRow._id)) || 0;
    const presentCount = attendance
      ? (attendance.records || []).filter((item) => item.status === "present").length
      : 0;
    const absentCount = attendance
      ? (attendance.records || []).filter((item) => item.status === "absent").length
      : 0;

    return {
      class: {
        id: classRow._id,
        name: classRow.name,
        section: classRow.section,
      },
      attendanceTaken: Boolean(attendance),
      date: dateKey,
      totalStudents,
      presentCount,
      absentCount,
      presentPercentage: calculatePercentage(presentCount, totalStudents),
    };
  });

  return {
    date: dateKey,
    session: {
      id: session._id,
      name: session.name,
      startDate: session.startDate,
      endDate: session.endDate,
    },
    data: rows,
  };
}

export async function getAdminDashboardSummary(query = {}) {
  const requestedDate = normalizeString(query.date);
  const todayKey = getTodayLocalDateKey();

  if (requestedDate && requestedDate !== todayKey) {
    throw new Error(`Dashboard summary is only available for today (${todayKey})`);
  }

  const dateKey = todayKey;
  const session = await resolveSummarySessionOrThrow(query, dateKey);

  const [totalStudents, totalTeachers, totalClasses, attendanceDocs] = await Promise.all([
    Student.countDocuments({ status: "active", sessionId: session._id }),
    Teacher.countDocuments({ status: "active" }),
    ClassModel.countDocuments({}),
    Attendance.find({ sessionId: session._id, dateKey }).select("records").lean(),
  ]);

  const presentCount = attendanceDocs.reduce((sum, doc) => {
    const presentInClass = (doc.records || []).filter((item) => item.status === "present").length;
    return sum + presentInClass;
  }, 0);

  const absentCount = attendanceDocs.reduce((sum, doc) => {
    const absentInClass = (doc.records || []).filter((item) => item.status === "absent").length;
    return sum + absentInClass;
  }, 0);

  return {
    totalStudents,
    totalTeachers,
    totalClasses,
    todayAttendance: {
      date: dateKey,
      attendanceTaken: attendanceDocs.length > 0,
      presentCount,
      absentCount,
      totalStudents,
      presentPercentage: calculatePercentage(presentCount, totalStudents),
    },
  };
}

export async function getAdminClassAttendanceByDate(classId, query = {}) {
  const classRow = await getClassOrThrow(classId);
  const dateKey = parseDateInputOrToday(query.date);
  // Keep admin class detail aligned with admin date-summary session selection.
  // Otherwise summary can show counts while detail resolves another session and returns 0/0/0.
  const session = await resolveSummarySessionOrThrow(query, dateKey);

  let [attendance, students] = await Promise.all([
    Attendance.findOne({ classId, sessionId: session._id, dateKey }).lean(),
    getStudentsByClassSession(classId, session._id),
  ]);

  // Safety fallback:
  // In some environments class summary can reflect attendance from a different
  // resolved session for the same date. If that happens, return the most recent
  // attendance for this class/date so admin modal still shows actual student list.
  if (!attendance) {
    const fallbackAttendance = await Attendance.findOne({ classId, dateKey })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (fallbackAttendance) {
      attendance = fallbackAttendance;
      students = await getStudentsByClassSession(classId, fallbackAttendance.sessionId);
    }
  }

  return buildClassAttendanceResponse(classRow, attendance, students);
}

export async function updateAdminStudentAttendanceByDate(adminId, classId, studentId, payload = {}) {
  await getClassOrThrow(classId);

  if (!isValidObjectId(studentId)) {
    throw new Error("Invalid student ID");
  }

  const dateKey = parseDateInputOrToday(payload.date);
  const requestedStatus = normalizeString(payload.status).toLowerCase();
  if (!["present", "absent"].includes(requestedStatus)) {
    throw new Error("status must be present or absent");
  }

  const session = await resolveSessionForClassAttendance(dateKey);
  const students = await getStudentsByClassSession(classId, session._id);
  if (!students.length) {
    throw new Error("No active students found in this class for selected session");
  }

  const targetStudent = students.find((item) => String(item._id) === String(studentId));
  if (!targetStudent) {
    throw new Error("Student does not belong to this class for selected session");
  }

  const admin = await User.findById(adminId).select("_id name").lean();
  if (!admin) {
    throw new Error("Admin not found");
  }

  const existing = await Attendance.findOne({
    classId,
    sessionId: session._id,
    dateKey,
  }).lean();

  const statusMap = new Map(
    (existing?.records || []).map((item) => [String(item.studentId), item.status])
  );
  statusMap.set(String(targetStudent._id), requestedStatus);

  const records = students.map((student) => ({
    studentId: student._id,
    studentName: student.name,
    scholarNumber: student.scholarNumber,
    status: statusMap.get(String(student._id)) || "absent",
  }));

  const attendance = await Attendance.findOneAndUpdate(
    {
      classId,
      sessionId: session._id,
      dateKey,
    },
    {
      $set: {
        classId,
        sessionId: session._id,
        date: dateKeyToUtcDate(dateKey),
        dateKey,
        markedBy: admin._id,
        markedByModel: "User",
        markedByRole: "admin",
        markedByName: admin.name || "Admin",
        records,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  const classRow = await getClassOrThrow(classId);
  return buildClassAttendanceResponse(classRow, attendance, students);
}

export async function getAdminStudentAttendanceReport(classId, studentId, query = {}) {
  await getClassOrThrow(classId);

  if (!isValidObjectId(studentId)) {
    throw new Error("Invalid student ID");
  }

  const student = await Student.findById(studentId)
    .select("_id name scholarNumber classId sessionId status")
    .lean();

  if (!student) throw new Error("Student not found");
  if (String(student.classId) !== String(classId)) {
    throw new Error("Student does not belong to this class");
  }

  const requestedSessionId = normalizeString(query.sessionId);
  let sessionFilter = {};
  if (requestedSessionId) {
    if (!isValidObjectId(requestedSessionId)) {
      throw new Error("Invalid session ID");
    }
    sessionFilter = { sessionId: new mongoose.Types.ObjectId(requestedSessionId) };
  }

  const { fromKey, toKey } = await resolveReportDateRange(query);
  const dateFilter = buildAttendanceRangeFilter(fromKey, toKey);

  const attendanceDocs = await Attendance.find({
    classId,
    ...sessionFilter,
    ...dateFilter,
  })
    .select("dateKey records")
    .sort({ dateKey: 1 })
    .lean();

  const daily = attendanceDocs.map((doc) => {
    const studentRecord = (doc.records || []).find(
      (item) => String(item.studentId) === String(student._id)
    );

    return {
      date: doc.dateKey,
      status: studentRecord?.status || "absent",
    };
  });

  const totalDays = daily.length;
  const presentDays = daily.filter((item) => item.status === "present").length;
  const absentDays = totalDays - presentDays;

  return {
    student: {
      id: student._id,
      name: student.name,
      scholarNumber: student.scholarNumber,
      classId: student.classId,
      sessionId: student.sessionId,
    },
    from: fromKey,
    to: toKey,
    totalDays,
    presentDays,
    absentDays,
    presentPercentage: calculatePercentage(presentDays, totalDays),
    daily,
  };
}

export async function getStudentMyAttendanceReport(studentId, query = {}) {
  if (!isValidObjectId(studentId)) {
    throw new Error("Invalid student ID");
  }

  const student = await Student.findById(studentId)
    .select("_id name scholarNumber classId sessionId status")
    .lean();

  if (!student) throw new Error("Student not found");

  const { fromKey, toKey } = await resolveReportDateRange(query);
  const dateFilter = buildAttendanceRangeFilter(fromKey, toKey);

  const attendanceDocs = await Attendance.find({
    classId: student.classId,
    ...dateFilter,
  })
    .select("dateKey records")
    .sort({ dateKey: 1 })
    .lean();

  const daily = attendanceDocs.map((doc) => {
    const studentRecord = (doc.records || []).find(
      (item) => String(item.studentId) === String(student._id)
    );

    return {
      date: doc.dateKey,
      status: studentRecord?.status || "absent",
    };
  });

  const totalDays = daily.length;
  const presentDays = daily.filter((item) => item.status === "present").length;
  const absentDays = totalDays - presentDays;

  return {
    student: {
      id: student._id,
      name: student.name,
      scholarNumber: student.scholarNumber,
      classId: student.classId,
      sessionId: student.sessionId,
    },
    from: fromKey,
    to: toKey,
    totalDays,
    presentDays,
    absentDays,
    presentPercentage: calculatePercentage(presentDays, totalDays),
    daily,
  };
}
