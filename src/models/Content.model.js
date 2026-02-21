import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["homework", "notes"],
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    file: {
      originalName: {
        type: String,
        trim: true,
      },
      mimeType: {
        type: String,
        trim: true,
      },
      size: {
        type: Number,
      },
      storagePath: {
        type: String,
        trim: true,
      },
    },
  },
  { timestamps: true }
);

contentSchema.index({ classId: 1, type: 1, subject: 1, createdAt: -1 });
contentSchema.index({ createdBy: 1, type: 1, createdAt: -1 });

export default mongoose.model("Content", contentSchema);
