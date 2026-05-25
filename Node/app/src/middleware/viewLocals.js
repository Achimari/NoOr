import { createViewLocals } from "../i18n/index.js";
import { siteData } from "../data/siteData.js";

export function viewLocals(req, res, next) {
  res.locals = {
    ...res.locals,
    ...createViewLocals(req),
    siteData,
    auth: req.user || null,
  };
  next();
}
