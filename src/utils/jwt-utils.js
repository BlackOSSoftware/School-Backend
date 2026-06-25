import jwt from "jsonwebtoken";

export function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      tokenVersion: Number(user?.tokenVersion ?? 0),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}
