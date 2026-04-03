import mongoose from "mongoose";

const attendanceRecordSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    scholarNumber: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["present", "absent"],
      required: true,
    },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
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
      refPath: "markedByModel",
      required: false,
      default: null,
    },
    markedByModel: {
      type: String,
      enum: ["Teacher", "User"],
      default: "Teacher",
    },
    markedByRole: {
      type: String,
      enum: ["teacher", "admin"],
      default: "teacher",
    },
    markedByName: {
      type: String,
      trim: true,
      default: "",
    },
    records: {
      type: [attendanceRecordSchema],
      default: [],
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ classId: 1, sessionId: 1, dateKey: 1 }, { unique: true });
attendanceSchema.index({ classId: 1, dateKey: 1 });
attendanceSchema.index({ sessionId: 1, dateKey: 1 });

export default mongoose.model("Attendance", attendanceSchema);
