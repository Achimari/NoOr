import { logger } from "../utils/logger.js";

export function notFoundHandler(req, res) {
  res.status(404).render("pages/not-found", {
    pageId: "not-found",
    title: res.locals.t("notFound.title"),
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;
  const isClientError = statusCode >= 400 && statusCode < 500;

  logger[isClientError ? "warn" : "error"](
    {
      err: error,
      path: req.path,
      method: req.method,
    },
    "Request failed",
  );

  const isApiRequest = req.path.startsWith("/api/") || req.path.startsWith("/auth/");

  if (!isApiRequest && req.accepts("html")) {
    return res.status(statusCode).render("pages/not-found", {
      pageId: "error",
      title: statusCode === 401 ? "Unauthorized" : "Error",
    });
  }

  return res.status(statusCode).json({
    error: isClientError ? error.message : "Internal server error",
  });
}
