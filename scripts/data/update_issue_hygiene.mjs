import { spawnSync } from "node:child_process";

const repo = "Anubothu-Aravind/ipl";
const ghBin =
  process.env.GH_BIN ||
  (process.platform === "win32"
    ? "C:\\Program Files\\GitHub CLI\\gh.exe"
    : "/c/Program Files/GitHub CLI/gh.exe");

const MILESTONE_TITLE = "Roadmap Wave 1";
const MILESTONE_DESCRIPTION =
  "Core roadmap execution covering data foundation, API, auction core, realtime, and frontend milestones.";
const ISSUE_START = 9;
const ISSUE_END = 66;

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

function ensureMilestone() {
  const existing = JSON.parse(
    runGh(["api", `repos/${repo}/milestones?state=all`]),
  );

  const found = existing.find((m) => m.title === MILESTONE_TITLE);
  if (found) {
    return found.number;
  }

  const created = JSON.parse(
    runGh([
      "api",
      `repos/${repo}/milestones`,
      "-X",
      "POST",
      "-f",
      `title=${MILESTONE_TITLE}`,
      "-f",
      `description=${MILESTONE_DESCRIPTION}`,
    ]),
  );
  return created.number;
}

function assignMilestone(issueNumber, milestoneNumber) {
  runGh([
    "api",
    `repos/${repo}/issues/${issueNumber}`,
    "-X",
    "PATCH",
    "-f",
    `milestone=${milestoneNumber}`,
  ]);
}

function fetchIssues() {
  return JSON.parse(
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
      "number,title,body,url",
    ]),
  );
}

function buildParentToChildrenMap(issues) {
  const map = new Map();
  const re = /^\[Parent #(\d+)\]\s+/;

  for (const issue of issues) {
    const match = issue.title.match(re);
    if (!match) {
      continue;
    }

    const parent = Number(match[1]);
    if (!map.has(parent)) {
      map.set(parent, []);
    }
    map.get(parent).push(issue);
  }

  for (const [, list] of map.entries()) {
    list.sort((a, b) => a.number - b.number);
  }

  return map;
}

function updateParentBody(parentIssueNumber, currentBody, childIssues) {
  const startMarker = "## Sub-Issues";
  const endMarker = "## Linked PRs";

  const taskLines = childIssues.map((child) => {
    const taskTitle = child.title.replace(/^\[Parent #\d+\]\s+/, "");
    return `- [ ] #${child.number} ${taskTitle}`;
  });

  const subIssueSection = [startMarker, ...taskLines, ""].join("\n");

  let nextBody = currentBody;

  if (nextBody.includes(startMarker)) {
    const startIndex = nextBody.indexOf(startMarker);
    const endIndex = nextBody.indexOf(endMarker);

    if (endIndex > startIndex) {
      nextBody =
        nextBody.slice(0, startIndex) +
        subIssueSection +
        nextBody.slice(endIndex);
    } else {
      nextBody = nextBody.slice(0, startIndex) + subIssueSection;
    }
  } else if (nextBody.includes(endMarker)) {
    const insertIndex = nextBody.indexOf(endMarker);
    nextBody =
      nextBody.slice(0, insertIndex) +
      subIssueSection +
      nextBody.slice(insertIndex);
  } else {
    const trimmed = nextBody.trimEnd();
    nextBody = `${trimmed}\n\n${subIssueSection}${endMarker}\n- TBD (add PR link(s) here as they are opened)\n`;
  }

  const editRes = tryGh([
    "issue",
    "edit",
    String(parentIssueNumber),
    "--repo",
    repo,
    "--body",
    nextBody,
  ]);

  if (editRes.status !== 0) {
    throw new Error(
      `Failed updating issue #${parentIssueNumber}: ${editRes.stderr || editRes.stdout}`,
    );
  }
}

function main() {
  const milestoneNumber = ensureMilestone();

  for (let issue = ISSUE_START; issue <= ISSUE_END; issue += 1) {
    assignMilestone(issue, milestoneNumber);
  }

  const issues = fetchIssues();
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  const parentToChildren = buildParentToChildrenMap(issues);

  for (const [parent, children] of parentToChildren.entries()) {
    if (parent < 9 || parent > 20) {
      continue;
    }

    const parentIssue = byNumber.get(parent);
    if (!parentIssue) {
      continue;
    }

    updateParentBody(parent, parentIssue.body || "", children);
  }

  process.stdout.write(
    JSON.stringify(
      {
        milestone: { title: MILESTONE_TITLE, number: milestoneNumber },
        milestoneAssignedRange: [ISSUE_START, ISSUE_END],
        parentsUpdated: Array.from(parentToChildren.keys()).filter(
          (n) => n >= 9 && n <= 20,
        ),
      },
      null,
      2,
    ) + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
}
