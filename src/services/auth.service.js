import User from "../models/User.model.js";
import Teacher from "../models/Teacher.model.js";
import Student from "../models/Student.model.js";
import { generateAccessToken } from "../utils/jwt-utils.js";

function normalizeFcmToken(value) {
  return String(value || "").trim();
}

function getModelByRole(role) {
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === "teacher") return Teacher;
  if (normalizedRole === "student") return Student;
  if (normalizedRole === "admin") return User;
  return null;
}

async function releaseFcmTokenFromOtherAccounts(rawFcmToken, owner = {}) {
  const token = normalizeFcmToken(rawFcmToken);
  if (!token) return;

  const ownerId = owner.id;
  const ownerRole = String(owner.role || "").toLowerCase();

  const removeFromModel = async (Model, modelRole) => {
    const filter = { fcmToken: token };
    if (ownerId && ownerRole === modelRole) {
      filter._id = { $ne: ownerId };
    }
    await Model.updateMany(filter, { $set: { fcmToken: null } });
  };

  await Promise.all([
    removeFromModel(User, "admin"),
    removeFromModel(Teacher, "teacher"),
    removeFromModel(Student, "student"),
  ]);
}

async function saveFcmTokenOnLogin(user, rawFcmToken) {
  const role = String(user?.role || "").toLowerCase();
  const normalizedFcmToken = normalizeFcmToken(rawFcmToken);
  const requiresFcmToken = ["teacher", "student"].includes(role);

  if (requiresFcmToken && !normalizedFcmToken) {
    throw new Error("fcmToken is required for teacher and student login");
  }

  await releaseFcmTokenFromOtherAccounts(normalizedFcmToken, { id: user?._id, role });

  if (normalizedFcmToken && user.fcmToken !== normalizedFcmToken) {
    user.fcmToken = normalizedFcmToken;
    await user.save();
  }
}

export async function loginUser(payload = {}) {
  const { email, scholarNumber, password, fcmToken } = payload;

  if (!password) {
    throw new Error("Password required");
  }

  let user;

  if (email) {
    user = await User.findOne({ email }).select("+password");
    if (!user) {
      user = await Teacher.findOne({ email }).select("+password");
    }
  } else if (scholarNumber) {
    user = await Student.findOne({ scholarNumber }).select("+password");
  } else {
    throw new Error("Email or Scholar Number required");
  }

  if (!user) {
    throw new Error("Invalid credentials");
  }

  if (user.status !== "active") {
    throw new Error("Account inactive");
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  await saveFcmTokenOnLogin(user, fcmToken);

  const token = generateAccessToken(user);

  const userInfo = {
    id: user._id,
    name: user.name,
    role: user.role,
  };

  if (user.email) userInfo.email = user.email;
  if (user.scholarNumber) userInfo.scholarNumber = user.scholarNumber;
  if (user.classId) userInfo.classId = user.classId;
  if (user.sessionId) userInfo.sessionId = user.sessionId;

  return {
    accessToken: token,
    user: userInfo,
  };
}

export async function updateMyFcmToken(authUser = {}, payload = {}) {
  const role = String(authUser.role || "").toLowerCase();
  const userId = authUser._id;
  const Model = getModelByRole(role);

  if (!Model) {
    throw new Error("Unsupported role");
  }

  const normalizedFcmToken = normalizeFcmToken(payload.fcmToken);
  if (!normalizedFcmToken) {
    throw new Error("fcmToken is required");
  }

  await releaseFcmTokenFromOtherAccounts(normalizedFcmToken, { id: userId, role });

  const user = await Model.findById(userId);
  if (!user) throw new Error("User not found");

  if (user.fcmToken !== normalizedFcmToken) {
    user.fcmToken = normalizedFcmToken;
    await user.save();
  }

  return {
    id: user._id,
    role: user.role,
    fcmToken: user.fcmToken,
  };
}

export async function logoutUser(authUser = {}) {
  const role = String(authUser.role || "").toLowerCase();
  const userId = authUser._id;
  const Model = getModelByRole(role);

  if (!Model) {
    throw new Error("Unsupported role");
  }

  const user = await Model.findById(userId);
  if (!user) throw new Error("User not found");

  if (user.fcmToken) {
    user.fcmToken = null;
    await user.save();
  }

  return { id: user._id, role: user.role };
}

export async function changeAdminPassword(adminId, payload = {}) {
  const oldPassword = String(payload.oldPassword || "");
  const newPassword = String(payload.newPassword || "");

  if (!oldPassword) throw new Error("Old password is required");
  if (!newPassword) throw new Error("New password is required");
  if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");
  if (oldPassword === newPassword) {
    throw new Error("New password must be different from old password");
  }

  const admin = await User.findById(adminId).select("+password");
  if (!admin) throw new Error("Admin not found");
  if (admin.role !== "admin") throw new Error("Admin access only");
  if (admin.status !== "active") throw new Error("Account inactive");

  const isMatch = await admin.comparePassword(oldPassword);
  if (!isMatch) throw new Error("Old password is incorrect");

  admin.password = newPassword;
  await admin.save();

  return { id: admin._id };
}

export async function changeStudentPassword(studentId, payload = {}) {
  const oldPassword = String(payload.oldPassword || "");
  const newPassword = String(payload.newPassword || "");

  if (!oldPassword) throw new Error("Old password is required");
  if (!newPassword) throw new Error("New password is required");
  if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");
  if (oldPassword === newPassword) {
    throw new Error("New password must be different from old password");
  }

  const student = await Student.findById(studentId).select("+password");
  if (!student) throw new Error("Student not found");
  if (student.status !== "active") throw new Error("Account inactive");

  const isMatch = await student.comparePassword(oldPassword);
  if (!isMatch) throw new Error("Old password is incorrect");

  student.password = newPassword;
  await student.save();

  return { id: student._id };
}
