import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
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
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    file: {
      originalName: {
        type: String,
        required: true,
        trim: true,
      },
      mimeType: {
        type: String,
        required: true,
        trim: true,
      },
      size: {
        type: Number,
        required: true,
      },
      storagePath: {
        type: String,
        required: true,
        trim: true,
      },
    },
  },
  { timestamps: true }
);

videoSchema.index({ createdAt: -1 });
videoSchema.index({ title: 1, createdAt: -1 });

export default mongoose.model("Video", videoSchema);
