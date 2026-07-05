import { env, isProduction } from "../config/env.js";
import { isApiRequest } from "./errorHandler.js";
import { getSessionByToken, getSessionMaxAgeMs } from "../services/authService.js";

export const authCookieName = env.SESSION_COOKIE_NAME;

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: getSessionMaxAgeMs(),
  };
}

export function getClearAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  };
}

function rejectUnauthenticated(req, res) {
  if (isApiRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return res.redirect("/login");
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[authCookieName];

  if (!token) {
    return rejectUnauthenticated(req, res);
  }

  try {
    const session = await getSessionByToken(token);
    if (!session) {
      res.clearCookie(authCookieName, getClearAuthCookieOptions());
      return rejectUnauthenticated(req, res);
    }

    req.session = {
      id: session.id,
      expiresAt: session.expiresAt,
    };
    req.user = session.user;
    res.locals.auth = session.user;
    return next();
  } catch (error) {
    return next(error);
  }
}
