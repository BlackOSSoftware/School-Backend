import mongoose from "mongoose";

const appSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
      trim: true,
    },
    teacherPastAttendanceEnabled: {
      type: Boolean,
      default: false,
    },
    teacherPastAttendanceUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    teacherPastAttendanceUpdatedByName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model("AppSetting", appSettingSchema);
