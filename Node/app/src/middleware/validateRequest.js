import { z } from "zod";

/* A schema's own messages are English source strings and go through req.t;
   zod's generic messages ("Too big: …") come from zod's own locale instead. */
const zodLocales = { ru: z.locales.ru() };

function parseBody(schema, body, req) {
  const t = req.t ?? ((message) => message);
  const zodLocale = zodLocales[req.locale];
  const result = schema.safeParse(body, zodLocale ? { error: zodLocale.localeError } : undefined);
  if (!result.success) {
    const fieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path?.[0];
      if (typeof field !== "string") continue;
      (fieldErrors[field] ||= []).push(t(issue.message));
    }

    return { errors: result.error.issues.map((issue) => t(issue.message)), fieldErrors };
  }

  return { data: result.data };
}

export function validateBody(schema) {
  return (req, res, next) => {
    const { errors, fieldErrors, data } = parseBody(schema, req.body, req);
    if (errors) {
      req.validationErrors = errors;
      req.validationFieldErrors = fieldErrors;
      return next();
    }

    req.validatedBody = data;
    return next();
  };
}

export function validateApiBody(schema) {
  return (req, res, next) => {
    const { errors, data } = parseBody(schema, req.body, req);
    if (errors) {
      return res.status(400).json({ errors });
    }

    req.validatedBody = data;
    return next();
  };
}
