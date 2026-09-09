import {
  deleteAdminResult,
  deleteTeacherResult,
  getAdminStudentResults,
  getStudentResults,
  getTeacherStudentResults,
  submitTeacherResult,
  updateAdminResult,
  updateTeacherResult,
} from "../services/result.service.js";

function fail(res, error, fallback) {
  return res.status(400).json({
    success: false,
    message: error.message || fallback,
  });
}

export async function submitTeacherResultController(req, res) {
  try {
    const data = await submitTeacherResult(req.user?._id, req.body);
    return res.status(200).json({ success: true, message: "Result saved successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to save result");
  }
}

export async function getMyStudentResultsController(req, res) {
  try {
    const data = await getStudentResults(req.user?._id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return fail(res, error, "Unable to fetch results");
  }
}

export async function getAdminStudentResultsController(req, res) {
  try {
    const data = await getAdminStudentResults(req.params.studentId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return fail(res, error, "Unable to fetch student results");
  }
}

export async function getTeacherStudentResultsController(req, res) {
  try {
    const data = await getTeacherStudentResults(req.user?._id, req.params.studentId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return fail(res, error, "Unable to fetch student results");
  }
}

export async function updateTeacherResultController(req, res) {
  try {
    const data = await updateTeacherResult(req.user?._id, req.params.resultId, req.body);
    return res.status(200).json({ success: true, message: "Result updated successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to update result");
  }
}

export async function deleteTeacherResultController(req, res) {
  try {
    const data = await deleteTeacherResult(req.user?._id, req.params.resultId);
    return res.status(200).json({ success: true, message: "Result deleted successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to delete result");
  }
}

export async function updateAdminResultController(req, res) {
  try {
    const data = await updateAdminResult(req.user?._id, req.params.resultId, req.body);
    return res.status(200).json({ success: true, message: "Result updated successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to update result");
  }
}

export async function deleteAdminResultController(req, res) {
  try {
    const data = await deleteAdminResult(req.user?._id, req.params.resultId);
    return res.status(200).json({ success: true, message: "Result deleted successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to delete result");
  }
}
