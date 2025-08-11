import mongoose from "mongoose";

const AdminUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

export default mongoose.model("AdminUser", AdminUserSchema);
