import {
  changeAdminPassword,
  changeStudentPassword,
  loginUser,
  logoutUser,
  updateMyFcmToken,
} from "../services/auth.service.js";

export async function login(req, res) {
  try {
    const data = await loginUser(req.body);

    return res.status(200).json({
      message: "Login successful",
      ...data,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Login failed",
    });
  }
}

export async function changeAdminPasswordController(req, res) {
  try {
    const data = await changeAdminPassword(req.user?._id, req.body);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
      accessToken: data.accessToken,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Password change failed",
    });
  }
}

export async function changeStudentPasswordController(req, res) {
  try {
    await changeStudentPassword(req.user?._id, req.body);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Password change failed",
    });
  }
}

export async function updateMyFcmTokenController(req, res) {
  try {
    const data = await updateMyFcmToken(req.user, req.body);

    return res.status(200).json({
      success: true,
      message: "FCM token updated successfully",
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update FCM token",
    });
  }
}

export async function logoutController(req, res) {
  try {
    await logoutUser(req.user);

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Logout failed",
    });
  }
}
