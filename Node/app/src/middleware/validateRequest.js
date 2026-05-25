export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      req.validationErrors = result.error.issues.map((issue) => issue.message);
      return next();
    }

    req.validatedBody = result.data;
    return next();
  };
}
