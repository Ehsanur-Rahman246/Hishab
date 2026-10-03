import Alert from "../models/Alert.js";
import { syncAlerts } from "../services/alertService.js";

export const refreshAlerts = async (req, res) => {
  try {
    const created = await syncAlerts(req.user.userId);
    return res.status(200).json({ success: true, created });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAlerts = async (req, res) => {
  try {
    const userId = req.user.userId;

    const alerts = await Alert.find({
      user: userId,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      alerts,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getOneAlert = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const alert = await Alert.findOne({
      _id: id,
      user: userId,
    }).populate("relatedGoal");

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    return res.status(200).json({
      success: true,
      alert,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const alert = await Alert.findOneAndUpdate(
      {
        _id: id,
        user: userId,
      },
      {
        read: true,
      },
      {
        new: true,
      },
    );

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Alert marked as read",
      alert,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;

    await Alert.updateMany(
      {
        user: userId,
        read: false,
      },
      {
        read: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "All alerts marked as read",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const resolveAlert = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const alert = await Alert.findOneAndUpdate(
      {
        _id: id,
        user: userId,
      },
      {
        resolved: true,
        read: true,
      },
      {
        new: true,
      },
    );

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Alert resolved successfully",
      alert,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteAlert = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const alert = await Alert.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Alert deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
