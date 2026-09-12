import { ICON_NAMES, renderIcon } from "../../src/utils/icons.js";

/**
 * The locals every view can assume, for suites that render a partial directly
 * with `ejs.renderFile` instead of going through the request pipeline.
 *
 * `src/middleware/viewLocals.js` is the production owner of these; this keeps
 * the two in step so a partial that uses a shared helper does not have to be
 * rendered differently in a test than it is in the app.
 */
export const sharedViewLocals = Object.freeze({
  renderIcon,
  iconNames: ICON_NAMES,
});

/** Spreads the shared locals under any per-test overrides. */
export const withSharedLocals = (locals = {}) => ({ ...sharedViewLocals, ...locals });
