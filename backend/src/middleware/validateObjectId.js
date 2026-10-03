export const validateIdParam = (req, res, next, value) => {
  if (!/^[0-9a-fA-F]{24}$/.test(value)) {
    return res.status(400).json({
      success: false,
      message: "Invalid ID",
    });
  }
  next();
};
