import { getBibleBooks } from "../data/bible.js";
import { getMissedActivities } from "../services/missedActivityService.js";
import {
  createMissedReadingCheckIn,
  createTodayReadingCheckIn,
  getReadingCheckInStatus,
  updateTodayReadingCheckIn,
} from "../services/readingCheckInService.js";

export async function getCurrentReadingCheckInStatus(req, res) {
  const status = await getReadingCheckInStatus(req.user.id, req.user.timezone);
  return res.json(status);
}

export async function createCurrentReadingCheckIn(req, res) {
  const status = await createTodayReadingCheckIn(req.user.id, req.user.timezone, req.validatedBody);
  return res.status(201).json(status);
}

export async function updateCurrentReadingCheckIn(req, res) {
  const status = await updateTodayReadingCheckIn(req.user.id, req.user.timezone, req.validatedBody);
  return res.json(status);
}

export async function createMissedReadingCheckInEntry(req, res) {
  const reading = await createMissedReadingCheckIn(req.user.id, req.user.timezone, req.validatedBody);
  const missedActivities = await getMissedActivities(req.user.id, req.user.timezone);

  return res.status(201).json({ reading, missedActivities });
}

export function getBibleBookMetadata(req, res) {
  res.set("Cache-Control", "private, max-age=86400");
  return res.json({ books: getBibleBooks() });
}
