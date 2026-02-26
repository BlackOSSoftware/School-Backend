import {
  createStudentsBulk,
  bulkPromoteStudents,
  createStudent,
  deleteStudent,
  getAllStudents,
  getMyStudentProfile,
  getStudentById,
  getStudentsByClass,
  updateStudent,
} from "../services/student.service.js";

export async function createStudentController(req, res) {
  try {
    const created = await createStudent(req.body);

    return res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: created.student,
      password: created.generatedPassword,
      generatedPassword: created.generatedPassword,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Student creation failed",
    });
  }
}

export async function createStudentsBulkController(req, res) {
  try {
    const created = await createStudentsBulk(req.body);

    return res.status(201).json({
      success: true,
      message: "Students created successfully",
      data: created.students,
      passwords: created.passwords,
      totalCreated: created.totalCreated,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Bulk student creation failed",
    });
  }
}

export async function getAllStudentsController(req, res) {
  try {
    const result = await getAllStudents(req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch students",
    });
  }
}

export async function getStudentByIdController(req, res) {
  try {
    const row = await getStudentById(req.params.id);

    return res.status(200).json({
      success: true,
      data: row,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message || "Failed to fetch student",
    });
  }
}

export async function updateStudentController(req, res) {
  try {
    const updated = await updateStudent(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Student updated successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Student update failed",
    });
  }
}

export async function getStudentsByClassController(req, res) {
  try {
    const result = await getStudentsByClass(req.params.classId, req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch class students",
    });
  }
}

export async function deleteStudentController(req, res) {
  try {
    await deleteStudent(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Student delete failed",
    });
  }
}

export async function getMyStudentProfileController(req, res) {
  try {
    const profile = await getMyStudentProfile(req.user?._id);

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch student profile",
    });
  }
}

export async function bulkPromoteStudentsController(req, res) {
  try {
    const result = await bulkPromoteStudents(req.body);

    return res.status(200).json({
      success: true,
      message: "Student session transition completed successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Student session transition failed",
    });
  }
}
