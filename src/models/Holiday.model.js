import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
    },
    dateKey: {
      type: String,
      required: true,
      trim: true,
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },
    markedByName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

holidaySchema.index({ classId: 1, sessionId: 1, dateKey: 1 }, { unique: true });
holidaySchema.index({ classId: 1, dateKey: 1 });

export default mongoose.model("Holiday", holidaySchema);
