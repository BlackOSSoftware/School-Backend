import mongoose from "mongoose";

const busSchema = new mongoose.Schema(
  {
    busNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    trackingUsername: {
      type: String,
      required: true,
      trim: true,
    },
    trackingPassword: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

busSchema.index({ busNumber: 1 }, { unique: true });

export default mongoose.model("Bus", busSchema);
