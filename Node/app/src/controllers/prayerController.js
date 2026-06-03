import { addPrayer, getUserPrayers, reactToPrayer, removePrayer, removePrayerReaction } from "../services/prayerService.js";
import { AppError } from "../utils/appError.js";

export async function listPrayers(req, res) {
  const prayers = await getUserPrayers(req.user.id);
  return res.json({ prayers });
}

export async function postPrayer(req, res) {
  if (req.validationErrors) {
    return res.status(400).json({ errors: req.validationErrors });
  }

  const prayer = await addPrayer({
    userId: req.user.id,
    prayer: req.validatedBody.prayer,
  });

  return res.status(201).json({ prayer });
}

export async function deletePrayer(req, res) {
  try {
    await removePrayer({
      id: req.params.id,
      userId: req.user.id,
    });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    throw error;
  }
}

export async function postPrayerReaction(req, res) {
  if (req.validationErrors) {
    return res.status(400).json({ errors: req.validationErrors });
  }

  try {
    const prayer = await reactToPrayer({
      id: req.params.id,
      userId: req.user.id,
      emoji: req.validatedBody.emoji,
    });

    return res.json({ prayer });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    throw error;
  }
}

export async function deletePrayerReaction(req, res) {
  try {
    const prayer = await removePrayerReaction({
      id: req.params.id,
      userId: req.user.id,
    });

    return res.json({ prayer });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    throw error;
  }
}
