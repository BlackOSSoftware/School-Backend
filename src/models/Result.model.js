import mongoose from "mongoose";

export const EXAM_TYPES = [
  "Periodic Test",
  "Term - 1",
  "Term - 2",
  "Surprise Test",
];

export const EXAM_TYPES_NEEDING_MONTH = ["Periodic Test", "Surprise Test"];

const resultSubjectSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    marks: {
      type: Number,
      default: 0,
      min: 0,
      max: 999,
    },
    outOf: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
    },
    isAbsent: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
  {
    examType: {
      type: String,
      required: true,
      enum: EXAM_TYPES,
      trim: true,
    },
    month: {
      type: String,
      default: null,
      trim: true,
    },
    examTitle: {
      type: String,
      required: true,
      trim: true,
    },
    examKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
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
    subjectMarks: {
      type: [resultSubjectSchema],
      default: [],
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 0,
    },
    outOf: {
      type: Number,
      required: true,
      min: 1,
    },
    submittedByTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    updatedByTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
  },
  { timestamps: true }
);

resultSchema.pre("validate", function enforceExamRules() {
  if (EXAM_TYPES_NEEDING_MONTH.includes(this.examType)) {
    if (!String(this.month || "").trim()) {
      throw new Error(`Month is required for ${this.examType}`);
    }
  } else {
    this.month = null;
  }

  if (this.outOf < 1) {
    throw new Error("Out of must be greater than 0");
  }

  for (const item of this.subjectMarks || []) {
    if (item.isAbsent) continue;
    if (Number(item.marks || 0) > Number(item.outOf || this.outOf || 0)) {
      throw new Error(`Marks for ${item.subject} cannot exceed out of value`);
    }
  }
});

resultSchema.index(
  { studentId: 1, classId: 1, sessionId: 1, examKey: 1 },
  { unique: true }
);

export default mongoose.model("Result", resultSchema);
