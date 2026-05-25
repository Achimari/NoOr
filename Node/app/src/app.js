import cookieParser from "cookie-parser";
import express from "express";
import apiRoutes from "./routes/apiRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import pageRoutes from "./routes/pageRoutes.js";
import { corsMiddleware, helmetMiddleware } from "./config/security.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { paths } from "./config/paths.js";
import { requestLogger } from "./utils/logger.js";
import { viewLocals } from "./middleware/viewLocals.js";

export function createApp() {
  const app = express();

  app.set("view engine", "ejs");
  app.set("views", paths.views);
  app.set("trust proxy", 1);

  app.use(requestLogger);
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(express.static(paths.public));
  app.use(viewLocals);

  app.use(healthRoutes);
  app.use(authRoutes);
  app.use(apiRoutes);
  app.use(pageRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
