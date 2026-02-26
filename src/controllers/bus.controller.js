import { createBus, getAllBuses, getBusById, updateBus } from "../services/bus.service.js";

export async function createBusController(req, res) {
  try {
    const created = await createBus(req.body);

    return res.status(201).json({
      success: true,
      message: "Bus created successfully",
      data: created,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Bus creation failed",
    });
  }
}

export async function getAllBusesController(req, res) {
  try {
    const result = await getAllBuses(req.query);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch buses",
    });
  }
}

export async function getBusByIdController(req, res) {
  try {
    const row = await getBusById(req.params.id);

    return res.status(200).json({
      success: true,
      data: row,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message || "Failed to fetch bus",
    });
  }
}

export async function updateBusController(req, res) {
  try {
    const updated = await updateBus(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Bus updated successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Bus update failed",
    });
  }
}
