import mongoose from "mongoose";
import ClassModel from "../models/Class.model.js";
import { deleteCacheByPattern, getCache, setCache } from "../config/redis.js";

function normalizeSubject(subject = "") {
  return String(subject || "").trim().toUpperCase();
}

function normalizeSubjects(subjects = []) {
  if (!Array.isArray(subjects)) return [];
  return [...new Set(subjects.map((item) => normalizeSubject(item)).filter(Boolean))];
}

async function invalidateClassCache() {
  await deleteCacheByPattern("classes:*");
  await deleteCacheByPattern("teachers:*");
  await deleteCacheByPattern("students:*");
}

export async function createClass(payload = {}, adminId) {
  const name = String(payload.name || "").trim();
  const rawSection = Array.isArray(payload.section) ? payload.section[0] : payload.section;
  const section = String(rawSection || "").trim().toUpperCase();
  const subjects = normalizeSubjects(payload.subjects);

  if (!name) throw new Error("Class name is required");
  if (!section) throw new Error("Section is required");
  if (subjects.length === 0) throw new Error("At least one subject is required");

  try {
    const created = await ClassModel.create({
      name,
      section,
      subjects,
      createdBy: adminId,
    });

    await invalidateClassCache();
    return created;
  } catch (error) {
    if (error.code === 11000) {
      throw new Error(`Class ${name} Section ${section} already exists`);
    }
    throw error;
  }
}

export async function getAllClasses(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 10));
  const search = String(query.search || "").trim();
  const skip = (page - 1) * limit;

  const cacheKey = `classes:list:page=${page}:limit=${limit}:search=${search}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const filter = search
    ? {
        name: { $regex: search, $options: "i" },
      }
    : {};

  const [rows, total] = await Promise.all([
    ClassModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ClassModel.countDocuments(filter),
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

export async function getClassById(classId) {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new Error("Invalid class ID");
  }

  const cacheKey = `classes:detail:${classId}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const row = await ClassModel.findById(classId).lean();
  if (!row) {
    throw new Error("Class not found");
  }

  await setCache(cacheKey, JSON.stringify(row), 180);
  return row;
}

export async function updateClass(classId, payload = {}) {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new Error("Invalid class ID");
  }

  const existing = await ClassModel.findById(classId);
  if (!existing) throw new Error("Class not found");

  const newName =
    payload.name !== undefined
      ? String(payload.name).trim()
      : existing.name;

  const newSection =
    payload.section !== undefined
      ? String(Array.isArray(payload.section) ? payload.section[0] : payload.section)
          .trim()
          .toUpperCase()
      : existing.section;
  const newSubjects =
    payload.subjects !== undefined
      ? normalizeSubjects(payload.subjects)
      : normalizeSubjects(existing.subjects);

  // 🔥 Check duplicate before updating
  const duplicate = await ClassModel.findOne({
    _id: { $ne: classId },
    name: newName,
    section: newSection,
  });

  if (duplicate) {
    throw new Error("This class & section combination already exists");
  }
  if (newSubjects.length === 0) {
    throw new Error("At least one subject is required");
  }

  const updated = await ClassModel.findByIdAndUpdate(
    classId,
    { name: newName, section: newSection, subjects: newSubjects },
    { new: true, runValidators: true }
  );

  await invalidateClassCache();
  return updated;
}

export async function deleteClass(classId) {
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw new Error("Invalid class ID");
  }

  const deleted = await ClassModel.findByIdAndDelete(classId);
  if (!deleted) {
    throw new Error("Class not found");
  }

  await invalidateClassCache();
  return deleted;
}
