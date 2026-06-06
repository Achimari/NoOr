import { updateUserTimezone } from "../services/authService.js";
import { AppError } from "../utils/appError.js";
import { getTimezoneLabel } from "../utils/timezones.js";

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
