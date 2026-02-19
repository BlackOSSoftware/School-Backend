import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const lectureAssignmentSchema = new mongoose.Schema(
  {
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
  },
  { _id: false }
);

const teacherSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      default: "teacher",
      immutable: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    fcmToken: {
      type: String,
      trim: true,
      default: null,
    },
    classTeacherOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      unique: true,
    },
    subjects: {
      type: [String],
      required: true,
      validate: {
        validator: (values) => Array.isArray(values) && values.length > 0,
        message: "At least one subject is required",
      },
    },
    lectureAssignments: {
      type: [lectureAssignmentSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

teacherSchema.pre("save", async function saveHook() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

teacherSchema.methods.comparePassword = async function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

export default mongoose.model("Teacher", teacherSchema);
