import { getMissedActivities } from "../services/missedActivityService.js";
import { AppError } from "../utils/appError.js";
import { missedActivitiesPageSchema } from "../validators/missedActivityValidators.js";

export async function getCurrentMissedActivities(req, res) {
  const page = missedActivitiesPageSchema.safeParse(req.query);
  if (!page.success) {
    throw new AppError(page.error.issues[0]?.message || "Choose a valid missed-activity page", 400);
  }

  const missedActivities = await getMissedActivities(req.user.id, req.user.timezone, page.data);

  return res.json(missedActivities);
}
