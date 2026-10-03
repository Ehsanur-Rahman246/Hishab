import ChatMessage from "../models/ChatMessage.js";

export const getMessages = async (req, res) => {
  try {
    const userId = req.user.userId;

    const messages = await ChatMessage.find({
      user: userId,
    }).sort({
      createdAt: 1,
      _id: 1,
    });

    return res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getOneMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const message = await ChatMessage.findOne({
      _id: id,
      user: userId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    return res.status(200).json({
      success: true,
      message,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const message = await ChatMessage.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteMessages = async (req, res) => {
  try {
    const userId = req.user.userId;

    await ChatMessage.deleteMany({
      user: userId,
    });

    return res.status(200).json({
      success: true,
      message: "Chat history deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
