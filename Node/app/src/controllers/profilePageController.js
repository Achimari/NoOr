import { getOwnProfile, getPublicProfile, getTodayActivity } from "../services/profileService.js";
import { AppError } from "../utils/appError.js";

function renderNotFound(res) {
  return res.status(404).render("pages/not-found", {
    pageId: "not-found",
    title: res.locals.t("notFound.title"),
  });
}

export async function renderOwnProfile(req, res) {
  const [profile, today] = await Promise.all([
    getOwnProfile(req.user.id),
    getTodayActivity(req.user.id, req.user.id),
  ]);

  return res.render("pages/profile", {
    pageId: "profile",
    title: "My Profile",
    profile,
    today,
  });
}

export async function renderPublicProfile(req, res) {
  if (Number(req.params.id) === req.user.id) {
    return renderOwnProfile(req, res);
  }

  try {
    const [profile, today] = await Promise.all([
      getPublicProfile(req.user.id, req.params.id),
      getTodayActivity(req.user.id, req.params.id),
    ]);

    return res.render("pages/profile", {
      pageId: "profile",
      title: profile.name,
      profile,
      today,
    });
  } catch (error) {
    if (error instanceof AppError) return renderNotFound(res);
    throw error;
  }
}

export function redirectLegacyCustomer(req, res) {
  return res.redirect(302, `/profile/${encodeURIComponent(req.params.id)}`);
}

export function redirectExploreToProfile(req, res) {
  return res.redirect(302, "/profile#spells");
}
