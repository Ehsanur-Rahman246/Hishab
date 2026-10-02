import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const PHONE_REGEX = /^01[3-9]\d{8}$/; // BD mobile, 11 digits
const PIN_REGEX = /^\d{6}$/; // 5-digit PIN

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

const signAndSetToken = (res, user) => {
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const publicUser = (user) => ({
  id: user._id,
  uid: user.uid,
  name: user.name,
  phone: user.phone,
});

export const register = async (req, res) => {
  try {
    const { name, phone, pin } = req.body;

    if (!name || !phone || !pin) {
      return res.status(400).json({
        success: false,
        message: "Name, phone, and PIN are required",
      });
    }

    if (!PHONE_REGEX.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Bangladeshi mobile number",
      });
    }

    if (!PIN_REGEX.test(String(pin))) {
      return res.status(400).json({
        success: false,
        message: "PIN must be exactly 6 digits",
      });
    }

    const existingUser = await User.findOne({ phone: phone.trim() });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this phone number already exists",
      });
    }

    const hashedPin = await bcrypt.hash(String(pin), 10);

    const user = await User.create({
      name,
      phone: phone.trim(),
      pin: hashedPin,
    });

    signAndSetToken(res, user);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user: publicUser(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const login = async (req, res) => {
  try {
    const { phone, pin } = req.body;

    if (!phone || !pin) {
      return res.status(400).json({
        success: false,
        message: "Phone and PIN are required",
      });
    }

    const user = await User.findOne({ phone: phone.trim() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or PIN",
      });
    }

    const isPinCorrect = await bcrypt.compare(String(pin), user.pin);

    if (!isPinCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or PIN",
      });
    }

    signAndSetToken(res, user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: publicUser(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const logout = (req, res) => {
  res.clearCookie("token", cookieOptions);

  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
};

// Needs the auth middleware to set req.user.userId
export const deleteAccount = async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: "PIN is required to delete your account",
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPinCorrect = await bcrypt.compare(String(pin), user.pin);

    if (!isPinCorrect) {
      return res.status(401).json({
        success: false,
        message: "Incorrect PIN",
      });
    }

    // TODO: cascade-delete this user's other data once those models exist
    await User.findByIdAndDelete(user._id);

    res.clearCookie("token", cookieOptions);

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
