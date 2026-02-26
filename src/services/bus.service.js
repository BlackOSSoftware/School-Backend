import mongoose from "mongoose";
import Bus from "../models/Bus.model.js";
import { deleteCacheByPattern, getCache, setCache } from "../config/redis.js";

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

function resolveTrackingUsername(payload = {}) {
  return normalizeString(
    payload.trackingUsername ?? payload.trackingId ?? payload.username ?? payload.id
  );
}

function resolveTrackingPassword(payload = {}) {
  return normalizeString(payload.trackingPassword ?? payload.password);
}

async function invalidateBusCache() {
  await deleteCacheByPattern("buses:*");
  await deleteCacheByPattern("students:*");
}

export async function createBus(payload = {}) {
  const busNumber = normalizeString(payload.busNumber);
  const trackingUsername = resolveTrackingUsername(payload);
  const trackingPassword = resolveTrackingPassword(payload);

  if (!busNumber) throw new Error("Bus number is required");
  if (!trackingUsername) throw new Error("Tracking username is required");
  if (!trackingPassword) throw new Error("Tracking password is required");

  try {
    const created = await Bus.create({
      busNumber,
      trackingUsername,
      trackingPassword,
    });

    await invalidateBusCache();
    return created;
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.busNumber) {
      throw new Error("Bus number already exists");
    }
    throw error;
  }
}

export async function getAllBuses(query = {}) {
  const { page, limit, skip } = buildPagination(query);
  const search = normalizeString(query.search);

  const cacheKey = `buses:list:page=${page}:limit=${limit}:search=${search}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = search
    ? {
        $or: [
          { busNumber: { $regex: search, $options: "i" } },
          { trackingUsername: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    Bus.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Bus.countDocuments(filter),
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

export async function getBusById(busId) {
  if (!mongoose.Types.ObjectId.isValid(busId)) {
    throw new Error("Invalid bus ID");
  }

  const cacheKey = `buses:detail:${busId}`;
  const cached = await getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  const row = await Bus.findById(busId).lean();
  if (!row) throw new Error("Bus not found");

  await setCache(cacheKey, JSON.stringify(row), 180);
  return row;
}

export async function updateBus(busId, payload = {}) {
  if (!mongoose.Types.ObjectId.isValid(busId)) {
    throw new Error("Invalid bus ID");
  }

  const existing = await Bus.findById(busId);
  if (!existing) throw new Error("Bus not found");

  const busNumber =
    payload.busNumber !== undefined ? normalizeString(payload.busNumber) : existing.busNumber;
  const trackingUsername =
    payload.trackingUsername !== undefined ||
    payload.trackingId !== undefined ||
    payload.username !== undefined ||
    payload.id !== undefined
      ? resolveTrackingUsername(payload)
      : existing.trackingUsername;
  const trackingPassword =
    payload.trackingPassword !== undefined || payload.password !== undefined
      ? resolveTrackingPassword(payload)
      : existing.trackingPassword;

  if (!busNumber) throw new Error("Bus number is required");
  if (!trackingUsername) throw new Error("Tracking username is required");
  if (!trackingPassword) throw new Error("Tracking password is required");

  existing.busNumber = busNumber;
  existing.trackingUsername = trackingUsername;
  existing.trackingPassword = trackingPassword;

  try {
    const updated = await existing.save();
    await invalidateBusCache();
    return updated;
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.busNumber) {
      throw new Error("Bus number already exists");
    }
    throw error;
  }
}
