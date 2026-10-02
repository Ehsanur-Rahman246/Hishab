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

export const createForecast = async (req, res) => {
  try {
    const userId = req.user.userId;

    const { modelUsed, horizonWeeks, weeks } = req.body;

    if (!modelUsed || !horizonWeeks || !weeks) {
      return res.status(400).json({
        success: false,
        message: "Model, horizon, and forecast weeks are required",
      });
    }

    if (!Array.isArray(weeks) || weeks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one forecast week is required",
      });
    }

    if (Number(horizonWeeks) !== weeks.length) {
      return res.status(400).json({
        success: false,
        message: "Horizon weeks must match the number of forecast weeks",
      });
    }

    const forecast = await ForecastSnapshot.create({
      user: userId,
      modelUsed,
      horizonWeeks: Number(horizonWeeks),
      weeks,
    });

    return res.status(201).json({
      success: true,
      message: "Forecast created successfully",
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
