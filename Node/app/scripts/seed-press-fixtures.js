#!/usr/bin/env node
/* Seed a deterministic, isolated fixture account for visual capture.
 *
 * This exists so Help screenshots and redesign evidence are taken from a real
 * signed-in browser session without ever touching a real account or the
 * development database. It drives the application's own HTTP API, so every
 * record it creates goes through the same validation and domain rules a user
 * would, and nothing is written straight into Postgres behind the app's back.
 *
 * It refuses to run against anything but a fixture database, and it only ever
 * creates rows. It never deletes, resets or migrates.
 *
 * Usage — see docs/sacred-press-redesign/CAPTURE.md for the full recipe:
 *
 *     DATABASE_URL=postgresql://…/fixtures_db  PORT=3021 \
 *     TELEGRAM_BOT_TOKEN= NODE_ENV=development node src/server.js &
 *     node scripts/seed-press-fixtures.js http://127.0.0.1:3021
 */

const BASE = process.argv[2] || "http://127.0.0.1:3021";

export const FIXTURE_USER = { name: "Press Fixture", password: "press-fixture-pw" };
export const FIXTURE_PEER = { name: "Quiet Reader", password: "press-fixture-pw" };

async function api(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(new URL(path, BASE), {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = response.headers.getSetCookie?.() || [];
  let payload = null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) payload = await response.json().catch(() => null);
  return { status: response.status, payload, setCookie };
}

function cookieFrom(setCookie) {
  return setCookie.map((line) => line.split(";")[0]).join("; ");
}

/** Registers the account if it is new, then signs in and returns its cookie. */
async function signIn({ name, password }) {
  await api("/auth/register", { method: "POST", body: { name, password, passwordConfirmation: password } });
  const login = await api("/auth/login", { method: "POST", body: { name, password } });
  if (!login.setCookie.length) throw new Error(`could not sign in as ${name} (${login.status})`);
  return cookieFrom(login.setCookie);
}

/** Best-effort: a fixture that already carries this state must not be an error. */
async function seed(label, path, options) {
  const result = await api(path, options);
  const ok = result.status >= 200 && result.status < 400;
  console.log(`  ${ok ? "ok  " : "skip"}  ${label}${ok ? "" : `  (${result.status})`}`);
  return result;
}

async function main() {
  if (!/fixture/i.test(process.env.DATABASE_URL || "") && !process.env.ALLOW_NON_FIXTURE_DB) {
    throw new Error(
      "refusing to seed: DATABASE_URL does not name a fixture database. " +
        "Point it at fixtures_db, or set ALLOW_NON_FIXTURE_DB=1 deliberately.",
    );
  }

  console.log(`seeding fixtures against ${BASE}`);

  // The peer exists so the community feed and the leaderboard have a second
  // real member, and so the battle *entry* screen can be captured from an
  // account that is not already mid-fight.
  const peer = await signIn(FIXTURE_PEER);
  await seed("peer prayer", "/api/prayers", {
    method: "POST",
    cookie: peer,
    body: { prayer: "Please pray for steadiness in a long week of night shifts." },
  });
  await seed("peer allocation", "/api/game/allocation", {
    method: "POST",
    cookie: peer,
    body: { strength: 4, dexterity: 3, intelligence: 3 },
  });

  const cookie = await signIn(FIXTURE_USER);
  console.log("signed in as the fixture account");

  // Today: a recorded Yes, a read passage with a reflection, and three tasks —
  // one of them completed, so the check-in screenshot shows both states.
  await seed("check-in answered Yes", "/api/check-in/today", {
    method: "PATCH",
    cookie,
    body: { answer: "YES" },
  });
  await seed("reading check-in", "/api/reading-check-in/today", {
    method: "POST",
    cookie,
    body: {
      answer: "YES",
      passages: [{ book: "psalms", chapter: 23, startVerse: 1, endVerse: 6 }],
      reflection: "Read slowly this morning and sat with the last two verses.",
    },
  });

  for (const text of ["Call my brother", "Twenty minutes of quiet", "Finish the letter"]) {
    await seed(`task “${text}”`, "/api/daily-goals/today", { method: "POST", cookie, body: { text } });
  }

  // One task done and the rest pending, so the Today capture shows both states.
  const today = await api("/api/daily-goals/today", { cookie });
  const first = (today.payload?.goals || [])[0];
  if (first && !first.completed) {
    await seed("first task completed", `/api/daily-goals/${first.id}/completion`, {
      method: "PATCH",
      cookie,
      body: { completed: true },
    });
  }

  await seed("own prayer", "/api/prayers", {
    method: "POST",
    cookie,
    body: { prayer: "Praying for patience with my father while he is unwell." },
  });

  // Character sheet: spend the starting points so Profile shows real values,
  // and unlock whatever spells those points make available.
  await seed("stat allocation", "/api/game/allocation", {
    method: "POST",
    cookie,
    body: { strength: 4, dexterity: 3, intelligence: 3 },
  });

  const spells = await api("/api/spells", { cookie });
  for (const spell of spells.payload?.spells || []) {
    if (spell.unlocked || !spell.available) continue;
    await seed(`spell ${spell.key}`, `/api/spells/${spell.key}/unlock`, { method: "POST", cookie });
  }

  // An active PvE battle, so the battle captures show a real mid-fight HUD.
  const encounters = await api("/api/pve/encounters", { cookie });
  const list = encounters.payload?.pve?.encounters || encounters.payload?.encounters || [];
  const active = list.find((entry) => entry.isActive);
  const encounter = active || list.find((entry) => entry.unlocked && !entry.completed);
  if (active) {
    console.log(`  ok    battle vs ${active.key} (already in progress)`);
  } else if (encounter) {
    await seed(`battle vs ${encounter.key}`, `/api/pve/encounters/${encounter.key}/start`, {
      method: "POST",
      cookie,
    });
  } else {
    console.log("  skip  battle (no available encounter)");
  }

  console.log("\nfixtures ready. Sign in as:");
  console.log(`  ${FIXTURE_USER.name} / ${FIXTURE_USER.password}   — Today, Profile, Spells, an active battle`);
  console.log(`  ${FIXTURE_PEER.name} / ${FIXTURE_PEER.password}   — the battle entry screen, no fight running`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
