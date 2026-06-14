import { updateUserName, updateUserPassword, updateUserTimezone } from "../services/authService.js";
import { AppError } from "../utils/appError.js";
import { getTimezoneLabel } from "../utils/timezones.js";

function renderSettings(res, status = 200, data = {}) {
  return res.status(status).render("pages/settings", {
    pageId: "settings",
    title: "Settings",
    nicknameErrors: data.nicknameErrors || [],
    passwordErrors: data.passwordErrors || [],
    nicknameSuccess: data.nicknameSuccess || "",
    passwordSuccess: data.passwordSuccess || "",
    toastMessage: data.toastMessage || "",
    toastVariant: data.toastVariant || "default",
    values: data.values || {},
  });
}

export function renderSettingsPage(req, res) {
  const isNicknameUpdated = req.query.updated === "nickname";
  const isPasswordUpdated = req.query.updated === "password";

  return renderSettings(res, 200, {
    nicknameSuccess: isNicknameUpdated ? "Nickname updated." : "",
    passwordSuccess: isPasswordUpdated ? "Password updated." : "",
    toastMessage: isNicknameUpdated ? "Nickname updated" : isPasswordUpdated ? "Password updated" : "",
  });
}

export async function updateCurrentUserName(req, res) {
  if (req.validationErrors) {
    return renderSettings(res, 400, {
      nicknameErrors: req.validationErrors,
      toastMessage: req.validationErrors[0],
      toastVariant: "error",
      values: req.body,
    });
  }

  try {
    const user = await updateUserName({
      userId: req.user.id,
      name: req.validatedBody.name,
    });

    req.user = user;
    res.locals.auth = user;

    return res.redirect("/settings?updated=nickname");
  } catch (error) {
    if (error instanceof AppError) {
      return renderSettings(res, error.statusCode, {
        nicknameErrors: [error.message],
        toastMessage: error.message,
        toastVariant: "error",
        values: req.body,
      });
    }

    throw error;
  }
}

export async function updateCurrentUserPassword(req, res) {
  if (req.validationErrors) {
    return renderSettings(res, 400, {
      passwordErrors: req.validationErrors,
      toastMessage: req.validationErrors[0],
      toastVariant: "error",
    });
  }

  try {
    await updateUserPassword({
      userId: req.user.id,
      currentPassword: req.validatedBody.currentPassword,
      password: req.validatedBody.password,
    });

    return res.redirect("/settings?updated=password");
  } catch (error) {
    if (error instanceof AppError) {
      return renderSettings(res, error.statusCode, {
        passwordErrors: [error.message],
        toastMessage: error.message,
        toastVariant: "error",
      });
    }

    throw error;
  }
}

export async function updateCurrentUserTimezone(req, res) {
  if (req.validationErrors) {
    return res.status(400).json({ errors: req.validationErrors });
  }

  try {
    const user = await updateUserTimezone({
      userId: req.user.id,
      timezone: req.validatedBody.timezone,
    });

    req.user = user;
    res.locals.auth = user;

    return res.json({
      user,
      timezone: {
        value: user.timezone,
        label: getTimezoneLabel(user.timezone),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    throw error;
  }
}
