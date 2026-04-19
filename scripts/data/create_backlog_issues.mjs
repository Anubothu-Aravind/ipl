import { writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const repo = "Anubothu-Aravind/ipl";
const owner = "Anubothu-Aravind";
const assignee = "Anubothu-Aravind";
const projectNumber = "3";
const ghBin =
  process.env.GH_BIN ||
  (process.platform === "win32"
    ? "C:\\Program Files\\GitHub CLI\\gh.exe"
    : "/c/Program Files/GitHub CLI/gh.exe");

const labels = [
  ["type:feature", "New feature work"],
  ["area:data-layer", "Data ingestion/modeling/migrations"],
  ["area:player-intelligence", "Player metrics, scoring, ranking"],
  ["area:achievements", "Milestones, awards, badges"],
  ["area:team-history", "Teams and player-team timelines"],
  ["area:api", "Backend/API endpoints and query layer"],
  ["area:room-lobby", "Room creation and lobby flows"],
  ["area:nomination", "Nomination workflows"],
  ["area:auction-engine", "Core auction state and bidding"],
  ["area:realtime", "WebSocket real-time events/sync"],
  ["area:data-sync", "Scheduled data sync and resilience"],
  ["area:frontend", "Frontend pages/components and UX"],
  ["area:performance", "Performance, load, infra hardening"],
];

const issues = [
  {
    title: "Data Layer Foundation: extraction, normalization, indexing, and reliability",
    areaLabel: "area:data-layer",
    body: `## Objective
Implement the core data foundation for IPL player intelligence.

## Scope
- Extract unique IPL players from dataset
- Compute season-wise player stats (year-wise aggregation)
- Generate player team history (fromYear -> toYear)
- Identify and assign current team for each player
- Handle missing and inconsistent data fields
- Add indexing for player search performance
- Add lastUpdatedAt tracking for players

## Notes
- Existing related issues: #4, #5, #6, #7, #8
- Reuse canonical player identity strategy (players.id as source-of-truth)
- All schema changes must be migration-based and backward-safe

## Acceptance Criteria
- Data model supports fast player lookup and season/history analytics
- Ingestion pipeline handles messy input safely
- DB indexes verified for key query paths
- lastUpdatedAt is populated and maintained consistently
`,
  },
  {
    title: "Player Intelligence Engine: scoring, ranking, form, and comparison",
    areaLabel: "area:player-intelligence",
    body: `## Objective
Build advanced player intelligence beyond base batting/bowling aggregates.

## Scope
- Compute player impact score
- Compute player consistency score
- Build player ranking system (overall + role-based)
- Add form score (last N matches)
- Create player comparison engine

## Notes
- Existing related issue: #8 (core metrics + all-rounder classification)
- New logic should build on canonical player records

## Acceptance Criteria
- Scores and rankings are deterministic and explainable
- Role-aware leaderboards are queryable by API
- Comparison output supports UI-ready consumption
`,
  },
  {
    title: "Achievements System: milestones, awards, records, and badges",
    areaLabel: "area:achievements",
    body: `## Objective
Design and implement a robust achievements subsystem for IPL players.

## Scope
- Generate batting milestones (1000, 3000, 5000 runs)
- Generate bowling milestones (50, 100 wickets)
- Add Orange Cap winners by season
- Add Purple Cap winners by season
- Add MVP / Emerging Player awards
- Detect and store player records (highest score, best bowling)
- Assign IPL trophies to players (team-based wins)
- Build achievements table and linking logic
- Create achievement badges for UI

## Acceptance Criteria
- Achievements are reproducible from source data
- Badge-ready achievement payload is available to frontend
- Historical season award data is queryable and consistent
`,
  },
  {
    title: "Team & History Module: franchises, season mapping, and transfer handling",
    areaLabel: "area:team-history",
    body: `## Objective
Strengthen team and player-team timeline fidelity across seasons.

## Scope
- Create teams table (IPL franchises) [validate completeness]
- Map players to teams per season
- Generate team history timeline for players
- Handle mid-season transfers (optional)
- Validate team consistency across seasons

## Notes
- Existing related data exists; this issue validates and hardens it

## Acceptance Criteria
- Season-to-team mapping is complete and auditable
- Timeline API inputs are consistent for all active/historic players
`,
  },
  {
    title: "API Layer: players read APIs, filters, ranking, comparison, and performance",
    areaLabel: "area:api",
    body: `## Objective
Deliver production-ready player APIs for search, filtering, and intelligence views.

## Scope
- Build GET /players endpoint
- Build GET /players/:id endpoint
- Build player search API
- Build player filtering API (role, team, stats)
- Build top players API (ranking-based)
- Build player comparison API
- Add pagination and query optimization
- Add caching for player data

## Acceptance Criteria
- APIs are stable, paginated, and filterable
- Query plans are optimized for expected traffic
- Caching reduces repetitive DB load without stale data bugs
`,
  },
  {
    title: "Room & Lobby System: create/join flow, constraints, and readiness",
    areaLabel: "area:room-lobby",
    body: `## Objective
Implement room and lobby foundations for multiplayer auction setup.

## Scope
- Create room (host flow)
- Generate room ID and password
- Join room via link + password
- Enforce unique CamelCase team names
- Build lobby UI state (players list, ready status)
- Add ready/unready toggle
- Start game trigger (host control)

## Notes
- Existing related issues: #1, #2, #3

## Acceptance Criteria
- Host and participants can consistently create/join/manage lobby state
- Name/password constraints are enforced server-side
`,
  },
  {
    title: "Nomination System: constraints, lock-in, and auction pool generation",
    areaLabel: "area:nomination",
    body: `## Objective
Build nomination workflow preceding auction.

## Scope
- Start nomination phase (host action)
- Set min/max nomination limits
- Build player selection UI (search + select)
- Submit nomination list
- Lock nominations after submission
- Handle incomplete submissions (timeout/force submit)
- Generate auction pool (unique mode)
- Generate auction pool (weighted mode)

## Acceptance Criteria
- Nominations are validated and persisted safely
- Auction pool generation is deterministic per configured mode
`,
  },
  {
    title: "Auction Engine Core: queue, bidding, validation, assignment, and closure",
    areaLabel: "area:auction-engine",
    body: `## Objective
Implement the real-time auction lifecycle end-to-end.

## Scope
- Initialize auction state
- Load next player from queue
- Implement bidding system (real-time)
- Validate bids (budget constraints)
- Add timer with reset on new bid
- Assign player to highest bidder
- Update team squad and budget
- Handle unsold players
- Move to next player automatically
- End auction condition (all players / squads full)

## Acceptance Criteria
- Auction flow is consistent under concurrent bidding
- State transitions are robust and recoverable
`,
  },
  {
    title: "Real-Time System: WebSocket events, sync, and reconnect reliability",
    areaLabel: "area:realtime",
    body: `## Objective
Deliver robust real-time transport for auction/lobby events.

## Scope
- Setup WebSocket server
- Handle JOIN_ROOM event
- Handle PLACE_BID event
- Broadcast bid updates
- Broadcast timer updates
- Broadcast player sold event
- Handle disconnect/reconnect
- Sync missed events

## Acceptance Criteria
- Clients stay synchronized after reconnect
- Event ordering and delivery are reliable for critical auction actions
`,
  },
  {
    title: "Daily Data Sync: CRON, incremental updates, and failure handling",
    areaLabel: "area:data-sync",
    body: `## Objective
Automate nightly player data refresh safely.

## Scope
- Setup CRON job (4 AM IST)
- Fetch latest player stats (API/scrape)
- Update database with new stats
- Log sync results
- Handle API failures and retries

## Acceptance Criteria
- Sync runs unattended with observability
- Failures are retried and reported without corrupting data
`,
  },
  {
    title: "Frontend Features: player intelligence views, auction UI, and optimization",
    areaLabel: "area:frontend",
    body: `## Objective
Build UX layer for player intelligence and auction operations.

## Scope
- Build player card UI (stats + achievements)
- Build auction screen UI (bidding + timer)
- Build squad dashboard
- Build leaderboard view
- Show badges (achievements, form, top player)
- Add search + filters UI
- Optimize UI performance

## Acceptance Criteria
- Frontend surfaces critical data clearly on desktop + mobile
- Search/filter interactions are fast and accessible
`,
  },
  {
    title: "Performance & Infra Hardening: query tuning, concurrency safety, and monitoring",
    areaLabel: "area:performance",
    body: `## Objective
Harden the system for production-grade load and reliability.

## Scope
- Optimize DB queries (indexes, joins)
- Add caching layer (Redis optional)
- Handle concurrent bidding safely
- Load testing for auction system
- Error logging and monitoring

## Acceptance Criteria
- System remains stable under expected peak load
- Failures are observable and actionable
- Race conditions in auction flow are prevented
`,
  },
];

function runGh(args) {
  const result = spawnSync(ghBin, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `gh failed: ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

async function ensureLabels() {
  for (const [name, description] of labels) {
    const result = spawnSync(ghBin, ["label", "create", name, "--repo", repo, "--description", description, "--color", "1f6feb"], {
      encoding: "utf8",
    });

    if (result.status !== 0) {
      const stderr = (result.stderr || "").toLowerCase();
      if (!stderr.includes("already exists")) {
        throw new Error(result.stderr || result.stdout || `Failed creating label ${name}`);
      }
    }
  }
}

async function createIssues() {
  await mkdir(".tmp_issue_bodies", { recursive: true });

  const existingIssues = JSON.parse(
    runGh([
      "issue",
      "list",
      "--repo",
      repo,
      "--limit",
      "200",
      "--state",
      "all",
      "--json",
      "title,url,state,number",
    ]),
  );
  const existingByTitle = new Map(
    existingIssues.map((item) => [item.title.toLowerCase(), item]),
  );

  const created = [];
  const skipped = [];
  for (let index = 0; index < issues.length; index += 1) {
    const item = issues[index];
    const existing = existingByTitle.get(item.title.toLowerCase());
    if (existing) {
      skipped.push({
        title: item.title,
        reason: `Already tracked as #${existing.number} (${existing.state.toLowerCase()})`,
        url: existing.url,
      });
      continue;
    }

    const bodyPath = join(".tmp_issue_bodies", `issue_${index + 1}.md`);
    await writeFile(bodyPath, item.body, "utf8");

    const url = runGh([
      "issue",
      "create",
      "--repo",
      repo,
      "--title",
      item.title,
      "--body-file",
      bodyPath,
      "--assignee",
      assignee,
      "--label",
      "type:feature",
      "--label",
      item.areaLabel,
      "--label",
      "enhancement",
    ]);

    runGh([
      "project",
      "item-add",
      projectNumber,
      "--owner",
      owner,
      "--url",
      url,
    ]);

    created.push({ title: item.title, url });
  }

  return { created, skipped };
}

async function main() {
  await ensureLabels();
  const result = await createIssues();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
});
