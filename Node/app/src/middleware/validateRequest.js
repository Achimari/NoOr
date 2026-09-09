function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path?.[0];
      if (typeof field !== "string") continue;
      (fieldErrors[field] ||= []).push(issue.message);
    }

    return { errors: result.error.issues.map((issue) => issue.message), fieldErrors };
  }

  return { data: result.data };
}

export function validateBody(schema) {
  return (req, res, next) => {
    const { errors, fieldErrors, data } = parseBody(schema, req.body);
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
    const { errors, data } = parseBody(schema, req.body);
    if (errors) {
      return res.status(400).json({ errors });
    }

    req.validatedBody = data;
    return next();
  };
}
