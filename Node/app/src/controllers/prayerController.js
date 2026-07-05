import { addPrayer, getUserPrayers, markPrayerAnswered, reactToPrayer, removePrayerReaction } from "../services/prayerService.js";

export async function listPrayers(req, res) {
  const prayerLists = await getUserPrayers(req.user.id);
  return res.json({ prayerLists });
}

export async function postPrayer(req, res) {
  const prayer = await addPrayer({
    userId: req.user.id,
    prayer: req.validatedBody.prayer,
  });

  return res.status(201).json({ prayer });
}

export async function answerPrayer(req, res) {
  await markPrayerAnswered({
    id: req.params.id,
    userId: req.user.id,
  });

  return res.json({ success: true });
}

export async function postPrayerReaction(req, res) {
  const prayer = await reactToPrayer({
    id: req.params.id,
    userId: req.user.id,
    emoji: req.validatedBody.emoji,
  });

  return res.json({ prayer });
}

export async function deletePrayerReaction(req, res) {
  const prayer = await removePrayerReaction({
    id: req.params.id,
    userId: req.user.id,
  });

  return res.json({ prayer });
}
