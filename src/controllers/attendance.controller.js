import {
  getAdminAttendanceDateSummary,
  getAdminClassAttendanceByDate,
  getAdminDashboardSummary,
  getAdminStudentAttendanceReport,
  getTeacherAttendancePolicy,
  getMyClassAttendanceByDate,
  getMyStudentAttendanceReport,
  getStudentMyAttendanceReport,
  updateTeacherAttendancePolicy,
  updateAdminStudentAttendanceByDate,
  markMyClassAttendance,
  markMyClassHoliday,
  unmarkMyClassHoliday,
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

export async function markMyClassHolidayController(req, res) {
  try {
    const result = await markMyClassHoliday(req.user?._id, req.params.classId, req.body);
    return res.status(200).json({
      success: true,
      message: "Day marked as holiday. Attendance for this date was cleared.",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to mark holiday",
    });
  }
}

export async function unmarkMyClassHolidayController(req, res) {
  try {
    const result = await unmarkMyClassHoliday(req.user?._id, req.params.classId, req.query);
    return res.status(200).json({
      success: true,
      message: "Holiday removed successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to remove holiday",
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

export async function getTeacherAttendancePolicyController(_req, res) {
  try {
    const result = await getTeacherAttendancePolicy();

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch attendance policy",
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

export async function getAdminDashboardSummaryController(req, res) {
  try {
    const result = await getAdminDashboardSummary(req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch dashboard summary",
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

export async function getAdminStudentAttendanceReportController(req, res) {
  try {
    const result = await getAdminStudentAttendanceReport(
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

export async function updateAdminStudentAttendanceByDateController(req, res) {
  try {
    const result = await updateAdminStudentAttendanceByDate(
      req.user?._id,
      req.params.classId,
      req.params.studentId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update attendance",
    });
  }
}

export async function updateTeacherAttendancePolicyController(req, res) {
  try {
    const result = await updateTeacherAttendancePolicy(req.user?._id, req.body);

    return res.status(200).json({
      success: true,
      message: "Teacher attendance setting updated successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update attendance policy",
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
