import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    scholarNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    parentName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
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
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      default: "student",
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
  },
  { timestamps: true }
);

studentSchema.index({ classId: 1, status: 1 });
studentSchema.index({ classId: 1, name: 1 });
studentSchema.index({ sessionId: 1, classId: 1 });

studentSchema.pre("save", async function saveHook() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

studentSchema.methods.comparePassword = async function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

export default mongoose.model("Student", studentSchema);
