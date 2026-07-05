function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { errors: result.error.issues.map((issue) => issue.message) };
  }

  return { data: result.data };
}

export function validateBody(schema) {
  return (req, res, next) => {
    const { errors, data } = parseBody(schema, req.body);
    if (errors) {
      req.validationErrors = errors;
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
