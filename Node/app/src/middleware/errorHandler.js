import { logger } from "../utils/logger.js";
import { resolveOptionalUser } from "./authMiddleware.js";

export function isApiRequest(req) {
  return req.path.startsWith("/api/") || req.path.startsWith("/auth/");
}

/* req.t is attached by viewLocals; an error raised before it ran (a malformed
   body, say) is reported in the source language rather than not at all. */
const translator = (req) => req.t ?? ((message) => message);

export async function notFoundHandler(req, res) {
  if (isApiRequest(req) || !req.accepts("html")) {
    return res.status(404).json({ error: translator(req)("Not found") });
  }

  res.status(404).render("pages/not-found", {
    pageId: "not-found",
    title: res.locals.t("notFound.title"),
    auth: await resolveOptionalUser(req),
  });
}

export async function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const t = translator(req);

  logger[isClientError ? "warn" : "error"](
    {
      err: error,
      path: req.path,
      method: req.method,
    },
    "Request failed",
  );

  if (!isApiRequest(req) && req.accepts("html") && res.locals.t) {
    return res.status(statusCode).render("pages/not-found", {
      pageId: "error",
      title: statusCode === 401 ? t("Unauthorized") : t("Error"),
      auth: res.locals.auth || (await resolveOptionalUser(req)),
    });
  }

  const exposeMessage = isClientError || error.isOperational;

  return res.status(statusCode).json({
    /* A message built from values carries its template as messageKey, so it is
       translated as a sentence rather than missed as an unknown string. */
    error: exposeMessage ? t(error.messageKey ?? error.message, error.params) : t("Internal server error"),
    ...(exposeMessage && error.code ? { code: error.code } : {}),
  });
}
