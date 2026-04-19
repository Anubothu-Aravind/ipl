import { spawnSync } from "node:child_process";

const repo = "Anubothu-Aravind/ipl";
const owner = "Anubothu-Aravind";
const assignee = "Anubothu-Aravind";
const projectNumber = "3";

const ghBin =
  process.env.GH_BIN ||
  (process.platform === "win32"
    ? "C:\\Program Files\\GitHub CLI\\gh.exe"
    : "/c/Program Files/GitHub CLI/gh.exe");

const STATUS_FIELD_ID = "PVTSSF_lAHOBvihe84BVAMZzhQfAUc";
const PROJECT_ID = "PVT_kwHOBvihe84BVAMZ";
const STATUS_OPTION = {
  backlog: "f75ad846",
  ready: "08afe404",
  inProgress: "47fc9ee4",
  inReview: "4cc61d42",
  done: "98236657",
};

const plans = [
  {
    parent: 9,
    areaLabel: "area:data-layer",
    status: "inProgress",
    codeStatus: [
      "Name normalization and canonicalization were implemented in #7 (closed).",
      "Career metrics foundation exists via #5 (closed).",
      "Remaining work is extraction reliability, season aggregation hardening, team timeline validation, and lastUpdatedAt consistency.",
    ],
    tasks: [
      "Extract unique IPL players from source dataset",
      "Compute and persist season-wise player stats",
      "Generate player team history timeline (fromYear-toYear)",
      "Assign and validate current team per player",
      "Handle missing and inconsistent source fields",
      "Backfill and enforce lastUpdatedAt for players",
    ],
  },
  {
    parent: 10,
    areaLabel: "area:player-intelligence",
    status: "inProgress",
    codeStatus: [
      "Batting/bowling metric baseline and all-rounder classification were shipped in #8 (closed).",
      "Advanced scoring and ranking models are pending implementation.",
    ],
    tasks: [
      "Define and compute player impact score",
      "Define and compute player consistency score",
      "Implement ranking system (overall + role-based)",
      "Implement form score over last N matches",
      "Build player comparison engine output model",
    ],
  },
  {
    parent: 11,
    areaLabel: "area:achievements",
    status: "ready",
    codeStatus: [
      "No achievements subsystem is currently wired end-to-end.",
      "This issue is ready for implementation once schema is finalized.",
    ],
    tasks: [
      "Create achievements schema and player-achievement link table",
      "Generate batting milestones (1000/3000/5000 runs)",
      "Generate bowling milestones (50/100 wickets)",
      "Ingest seasonal awards (Orange Cap, Purple Cap, MVP, Emerging)",
      "Compute records/trophies and expose badge metadata for UI",
    ],
  },
  {
    parent: 12,
    areaLabel: "area:team-history",
    status: "inProgress",
    codeStatus: [
      "Team history data exists in raw/normalized assets but requires stronger consistency validation.",
      "Mid-season transfer treatment is not yet formalized.",
    ],
    tasks: [
      "Validate and normalize IPL franchise master records",
      "Map players to teams per season with audit checks",
      "Support optional mid-season transfer records",
      "Build consistency checks across seasons and teams",
    ],
  },
  {
    parent: 13,
    areaLabel: "area:api",
    status: "ready",
    codeStatus: [
      "Current UI queries are server-side but dedicated REST endpoints are not fully implemented.",
      "API issue is ready for endpoint implementation and optimization.",
    ],
    tasks: [
      "Implement GET /players endpoint",
      "Implement GET /players/:id endpoint",
      "Implement search + filters (role/team/stats)",
      "Implement ranking and comparison APIs",
      "Add pagination optimization and caching strategy",
    ],
  },
  {
    parent: 14,
    areaLabel: "area:room-lobby",
    status: "inProgress",
    codeStatus: [
      "Room/lobby concepts exist as open issues #1-#3 and are actively being shaped.",
      "Core host/join and readiness behavior still needs integrated implementation.",
    ],
    tasks: [
      "Implement room create/join with secure room ID/password",
      "Enforce unique CamelCase team naming rules",
      "Implement lobby state (ready/unready + host start)",
    ],
  },
  {
    parent: 15,
    areaLabel: "area:nomination",
    status: "ready",
    codeStatus: [
      "Nomination pipeline is not implemented yet.",
      "Issue is ready for development once room flow stabilizes.",
    ],
    tasks: [
      "Implement nomination phase controls and min/max limits",
      "Implement submission, lock, timeout, and force-submit behavior",
      "Implement auction pool generation (unique + weighted modes)",
    ],
  },
  {
    parent: 16,
    areaLabel: "area:auction-engine",
    status: "ready",
    codeStatus: [
      "Core auction engine has not been implemented end-to-end.",
      "Dependencies from room and nomination modules are being prepared.",
    ],
    tasks: [
      "Implement auction state initialization and player queue advancement",
      "Implement real-time bidding validation and timer resets",
      "Implement sold/unsold handling, budget updates, and end conditions",
    ],
  },
  {
    parent: 17,
    areaLabel: "area:realtime",
    status: "ready",
    codeStatus: [
      "WebSocket event transport is planned but not yet complete.",
      "Reconnect/missed-event sync logic remains pending.",
    ],
    tasks: [
      "Set up WebSocket server and room event routing",
      "Implement JOIN_ROOM and PLACE_BID event contracts",
      "Implement reconnect, missed-event sync, and ordering guarantees",
    ],
  },
  {
    parent: 18,
    areaLabel: "area:data-sync",
    status: "ready",
    codeStatus: [
      "Daily automation exists conceptually but not fully productionized.",
      "Retry and observability requirements are still open.",
    ],
    tasks: [
      "Schedule 4 AM IST sync job with environment-safe config",
      "Implement incremental stats fetch and DB update workflow",
      "Add retry policy, failure logging, and alerting hooks",
    ],
  },
  {
    parent: 19,
    areaLabel: "area:frontend",
    status: "inProgress",
    codeStatus: [
      "Player list/table UI exists, but full auction and achievements surfaces are pending.",
      "Feature work is partially implemented and needs expansion.",
    ],
    tasks: [
      "Build player cards with stats, achievements, and badges",
      "Build auction screen with bidding + timer UX",
      "Build squad dashboard + leaderboard + fast filters/search",
    ],
  },
  {
    parent: 20,
    areaLabel: "area:performance",
    status: "inProgress",
    codeStatus: [
      "Some DB indexing work has started, but concurrency/load hardening is incomplete.",
      "Monitoring and load testing remain open tasks.",
    ],
    tasks: [
      "Optimize key DB query paths and index strategy",
      "Add concurrency-safe bidding controls",
      "Run load tests and wire error logging/monitoring",
    ],
  },
];

function runGh(args) {
  const result = spawnSync(ghBin, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `gh failed: ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

function tryGh(args) {
  const result = spawnSync(ghBin, args, { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function ensureLabel(name, description, color) {
  const result = tryGh([
    "label",
    "create",
    name,
    "--repo",
    repo,
    "--description",
    description,
    "--color",
    color,
  ]);
  if (result.status !== 0) {
    const msg = `${result.stdout}\n${result.stderr}`.toLowerCase();
    if (!msg.includes("already exists")) {
      throw new Error(`Failed creating label ${name}: ${result.stderr || result.stdout}`);
    }
  }
}

function issueNumberFromUrl(url) {
  const parts = url.split("/");
  return Number(parts[parts.length - 1]);
}

function fetchExistingIssues() {
  const data = JSON.parse(
    runGh([
      "issue",
      "list",
      "--repo",
      repo,
      "--state",
      "all",
      "--limit",
      "300",
      "--json",
      "number,title,state,url",
    ]),
  );
  const byTitle = new Map(data.map((issue) => [issue.title.toLowerCase(), issue]));
  return { all: data, byTitle };
}

function fetchProjectItems() {
  const data = JSON.parse(
    runGh([
      "project",
      "item-list",
      projectNumber,
      "--owner",
      owner,
      "--limit",
      "300",
      "--format",
      "json",
    ]),
  );
  const byIssueNumber = new Map();
  for (const item of data.items || []) {
    if (item?.content?.number) {
      byIssueNumber.set(item.content.number, item.id);
    }
  }
  return byIssueNumber;
}

function setProjectStatus(itemId, statusKey) {
  runGh([
    "project",
    "item-edit",
    "--id",
    itemId,
    "--project-id",
    PROJECT_ID,
    "--field-id",
    STATUS_FIELD_ID,
    "--single-select-option-id",
    STATUS_OPTION[statusKey],
  ]);
}

function createSubIssue(parent, title, areaLabel, existingByTitle) {
  const scopedTitle = `[Parent #${parent}] ${title}`;
  const existing = existingByTitle.get(scopedTitle.toLowerCase());
  if (existing) {
    return { number: existing.number, url: existing.url, created: false, title: scopedTitle };
  }

  const body = [
    "## Scope",
    `Implement: ${title}`,
    "",
    "## Parent",
    `- Parent issue: #${parent}`,
    "",
    "## Acceptance Criteria",
    "- Implementation is merged with tests/validation where applicable",
    "- Parent issue checklist can be updated to done",
  ].join("\n");

  const url = runGh([
    "issue",
    "create",
    "--repo",
    repo,
    "--title",
    scopedTitle,
    "--body",
    body,
    "--assignee",
    assignee,
    "--label",
    "enhancement",
    "--label",
    "type:task",
    "--label",
    areaLabel,
  ]);

  return { number: issueNumberFromUrl(url), url, created: true, title: scopedTitle };
}

function postParentUpdate(parent, codeStatus, subIssues) {
  const lines = [
    "## Code Status Update",
    ...codeStatus.map((line) => `- ${line}`),
    "",
    "## Sub-Issues Tasklist",
    ...subIssues.map((issue) => `- [ ] #${issue.number} ${issue.title.replace(`[Parent #${parent}] `, "")}`),
  ];

  runGh([
    "issue",
    "comment",
    String(parent),
    "--repo",
    repo,
    "--body",
    lines.join("\n"),
  ]);
}

function main() {
  ensureLabel("type:task", "Track implementation task", "5319e7");

  const { byTitle } = fetchExistingIssues();
  const itemIds = fetchProjectItems();
  const created = [];
  const reused = [];

  for (const plan of plans) {
    const subIssues = [];
    for (const task of plan.tasks) {
      const sub = createSubIssue(plan.parent, task, plan.areaLabel, byTitle);
      subIssues.push(sub);
      if (sub.created) {
        created.push(sub);
        byTitle.set(sub.title.toLowerCase(), { number: sub.number, url: sub.url, title: sub.title });
      } else {
        reused.push(sub);
      }
    }

    postParentUpdate(plan.parent, plan.codeStatus, subIssues);

    const itemId = itemIds.get(plan.parent);
    if (itemId) {
      setProjectStatus(itemId, plan.status);
    }
  }

  const output = {
    createdCount: created.length,
    reusedCount: reused.length,
    created: created.map((x) => ({ number: x.number, title: x.title, url: x.url })),
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

try {
  main();
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
}
