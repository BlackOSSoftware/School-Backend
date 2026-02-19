import {
  createClass,
  deleteClass,
  getAllClasses,
  getClassById,
  updateClass,
} from "../services/class.service.js";

export async function createClassController(req, res) {
  try {
    const created = await createClass(req.body, req.user?._id);

    return res.status(201).json({
      success: true,
      message: "Class created successfully",
      data: created,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Class creation failed",
    });
  }
}

export async function getAllClassesController(req, res) {
  try {
    const result = await getAllClasses(req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch classes",
    });
  }
}

export async function getClassByIdController(req, res) {
  try {
    const row = await getClassById(req.params.id);

    return res.status(200).json({
      success: true,
      data: row,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message || "Failed to fetch class",
    });
  }
}

export async function updateClassController(req, res) {
  try {
    const updated = await updateClass(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Class updated successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Class update failed",
    });
  }
}

export async function deleteClassController(req, res) {
  try {
    await deleteClass(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Class deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Class delete failed",
    });
  }
}
