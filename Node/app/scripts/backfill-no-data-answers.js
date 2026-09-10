import { argv } from "node:process";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/prisma/client.js";
import {
  DEFAULT_THROUGH_DATE_KEY,
  backfillNoDataAnswers,
} from "../src/services/noDataBackfillService.js";
import { isCalendarDateKey } from "../src/utils/dateKey.js";

const USAGE = `Usage: node scripts/backfill-no-data-answers.js [options]

Records "No data" for every Bible and Tasks day a user never answered, from the
day their account was created through the cutoff date. Days that already hold an
answer are left untouched, so the script is safe to run more than once.

Options:
  --through=YYYY-MM-DD  Last day to fill (default ${DEFAULT_THROUGH_DATE_KEY}).
                        Never fills today or any future day.
  --user=1,2            Only these account ids (default: every account).
  --dry-run             Report what would be written without writing it.
  --help                Show this message.
`;

export function parseArgs(argv) {
  const options = { requestedDateKey: DEFAULT_THROUGH_DATE_KEY, userIds: null, dryRun: false, help: false };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--through=")) {
      const value = arg.slice("--through=".length);
      if (!isCalendarDateKey(value)) throw new Error(`--through must be a YYYY-MM-DD date, got "${value}"`);
      options.requestedDateKey = value;
    } else if (arg.startsWith("--user=")) {
      const ids = arg
        .slice("--user=".length)
        .split(",")
        .map((value) => Number(value.trim()));
      if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw new Error(`--user must be a comma-separated list of account ids, got "${arg}"`);
      }
      options.userIds = ids;
    } else {
      throw new Error(`Unknown option "${arg}"`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return;
  }

  console.log(
    `Filling missing Bible and Tasks answers with "No data" through ${options.requestedDateKey}` +
      `${options.dryRun ? " (dry run, nothing is written)" : ""}...`,
  );

  const summary = await backfillNoDataAnswers({
    requestedDateKey: options.requestedDateKey,
    userIds: options.userIds,
    dryRun: options.dryRun,
    onUser: ({ plan, written }) => {
      if (!written.reading && !written.goals) return;
      console.log(
        `  user ${plan.userId} (${plan.name}) ${plan.createdDateKey} -> ${plan.throughDateKey}: ` +
          `${written.reading} Bible day(s), ${written.goals} Tasks day(s)`,
      );
    },
  });

  console.log(
    `${summary.dryRun ? "Would fill" : "Filled"} ${summary.reading} Bible day(s) and ` +
      `${summary.goals} Tasks day(s) across ${summary.users} account(s).`,
  );
}

const isDirectRun = argv[1] && import.meta.url === pathToFileURL(argv[1]).href;

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("Backfill failed:", error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
