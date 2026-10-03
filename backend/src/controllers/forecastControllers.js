import ForecastSnapshot from "../models/ForecastSnapshot.js";

export const getForecasts = async (req, res) => {
  try {
    const userId = req.user.userId;

    const forecasts = await ForecastSnapshot.find({
      user: userId,
    }).sort({
      generatedAt: -1,
    });

    return res.status(200).json({
      success: true,
      forecasts,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getOneForecast = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const forecast = await ForecastSnapshot.findOne({
      _id: id,
      user: userId,
    });

    if (!forecast) {
      return res.status(404).json({
        success: false,
        message: "Forecast not found",
      });
    }

    return res.status(200).json({
      success: true,
      forecast,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getLatestForecast = async (req, res) => {
  try {
    const userId = req.user.userId;

    const forecast = await ForecastSnapshot.findOne({
      user: userId,
    }).sort({
      generatedAt: -1,
    });

    if (!forecast) {
      return res.status(404).json({
        success: false,
        message: "No forecast found",
      });
    }

    return res.status(200).json({
      success: true,
      forecast,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteForecast = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const forecast = await ForecastSnapshot.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!forecast) {
      return res.status(404).json({
        success: false,
        message: "Forecast not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Forecast deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
