import {
  createAdminTimetable,
  createTeacherTimetable,
  deleteAdminTimetable,
  deleteTeacherTimetable,
  getAdminTimetables,
  getStudentTimetables,
  getTeacherTimetables,
  updateAdminTimetable,
  updateTeacherTimetable,
} from "../services/timetable.service.js";

function fail(res, error, fallback) {
  return res.status(400).json({
    success: false,
    message: error.message || fallback,
  });
}

export async function createTeacherTimetableController(req, res) {
  try {
    const data = await createTeacherTimetable(req.user?._id, req.body, req.file);
    return res.status(201).json({ success: true, message: "Timetable uploaded successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to upload timetable");
  }
}

export async function updateTeacherTimetableController(req, res) {
  try {
    const data = await updateTeacherTimetable(req.user?._id, req.params.timetableId, req.body, req.file);
    return res.status(200).json({ success: true, message: "Timetable updated successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to update timetable");
  }
}

export async function deleteTeacherTimetableController(req, res) {
  try {
    const data = await deleteTeacherTimetable(req.user?._id, req.params.timetableId);
    return res.status(200).json({ success: true, message: "Timetable deleted successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to delete timetable");
  }
}

export async function getTeacherTimetablesController(req, res) {
  try {
    const data = await getTeacherTimetables(req.user?._id, req.query);
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    return fail(res, error, "Unable to fetch timetables");
  }
}

export async function createAdminTimetableController(req, res) {
  try {
    const data = await createAdminTimetable(req.user?._id, req.body, req.file);
    return res.status(201).json({ success: true, message: "Timetable uploaded successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to upload timetable");
  }
}

export async function updateAdminTimetableController(req, res) {
  try {
    const data = await updateAdminTimetable(req.user?._id, req.params.timetableId, req.body, req.file);
    return res.status(200).json({ success: true, message: "Timetable updated successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to update timetable");
  }
}

export async function deleteAdminTimetableController(req, res) {
  try {
    const data = await deleteAdminTimetable(req.user?._id, req.params.timetableId);
    return res.status(200).json({ success: true, message: "Timetable deleted successfully", data });
  } catch (error) {
    return fail(res, error, "Unable to delete timetable");
  }
}

export async function getAdminTimetablesController(req, res) {
  try {
    const data = await getAdminTimetables(req.query);
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    return fail(res, error, "Unable to fetch timetables");
  }
}

export async function getStudentTimetablesController(req, res) {
  try {
    const data = await getStudentTimetables(req.user?._id, req.query);
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    return fail(res, error, "Unable to fetch timetables");
  }
}
