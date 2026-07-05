import { logger } from "../utils/logger.js";

export function isApiRequest(req) {
  return req.path.startsWith("/api/") || req.path.startsWith("/auth/");
}

export function notFoundHandler(req, res) {
  if (isApiRequest(req) || !req.accepts("html")) {
    return res.status(404).json({ error: "Not found" });
  }

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

  if (!isApiRequest(req) && req.accepts("html")) {
    return res.status(statusCode).render("pages/not-found", {
      pageId: "error",
      title: statusCode === 401 ? "Unauthorized" : "Error",
    });
  }

  const exposeMessage = isClientError || error.isOperational;

  return res.status(statusCode).json({
    error: exposeMessage ? error.message : "Internal server error",
  });
}
