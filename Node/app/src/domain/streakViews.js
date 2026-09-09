export const STREAK_VIEWS = [
  {
    slug: "strong",
    key: "recovery",
    label: "Strong",
    caption: "Strong streak leaderboard, ranked by current streak",
    empty: "No Strong streaks yet.",
    emptyHint: "Answer today's question to start the first streak.",
  },
  {
    slug: "bible",
    key: "reading",
    label: "Bible",
    caption: "Bible reading streak leaderboard, ranked by current streak",
    empty: "No reading streaks yet.",
    emptyHint: "Answer the daily reading check to start the first streak.",
  },
  {
    slug: "tasks",
    key: "goals",
    label: "Tasks",
    caption: "Tasks streak leaderboard, ranked by current streak",
    empty: "No completed-task streaks yet.",
    emptyHint: "Complete every task you plan for a day to start a streak.",
  },
];

const BY_SLUG = new Map(STREAK_VIEWS.map((view) => [view.slug, view]));

export function resolveStreakView(slug) {
  return BY_SLUG.get(String(slug ?? "").trim().toLowerCase()) || STREAK_VIEWS[0];
}
