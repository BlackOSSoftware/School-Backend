import mongoose from "mongoose";

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
      required: true,
      min: 0,
      max: 999,
    },
  },
  { _id: false }
);

const EXAM_TYPES = ["Monthly Test", "Quarterly Exam", "Half-Yearly Exam", "Annual Exam"];

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
  if (this.examType === "Monthly Test") {
    if (!String(this.month || "").trim()) {
      throw new Error("Month is required for Monthly Test");
    }
  } else {
    this.month = null;
  }

  if (this.outOf < 1) {
    throw new Error("Out of must be greater than 0");
  }

  const invalidSubject = (this.subjectMarks || []).find(
    (item) => Number(item?.marks || 0) > Number(this.outOf || 0)
  );
  if (invalidSubject) {
    throw new Error(`Marks for ${invalidSubject.subject} cannot exceed out of value`);
  }
});

resultSchema.index(
  { studentId: 1, classId: 1, sessionId: 1, examKey: 1 },
  { unique: true }
);

export default mongoose.model("Result", resultSchema);
