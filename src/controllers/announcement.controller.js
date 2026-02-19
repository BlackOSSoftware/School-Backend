import {
  createAdminAnnouncement,
  createTeacherAnnouncement,
  getAllAnnouncementsForAdmin,
  getMyAnnouncements,
} from "../services/announcement.service.js";

export async function createAdminAnnouncementController(req, res) {
  try {
    const result = await createAdminAnnouncement(req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "Announcement created successfully",
      data: result.announcement,
      delivery: result.delivery,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create announcement",
    });
  }
}

export async function createTeacherAnnouncementController(req, res) {
  try {
    const result = await createTeacherAnnouncement(req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "Announcement created successfully",
      data: result.announcement,
      delivery: result.delivery,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create announcement",
    });
  }
}

export async function getAllAnnouncementsForAdminController(req, res) {
  try {
    const result = await getAllAnnouncementsForAdmin(req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch announcements",
    });
  }
}

export async function getMyAnnouncementsController(req, res) {
  try {
    const result = await getMyAnnouncements(req.user, req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch announcements",
    });
  }
}
