import mongoose from "mongoose";
import Announcement from "../models/Announcement.model.js";
import ClassModel from "../models/Class.model.js";
import Student from "../models/Student.model.js";
import Teacher from "../models/Teacher.model.js";
import { sendPushNotificationToTokens } from "./notification.service.js";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeAnnouncementType(rawType) {
  const value = normalizeString(rawType).toLowerCase();
  if (["school_wide", "schoolwide", "wide", "all"].includes(value)) {
    return "school_wide";
  }
  if (["class_wise", "classwise", "class-wise", "class"].includes(value)) {
    return "class_wise";
  }
  return "";
}

function normalizeClassIds(input) {
  if (input === undefined || input === null) return [];

  const values = Array.isArray(input) ? input : [input];
  const normalized = [...new Set(values.map((item) => normalizeString(item)).filter(Boolean))];
  return normalized;
}

function getValidFcmTokenQuery() {
  return { $exists: true, $nin: [null, ""] };
}

function buildPagination(query = {}, defaults = { page: 1, limit: 10, maxLimit: 100 }) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
  const limit = Math.max(
    1,
    Math.min(defaults.maxLimit, parseInt(query.limit, 10) || defaults.limit)
  );
  return { page, limit, skip: (page - 1) * limit };
}

async function validateClassIds(classIds = []) {
  for (const classId of classIds) {
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      throw new Error(`Invalid class ID: ${classId}`);
    }
  }

  if (classIds.length === 0) return [];

  const rows = await ClassModel.find({ _id: { $in: classIds } }).select("_id name section").lean();
  if (rows.length !== classIds.length) {
    throw new Error("One or more class IDs were not found");
  }

  return rows;
}

async function getTeacherAssignedClassIds(teacherId) {
  const teacher = await Teacher.findById(teacherId)
    .select("classTeacherOf lectureAssignments.classId")
    .lean();

  if (!teacher) {
    throw new Error("Teacher not found");
  }

  const classIds = new Set();
  if (teacher.classTeacherOf) {
    classIds.add(String(teacher.classTeacherOf));
  }

  for (const assignment of teacher.lectureAssignments || []) {
    if (assignment.classId) {
      classIds.add(String(assignment.classId));
    }
  }

  return [...classIds];
}

async function getSchoolWideRecipientTokens() {
  const [students, teachers] = await Promise.all([
    Student.find({
      status: "active",
      fcmToken: getValidFcmTokenQuery(),
    })
      .select("fcmToken")
      .lean(),
    Teacher.find({
      status: "active",
      fcmToken: getValidFcmTokenQuery(),
    })
      .select("fcmToken")
      .lean(),
  ]);

  return [...students, ...teachers].map((item) => item.fcmToken);
}

async function getClassWiseRecipientTokens(classIds = []) {
  const [students, teachers] = await Promise.all([
    Student.find({
      status: "active",
      classId: { $in: classIds },
      fcmToken: getValidFcmTokenQuery(),
    })
      .select("fcmToken")
      .lean(),
    Teacher.find({
      status: "active",
      fcmToken: getValidFcmTokenQuery(),
      $or: [{ classTeacherOf: { $in: classIds } }, { "lectureAssignments.classId": { $in: classIds } }],
    })
      .select("fcmToken")
      .lean(),
  ]);

  return [...students, ...teachers].map((item) => item.fcmToken);
}

async function dispatchAnnouncementNotification(announcement) {
  const isSchoolWide = announcement.announcementType === "school_wide";
  const classIds = (announcement.classIds || []).map((item) => String(item));

  const recipientTokens = isSchoolWide
    ? await getSchoolWideRecipientTokens()
    : await getClassWiseRecipientTokens(classIds);

  const delivery = await sendPushNotificationToTokens(recipientTokens, {
    title: announcement.title,
    body: announcement.description,
    data: {
      announcementId: String(announcement._id),
      announcementType: announcement.announcementType,
      createdByRole: announcement.createdByRole,
      createdByName: announcement.createdByName,
    },
  });

  const invalidTokens = Array.isArray(delivery.invalidTokens) ? delivery.invalidTokens : [];
  if (invalidTokens.length > 0) {
    await Promise.all([
      Student.updateMany({ fcmToken: { $in: invalidTokens } }, { $set: { fcmToken: null } }),
      Teacher.updateMany({ fcmToken: { $in: invalidTokens } }, { $set: { fcmToken: null } }),
    ]);
  }

  announcement.delivery = {
    attempted: delivery.attempted || 0,
    success: delivery.success || 0,
    failure: delivery.failure || 0,
    lastAttemptAt: new Date(),
  };
  await announcement.save();

  console.log(
    `Announcement delivery | id=${announcement._id} attempted=${delivery.attempted || 0} success=${delivery.success || 0} failure=${delivery.failure || 0}`
  );
  if (invalidTokens.length > 0) {
    console.warn(`Announcement delivery | removed invalid tokens=${invalidTokens.length}`);
  }
  if (Array.isArray(delivery.failureDetails) && delivery.failureDetails.length > 0) {
    console.warn("Announcement delivery failures:", delivery.failureDetails);
  }

  return delivery;
}

function buildAnnouncementFilterForStudent(classId) {
  return {
    $or: [
      { announcementType: "school_wide" },
      {
        announcementType: "class_wise",
        classIds: classId,
      },
    ],
  };
}

function buildAnnouncementFilterForTeacher(classIds = []) {
  const clauses = [{ announcementType: "school_wide" }];
  if (classIds.length > 0) {
    clauses.push({
      announcementType: "class_wise",
      classIds: { $in: classIds },
    });
  }

  return { $or: clauses };
}

export async function createAdminAnnouncement(payload = {}, adminUser = {}) {
  const title = normalizeString(payload.title);
  const description = normalizeString(payload.description);
  const announcementType = normalizeAnnouncementType(
    payload.announcementType || payload.type || payload.audienceType
  );
  const classIds = normalizeClassIds(payload.classIds || payload.classId);

  if (!title) throw new Error("Title is required");
  if (!description) throw new Error("Description is required");
  if (!announcementType) {
    throw new Error("announcementType must be school_wide or class_wise");
  }

  if (announcementType === "class_wise" && classIds.length === 0) {
    throw new Error("At least one class ID is required for class-wise announcement");
  }

  if (announcementType === "class_wise") {
    await validateClassIds(classIds);
  }

  const announcement = await Announcement.create({
    title,
    description,
    announcementType,
    classIds: announcementType === "class_wise" ? classIds : [],
    createdById: adminUser._id,
    createdByRole: "admin",
    createdByName: normalizeString(adminUser.name || "Principal"),
  });

  const delivery = await dispatchAnnouncementNotification(announcement);
  const populated = await Announcement.findById(announcement._id)
    .populate("classIds", "name section")
    .lean();

  return { announcement: populated, delivery };
}

export async function createTeacherAnnouncement(payload = {}, teacherUser = {}) {
  const title = normalizeString(payload.title);
  const description = normalizeString(payload.description);
  const classIds = normalizeClassIds(payload.classIds || payload.classId);

  if (!title) throw new Error("Title is required");
  if (!description) throw new Error("Description is required");
  if (classIds.length === 0) {
    throw new Error("At least one class ID is required");
  }

  await validateClassIds(classIds);

  const allowedClassIds = await getTeacherAssignedClassIds(teacherUser._id);
  const unauthorizedClass = classIds.find((classId) => !allowedClassIds.includes(classId));
  if (unauthorizedClass) {
    throw new Error("You can announce only for your assigned classes");
  }

  const announcement = await Announcement.create({
    title,
    description,
    announcementType: "class_wise",
    classIds,
    createdById: teacherUser._id,
    createdByRole: "teacher",
    createdByName: normalizeString(teacherUser.name || "Teacher"),
  });

  const delivery = await dispatchAnnouncementNotification(announcement);
  const populated = await Announcement.findById(announcement._id)
    .populate("classIds", "name section")
    .lean();

  return { announcement: populated, delivery };
}

export async function getAllAnnouncementsForAdmin(query = {}) {
  const { page, limit, skip } = buildPagination(query);
  const typeFilter = normalizeAnnouncementType(query.type || query.announcementType);
  const creatorRole = normalizeString(query.createdByRole).toLowerCase();

  const filter = {};
  if (typeFilter) {
    filter.announcementType = typeFilter;
  }
  if (["admin", "teacher"].includes(creatorRole)) {
    filter.createdByRole = creatorRole;
  }

  const [rows, total] = await Promise.all([
    Announcement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("classIds", "name section")
      .lean(),
    Announcement.countDocuments(filter),
  ]);

  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  };
}

export async function getMyAnnouncements(user = {}, query = {}) {
  const { page, limit, skip } = buildPagination(query);
  const role = normalizeString(user.role).toLowerCase();

  let filter = {};
  if (role === "student") {
    const student = await Student.findById(user._id).select("classId status").lean();
    if (!student) throw new Error("Student not found");
    if (student.status !== "active") throw new Error("Account inactive");
    filter = buildAnnouncementFilterForStudent(student.classId);
  } else if (role === "teacher") {
    const teacher = await Teacher.findById(user._id)
      .select("status classTeacherOf lectureAssignments.classId")
      .lean();
    if (!teacher) throw new Error("Teacher not found");
    if (teacher.status !== "active") throw new Error("Account inactive");

    const classIds = new Set();
    if (teacher.classTeacherOf) classIds.add(String(teacher.classTeacherOf));
    for (const assignment of teacher.lectureAssignments || []) {
      if (assignment.classId) classIds.add(String(assignment.classId));
    }

    filter = buildAnnouncementFilterForTeacher([...classIds]);
  } else if (role === "admin") {
    filter = {};
  } else {
    throw new Error("Unsupported role");
  }

  const [rows, total] = await Promise.all([
    Announcement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("classIds", "name section")
      .lean(),
    Announcement.countDocuments(filter),
  ]);

  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  };
}
