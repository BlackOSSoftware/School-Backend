import Session from "../models/Session.model.js";
import mongoose from "mongoose";
import { deleteCacheByPattern, getCache, setCache } from "../config/redis.js";

async function invalidateSessionCache() {
  await deleteCacheByPattern("sessions:*");
  await deleteCacheByPattern("students:*");
  await deleteCacheByPattern("teachers:*");
}

export async function createSession(payload) {
  const { name, startDate, endDate, isActive } = payload;

  if (!name || !startDate || !endDate) {
    throw new Error("All fields are required");
  }

  // If new session is active → deactivate previous one
  if (isActive) {
    await Session.updateMany({ isActive: true }, { isActive: false });
  }

  const session = await Session.create({
    name,
    startDate,
    endDate,
    isActive: !!isActive,
  });

  await invalidateSessionCache();
  return session;
}

/* ---------------------------------------
   GET ALL SESSIONS (Pagination Enabled)
--------------------------------------- */
export async function getAllSessions(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;
  const search = String(query.search || "").trim();

  const cacheKey = `sessions:list:page=${page}:limit=${limit}:search=${search}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = search ? { name: { $regex: search, $options: "i" } } : {};

  const [sessions, total] = await Promise.all([
    Session.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Session.countDocuments(filter),
  ]);

  const result = {
    data: sessions,
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

/* ---------------------------------------
   GET ACTIVE SESSION
--------------------------------------- */
export async function getActiveSession() {
  const cacheKey = "sessions:active";
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const row = await Session.findOne({ isActive: true }).lean();
  await setCache(cacheKey, JSON.stringify(row), 120);
  return row;
}

/* ---------------------------------------
   UPDATE SESSION
--------------------------------------- */
export async function updateSession(id, payload) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid session ID");
  }

  const existing = await Session.findById(id);
  if (!existing) {
    throw new Error("Session not found");
  }

  // If activating new session → deactivate others
  if (payload.isActive === true) {
    await Session.updateMany(
      { _id: { $ne: id }, isActive: true },
      { isActive: false }
    );
  }

  const updated = await Session.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });

  await invalidateSessionCache();
  return updated;
}
