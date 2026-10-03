import "dotenv/config";
import express from "express";
import { connectDB } from "./config/db.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./routes/authRoutes.js";
import walletRouter from "./routes/walletRoutes.js";
import transactionRouter from "./routes/transactionRoutes.js";
import goalRouter from "./routes/goalRoutes.js";
import alertRouter from "./routes/alertRoutes.js";
import summaryRouter from "./routes/summaryRoutes.js";
import forecastRouter from "./routes/forecastRoutes.js";
import chatRouter from "./routes/chatRoutes.js";
import aiRouter from "./routes/aiRoutes.js";

const app = express();

const PORT = process.env.PORT || 5001;
const allowedOrigins =
  process.env.CLIENT_URL?.split(",").map((o) => o.trim()) || [];

app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.get("/", (_, res) => res.send("Server working"));

app.use("/api/auth", authRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/transactions", transactionRouter);
app.use("/api/goals", goalRouter);
app.use("/api/alerts", alertRouter);
app.use("/api/summaries", summaryRouter);
app.use("/api/forecasts", forecastRouter);
app.use("/api/chat", chatRouter);
app.use("/api/ai", aiRouter);

app.use((_, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log("Server started on PORT:", PORT);
    });
});