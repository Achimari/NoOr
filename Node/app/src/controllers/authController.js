import { authCookieName, getAuthCookieOptions, getClearAuthCookieOptions } from "../middleware/authMiddleware.js";
import { loginUser, logoutSession, registerUser } from "../services/authService.js";
import { AppError } from "../utils/appError.js";

function renderLogin(res, status = 200, data = {}) {
  return res.status(status).render("pages/login", {
    pageId: "login",
    title: res.locals.t("auth.login.title"),
    errors: data.errors || [],
    values: data.values || {},
  });
}

function renderOnboarding(res, status = 200, data = {}) {
  return res.status(status).render("pages/onboarding", {
    pageId: "onboarding",
    title: res.locals.t("auth.onboarding.title"),
    errors: data.errors || [],
    values: data.values || {},
  });
}

function wantsHtml(req) {
  return req.accepts(["html", "json"]) === "html";
}

export function getLogin(req, res) {
  return renderLogin(res);
}

export function getOnboarding(req, res) {
  return renderOnboarding(res);
}

export async function postLogin(req, res) {
  if (req.validationErrors) {
    return renderLogin(res, 400, { errors: req.validationErrors, values: req.body });
  }

  try {
    const { sessionToken } = await loginUser(req.validatedBody);
    res.cookie(authCookieName, sessionToken, getAuthCookieOptions());
    return res.redirect("/");
  } catch (error) {
    if (error instanceof AppError) {
      return renderLogin(res, error.statusCode, { errors: [error.message], values: req.body });
    }
    throw error;
  }
}

export async function postLogout(req, res) {
  await logoutSession(req.cookies?.[authCookieName]);
  res.clearCookie(authCookieName, getClearAuthCookieOptions());
  return res.redirect("/login");
}

export async function registerApi(req, res) {
  if (req.validationErrors) {
    if (wantsHtml(req)) {
      return renderOnboarding(res, 400, { errors: req.validationErrors, values: req.body });
    }

    return res.status(400).json({ errors: req.validationErrors });
  }

  try {
    const user = await registerUser(req.validatedBody);

    if (wantsHtml(req)) {
      return res.redirect("/login");
    }

    return res.status(201).json({ user });
  } catch (error) {
    if (error instanceof AppError) {
      if (wantsHtml(req)) {
        return renderOnboarding(res, error.statusCode, { errors: [error.message], values: req.body });
      }

      return res.status(error.statusCode).json({ error: error.message });
    }

    throw error;
  }
}

export async function loginApi(req, res) {
  if (req.validationErrors) {
    return res.status(400).json({ errors: req.validationErrors });
  }

  try {
    const { user, sessionToken } = await loginUser(req.validatedBody);
    res.cookie(authCookieName, sessionToken, getAuthCookieOptions());
    return res.json({ user });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
}

export async function logoutApi(req, res) {
  await logoutSession(req.cookies?.[authCookieName]);
  res.clearCookie(authCookieName, getClearAuthCookieOptions());
  return res.json({ success: true });
}

export function meApi(req, res) {
  return res.json({ user: req.user });
}
