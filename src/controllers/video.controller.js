import {
  createVideoByAdmin,
  deleteVideoByAdmin,
  getVideoList,
  updateVideoByAdmin,
} from "../services/video.service.js";

function toAbsoluteUrl(req, rawPath = "") {
  const normalizedPath = String(rawPath || "").startsWith("/")
    ? String(rawPath)
    : `/${String(rawPath || "")}`;
  return `${req.protocol}://${req.get("host")}${normalizedPath}`;
}

function mapVideoFileUrls(req, row) {
  if (!row?.file?.url) return row;
  return {
    ...row,
    file: {
      ...row.file,
      url: toAbsoluteUrl(req, row.file.url),
      openUrl: toAbsoluteUrl(req, row.file.url),
    },
  };
}

export async function createAdminVideoController(req, res) {
  try {
    const created = await createVideoByAdmin(req.user?._id, req.body, req.file);
    return res.status(201).json({
      success: true,
      message: "Video uploaded successfully",
      data: mapVideoFileUrls(req, created),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to upload video",
    });
  }
}

export async function getAdminVideosController(req, res) {
  try {
    const result = await getVideoList(req.query);
    return res.status(200).json({
      success: true,
      ...result,
      data: result.data.map((row) => mapVideoFileUrls(req, row)),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch videos",
    });
  }
}

export async function updateAdminVideoController(req, res) {
  try {
    const updated = await updateVideoByAdmin(req.params.id, req.body, req.file);
    return res.status(200).json({
      success: true,
      message: "Video updated successfully",
      data: mapVideoFileUrls(req, updated),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update video",
    });
  }
}

export async function deleteAdminVideoController(req, res) {
  try {
    await deleteVideoByAdmin(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to delete video",
    });
  }
}

export async function getTeacherVideosController(req, res) {
  try {
    const result = await getVideoList(req.query);
    return res.status(200).json({
      success: true,
      ...result,
      data: result.data.map((row) => mapVideoFileUrls(req, row)),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch videos",
    });
  }
}

export async function getStudentVideosController(req, res) {
  try {
    const result = await getVideoList(req.query);
    return res.status(200).json({
      success: true,
      ...result,
      data: result.data.map((row) => mapVideoFileUrls(req, row)),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch videos",
    });
  }
}
