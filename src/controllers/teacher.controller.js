import {
  bulkCreateTeachers,
  createTeacher,
  deleteTeacher,
  getAllTeachers,
  getTeacherClassesAndStudents,
  getTeacherById,
  getTeacherStudentsByClassId,
  getTeacherStudentsByAssignedClasses,
  updateTeacher,
} from "../services/teacher.service.js";

export async function createTeacherController(req, res) {
  try {
    const created = await createTeacher(req.body, req.user?._id);

    return res.status(201).json({
      success: true,
      message: "Teacher created successfully",
      data: created,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Teacher creation failed",
    });
  }
}

export async function bulkCreateTeachersController(req, res) {
  try {
    const result = await bulkCreateTeachers(req.body, req.user?._id);

    return res.status(201).json({
      success: true,
      message: "Teachers created successfully",
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Teachers creation failed",
    });
  }
}

export async function getAllTeachersController(req, res) {
  try {
    const result = await getAllTeachers(req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch teachers",
    });
  }
}

export async function getTeacherByIdController(req, res) {
  try {
    const row = await getTeacherById(req.params.id);

    return res.status(200).json({
      success: true,
      data: row,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message || "Failed to fetch teacher",
    });
  }
}

export async function updateTeacherController(req, res) {
  try {
    const updated = await updateTeacher(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Teacher updated successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Teacher update failed",
    });
  }
}

export async function deleteTeacherController(req, res) {
  try {
    await deleteTeacher(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Teacher deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Teacher delete failed",
    });
  }
}

export async function getMyTeacherClassesController(req, res) {
  try {
    const result = await getTeacherClassesAndStudents(req.user?._id, req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch teacher classes",
    });
  }
}

export async function getMyStudentsController(req, res) {
  try {
    const result = await getTeacherStudentsByAssignedClasses(req.user?._id, req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch students",
    });
  }
}

export async function getMyStudentsByClassController(req, res) {
  try {
    const result = await getTeacherStudentsByClassId(
      req.user?._id,
      req.params.classId,
      req.query
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch students",
    });
  }
}
