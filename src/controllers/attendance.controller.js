import {
  getAdminAttendanceDateSummary,
  getAdminClassAttendanceByDate,
  getMyClassAttendanceByDate,
  getMyStudentAttendanceReport,
  getStudentMyAttendanceReport,
  markMyClassAttendance,
} from "../services/attendance.service.js";

export async function markMyClassAttendanceController(req, res) {
  try {
    const result = await markMyClassAttendance(req.user?._id, req.params.classId, req.body);

    return res.status(200).json({
      success: true,
      message: "Attendance saved successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to save attendance",
    });
  }
}

export async function getMyClassAttendanceByDateController(req, res) {
  try {
    const result = await getMyClassAttendanceByDate(req.user?._id, req.params.classId, req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch class attendance",
    });
  }
}

export async function getMyStudentAttendanceReportController(req, res) {
  try {
    const result = await getMyStudentAttendanceReport(
      req.user?._id,
      req.params.classId,
      req.params.studentId,
      req.query
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch student attendance report",
    });
  }
}

export async function getAdminAttendanceDateSummaryController(req, res) {
  try {
    const result = await getAdminAttendanceDateSummary(req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch attendance summary",
    });
  }
}

export async function getAdminClassAttendanceByDateController(req, res) {
  try {
    const result = await getAdminClassAttendanceByDate(req.params.classId, req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch class attendance",
    });
  }
}

export async function getStudentMyAttendanceReportController(req, res) {
  try {
    const result = await getStudentMyAttendanceReport(req.user?._id, req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch attendance report",
    });
  }
}
