import { createSession, getActiveSession, getAllSessions, updateSession } from "../services/session.service.js";

export async function createSessionController(req, res) {
  try {
    const session = await createSession(req.body);

    res.status(201).json({
      message: "Session created successfully",
      data: session,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Session creation failed",
    });
  }
}
/* ---------------------------------------
   GET ALL
--------------------------------------- */
export async function getAllSessionsController(req, res) {
  try {
    const result = await getAllSessions(req.query);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch sessions",
    });
  }
}

/* ---------------------------------------
   GET ACTIVE
--------------------------------------- */
export async function getActiveSessionController(req, res) {
  try {
    const session = await getActiveSession();

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch active session",
    });
  }
}

/* ---------------------------------------
   UPDATE
--------------------------------------- */
export async function updateSessionController(req, res) {
  try {
    const updated = await updateSession(req.params.id, req.body);

    res.status(200).json({
      success: true,
      message: "Session updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Update failed",
    });
  }
}