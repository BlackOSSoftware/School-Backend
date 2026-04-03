import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    announcementType: {
      type: String,
      enum: ["school_wide", "class_wise", "teacher_only", "teachers_only"],
      required: true,
    },
    targetAudience: {
      type: String,
      enum: ["all", "teacher_only", "teachers_only"],
      default: "all",
    },
    classIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Class",
        },
      ],
      default: [],
    },
    createdById: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    createdByRole: {
      type: String,
      enum: ["admin", "teacher"],
      required: true,
    },
    createdByName: {
      type: String,
      required: true,
      trim: true,
    },
    delivery: {
      attempted: {
        type: Number,
        default: 0,
      },
      success: {
        type: Number,
        default: 0,
      },
      failure: {
        type: Number,
        default: 0,
      },
      lastAttemptAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
);

announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ announcementType: 1, createdAt: -1 });
announcementSchema.index({ classIds: 1, createdAt: -1 });
announcementSchema.index({ createdByRole: 1, createdAt: -1 });

export default mongoose.model("Announcement", announcementSchema);
