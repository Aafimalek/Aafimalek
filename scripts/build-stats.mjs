// Builds the dashboard-style stat cards from live GitHub data.
// Run from the repo root: node scripts/build-stats.mjs
// Uses $GITHUB_TOKEN (set in Actions) or falls back to `gh auth token` locally.
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const LOGIN = "Aafimalek";
const DAYS = 90;
const token = process.env.GITHUB_TOKEN || execSync("gh auth token").toString().trim();

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-stats" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// ------------------------------------------------------------------ data
const now = new Date();
const dayKey = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n));
const from90 = daysAgo(DAYS - 1);
const from365 = daysAgo(364);

const base = await gql(
  `query($login:String!, $from90:DateTime!, $from365:DateTime!, $to:DateTime!) {
    user(login:$login) {
      recent: contributionsCollection(from:$from90, to:$to) {
        totalCommitContributions totalPullRequestContributions totalIssueContributions
        totalPullRequestReviewContributions restrictedContributionsCount totalRepositoriesWithContributedCommits
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      }
      year: contributionsCollection(from:$from365, to:$to) {
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      }
      merged: pullRequests(states:MERGED) { totalCount }
      repositories(ownerAffiliations:OWNER, isFork:false, first:100) {
        totalCount
        nodes { stargazerCount languages(first:10, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name color } } } }
      }
    }
  }`,
  { login: LOGIN, from90: from90.toISOString(), from365: from365.toISOString(), to: now.toISOString() },
);
const user = base.user;

const prs = [];
for (let cursor = null; ;) {
  const d = await gql(
    `query($login:String!, $cursor:String) { user(login:$login) { pullRequests(first:100, after:$cursor, orderBy:{field:CREATED_AT, direction:DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes { createdAt mergedAt state additions repository { nameWithOwner isPrivate stargazerCount owner { login avatarUrl } } }
    } } }`,
    { login: LOGIN, cursor },
  );
  const page = d.user.pullRequests;
  prs.push(...page.nodes.filter((p) => !p.repository.isPrivate)); // public work only
  if (!page.pageInfo.hasNextPage) break;
  cursor = page.pageInfo.endCursor;
}

// daily series for the last 90 days
const dates = Array.from({ length: DAYS }, (_, i) => dayKey(daysAgo(DAYS - 1 - i)));
const idx = Object.fromEntries(dates.map((d, i) => [d, i]));
const total = Array(DAYS).fill(0), opened = Array(DAYS).fill(0), mergedS = Array(DAYS).fill(0);
for (const w of user.recent.contributionCalendar.weeks)
  for (const d of w.contributionDays) if (d.date in idx) total[idx[d.date]] = d.contributionCount;
for (const p of prs) {
  const c = p.createdAt.slice(0, 10), m = p.mergedAt?.slice(0, 10);
  if (c in idx) opened[idx[c]]++;
  if (m && m in idx) mergedS[idx[m]]++;
}

// streaks over the last year
const yearDays = user.year.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
let longest = 0, run = 0;
for (const d of yearDays) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }

const r = user.recent;
const recentTotal = r.contributionCalendar.totalContributions;
const prs90 = opened.reduce((a, b) => a + b, 0);
const merged90 = mergedS.reduce((a, b) => a + b, 0);
const ext = prs.filter((p) => p.repository.owner.login !== LOGIN);
const extRepos = {};
for (const p of ext) {
  const k = p.repository.nameWithOwner;
  extRepos[k] ??= { name: k, owner: p.repository.owner, stars: p.repository.stargazerCount, n: 0, merged: 0, open: 0, adds: 0 };
  const e = extRepos[k];
  e.n++; if (p.mergedAt) e.merged++; if (p.state === "OPEN") e.open++; e.adds += p.additions;
}
const repoList = Object.values(extRepos).sort((a, b) => b.n - a.n || b.stars - a.stars);
const combinedStars = repoList.reduce((a, e) => a + e.stars, 0);
const mergedAll = prs.filter((p) => p.mergedAt).length;
const extMerged = ext.filter((p) => p.mergedAt).length;
const extOpen = ext.filter((p) => p.state === "OPEN").length;

const langs = {};
let ownStars = 0;
for (const repo of user.repositories.nodes) {
  ownStars += repo.stargazerCount;
  for (const e of repo.languages.edges) {
    langs[e.node.name] ??= { name: e.node.name, size: 0, color: e.node.color || "#8b8b8b" };
    langs[e.node.name].size += e.size;
  }
}
const langTotal = Object.values(langs).reduce((a, l) => a + l.size, 0);
const langTop = Object.values(langs).sort((a, b) => b.size - a.size).slice(0, 7);
const otherSize = langTotal - langTop.reduce((a, l) => a + l.size, 0);
const langRows = [...langTop, { name: "Other", size: otherSize, color: "#6e6a73" }];

const avatars = {};
for (const e of repoList.slice(0, 8)) {
  const url = e.owner.avatarUrl + (e.owner.avatarUrl.includes("?") ? "&" : "?") + "s=56";
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  avatars[e.name] = `data:image/png;base64,${buf.toString("base64")}`;
}

// ------------------------------------------------------------------ helpers
const themes = {
  dark: {
    bg: "#1d1b20", card: "#232026", border: "#353139", text: "#f3f1f4", muted: "#a19da6", faint: "#6e6a73",
    grid: "#333037", main: "#f3f1f4", mainFill: "#f3f1f4", accent: "#d97757", blue: "#5aa9e6", pill: "#2c2930", pillOn: "#3a363e",
    track: "#3a363e",
  },
  light: {
    bg: "#ffffff", card: "#f7f6f8", border: "#e3e0e6", text: "#1d1b20", muted: "#65616a", faint: "#9c98a1",
    grid: "#ebe8ee", main: "#2a272d", mainFill: "#2a272d", accent: "#d0643f", blue: "#2f7fc1", pill: "#f1eff3", pillOn: "#ffffff",
    track: "#e8e5eb",
  },
};
const FONT = `'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k" : String(n));
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const pctStr = (p) => (p > 0 && p < 0.1 ? "<0.1%" : p.toFixed(1) + "%");
const textW = (s, size) => s.length * size * 0.53; // rough sans-serif width
const month = (d) => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();

function smooth(arr, radius = 2) {
  return arr.map((_, i) => {
    let s = 0, w = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= arr.length) continue;
      const wt = radius + 1 - Math.abs(k);
      s += arr[j] * wt; w += wt;
    }
    return s / w;
  });
}

// Catmull-Rom spline through points, control points clamped to the baseline
function spline(pts, baseY) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(baseY, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(baseY, p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const niceMax = (v) => {
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (m * step >= v) return m * step;
  return 10 * step;
};

function frame(t, W, H, crumbs, right) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>
  .fade { opacity: 0; animation: fade .6s ease-out forwards; }
  @keyframes fade { to { opacity: 1; } }
  .draw { stroke-dasharray: 2400; stroke-dashoffset: 2400; animation: draw 1.8s ease-out forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .grow { transform-box: fill-box; transform-origin: left center; transform: scaleX(0); animation: grow .9s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes grow { to { transform: scaleX(1); } }
</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${t.bg}" stroke="${t.border}"/>
<line x1="1" y1="60" x2="${W - 1}" y2="60" stroke="${t.border}"/>
`;
  let x = 28;
  crumbs.forEach((c, i) => {
    if (i) { s += `<text x="${x}" y="37" font-size="16" fill="${t.faint}">/</text>`; x += 20; }
    s += `<text x="${x}" y="37" font-size="16" font-weight="${i ? 600 : 600}" fill="${i ? t.text : t.muted}">${esc(c)}</text>`;
    x += textW(c, 16) + 12;
  });
  // right-side pills (labels only)
  let rx = W - 28;
  [...right].reverse().forEach((p) => {
    const w = textW(p.label, 14) + 26;
    rx -= w;
    s += `<rect x="${rx}" y="16" width="${w}" height="30" rx="8" fill="${p.on ? t.pillOn : t.pill}" stroke="${t.border}"/>`;
    s += `<text x="${rx + w / 2}" y="36" text-anchor="middle" font-size="14" font-weight="${p.on ? 600 : 500}" fill="${p.on ? t.text : t.muted}">${esc(p.label)}</text>`;
    rx -= 8;
  });
  return s;
}

// ------------------------------------------------------------------ activity card
function activity(name) {
  const t = themes[name];
  const W = 960, H = 656;
  const updated = now.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  let s = frame(t, W, H, ["Activity", "All repos", "Last 90 days"], [{ label: `updated ${updated}`, on: false }, { label: "90 days", on: true }]);

  // big number + legend
  s += `<text class="fade" x="40" y="124" font-size="48" font-weight="800" fill="${t.text}" letter-spacing="-1">${recentTotal.toLocaleString("en-US")}</text>`;
  s += `<text class="fade" x="40" y="150" font-size="14" fill="${t.muted}">contributions in the last 90 days</text>`;
  const legend = [
    { c: t.main, name: "Commits", v: r.totalCommitContributions, sub: `across ${r.totalRepositoriesWithContributedCommits} public repos` },
    { c: t.accent, name: "Pull requests", v: prs90, sub: `${merged90} merged in this window` },
    { c: t.blue, name: "Issues & reviews", v: r.totalIssueContributions + r.totalPullRequestReviewContributions, sub: `${r.totalIssueContributions} issues · ${r.totalPullRequestReviewContributions} reviews` },
    { c: t.faint, name: "Private work", v: r.restrictedContributionsCount, sub: "in private repos" },
  ];
  legend.forEach((l, i) => {
    const y = 196 + i * 56;
    const d = (0.2 + i * 0.12).toFixed(2);
    s += `<g class="fade" style="animation-delay:${d}s"><circle cx="45" cy="${y - 5}" r="5" fill="${l.c}"/>
<text x="60" y="${y}" font-size="16" font-weight="600" fill="${t.text}">${esc(l.name)} <tspan font-size="13" font-weight="400" fill="${t.muted}">${pctStr(pct(l.v, recentTotal))}</tspan></text>
<text x="370" y="${y}" text-anchor="end" font-size="18" font-weight="700" fill="${t.text}">${l.v.toLocaleString("en-US")}</text>
<text x="40" y="${y + 22}" font-size="13" fill="${t.muted}">${esc(l.sub)}</text></g>\n`;
  });

  // chart
  const px0 = 470, px1 = 920, py0 = 120, py1 = 330;
  s += `<text x="${px0 - 50}" y="96" font-size="16" font-weight="600" fill="${t.text}">Daily contributions</text>`;
  s += `<g font-size="11" fill="${t.muted}"><circle cx="${px1 - 186}" cy="92" r="4" fill="${t.main}"/><text x="${px1 - 178}" y="96">all</text><circle cx="${px1 - 146}" cy="92" r="4" fill="${t.accent}"/><text x="${px1 - 138}" y="96">PRs opened</text><circle cx="${px1 - 62}" cy="92" r="4" fill="${t.blue}"/><text x="${px1 - 54}" y="96">PRs merged</text></g>`;
  const sT = smooth(total), sO = smooth(opened), sM = smooth(mergedS);
  const yMax = niceMax(Math.max(...sT, ...sO) * 1.1);
  const X = (i) => px0 + (i / (DAYS - 1)) * (px1 - px0);
  const Y = (v) => py1 - (v / yMax) * (py1 - py0);
  for (let k = 0; k <= 4; k++) {
    const v = (yMax / 4) * k, y = Y(v);
    s += `<line x1="${px0}" y1="${y}" x2="${px1}" y2="${y}" stroke="${t.grid}"/>`;
    s += `<text x="${px0 - 12}" y="${y + 4}" text-anchor="end" font-size="11" fill="${t.muted}">${fmt(Math.round(v))}</text>`;
  }
  const series = [
    { data: sT, c: t.main, fill: t.mainFill, op: 0.16, w: 2 },
    { data: sO, c: t.accent, fill: t.accent, op: 0.28, w: 2 },
    { data: sM, c: t.blue, fill: t.blue, op: 0.18, w: 1.6 },
  ];
  series.forEach((se, i) => {
    const pts = se.data.map((v, j) => [X(j), Y(v)]);
    const line = spline(pts, py1);
    s += `<path class="fade" style="animation-delay:${(0.6 + i * 0.2).toFixed(1)}s" d="${line} L${px1},${py1} L${px0},${py1} Z" fill="${se.fill}" fill-opacity="${se.op}"/>`;
    s += `<path class="draw" style="animation-delay:${(i * 0.2).toFixed(1)}s" d="${line}" fill="none" stroke="${se.c}" stroke-width="${se.w}" stroke-linejoin="round" stroke-linecap="round"/>\n`;
  });
  s += `<line x1="${px0}" y1="${py1}" x2="${px1}" y2="${py1}" stroke="${t.faint}"/>`;
  [0, Math.floor((DAYS - 1) / 2), DAYS - 1].forEach((i, k) => {
    s += `<text x="${X(i)}" y="${py1 + 22}" text-anchor="${["start", "middle", "end"][k]}" font-size="11" font-weight="600" fill="${t.muted}">${month(dates[i])}</text>`;
  });

  // totals
  s += `<text x="40" y="432" font-size="16" font-weight="600" fill="${t.text}">Totals</text>`;
  const totals = [
    ["PRs opened", prs.length.toLocaleString("en-US"), `${mergedAll} merged · all time`],
    ["Lines added via PRs", fmt(prs.reduce((a, p) => a + p.additions, 0)), "public PRs"],
    ["Repos contributed to", String(repoList.length), "open source"],
    ["Stars on repos I've PR'd", fmt(combinedStars), "combined"],
    ["Longest streak", `${longest} days`, "past year"],
  ];
  totals.forEach(([k, v, sub], i) => {
    const x = 40 + i * 180;
    s += `<g class="fade" style="animation-delay:${(0.8 + i * 0.08).toFixed(2)}s"><text x="${x}" y="466" font-size="13" fill="${t.muted}">${esc(k)}</text>
<text x="${x}" y="494" font-size="22" font-weight="700" fill="${t.text}">${esc(v)}</text>
<text x="${x}" y="514" font-size="12" fill="${t.faint}">${esc(sub)}</text></g>`;
  });

  // contributions by type bar
  s += `<text x="40" y="566" font-size="16" font-weight="600" fill="${t.text}">Contributions by type</text>`;
  const bx = 40, bw = 600, by = 582;
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="10" rx="5" fill="${t.track}"/>`;
  let cx = bx;
  legend.forEach((l, i) => {
    const w = Math.max(l.v ? 4 : 0, (l.v / recentTotal) * bw);
    if (!w) return;
    s += `<rect class="grow" style="animation-delay:${(1 + i * 0.1).toFixed(1)}s" x="${cx.toFixed(1)}" y="${by}" width="${Math.max(0, w - 3).toFixed(1)}" height="10" rx="3" fill="${l.c}"/>`;
    cx += w;
  });
  let lx = 40;
  legend.forEach((l) => {
    const label = `${l.name}  ${fmt(l.v)}`;
    s += `<rect x="${lx}" y="${612}" width="10" height="10" rx="2" fill="${l.c}"/><text x="${lx + 16}" y="${621}" font-size="13" fill="${t.text}">${esc(l.name)} <tspan fill="${t.muted}">${fmt(l.v)}</tspan></text>`;
    lx += textW(label, 13) + 40;
  });
  s += `</svg>\n`;
  writeFileSync(`assets/activity-${name}.svg`, s);
}

// ------------------------------------------------------------------ open-source card
function oss(name) {
  const t = themes[name];
  const rows = repoList.slice(0, 8);
  const W = 960, rowH = 46, top = 250, H = top + rows.length * rowH + 64;
  let s = frame(t, W, H, ["Open source", "Pull requests", "All time"], [{ label: "Repo", on: true }]);

  s += `<text class="fade" x="40" y="124" font-size="48" font-weight="800" fill="${t.text}" letter-spacing="-1">${ext.length}</text>`;
  s += `<text class="fade" x="40" y="150" font-size="14" fill="${t.muted}">pull requests to ${repoList.length} open-source repos</text>`;
  const mini = [
    ["Merged", extMerged, t.blue], ["In review", extOpen, t.accent], ["Closed", ext.length - extMerged - extOpen, t.faint],
  ];
  mini.forEach(([k, v, c], i) => {
    const x = 420 + i * 170;
    s += `<g class="fade" style="animation-delay:${(0.2 + i * 0.1).toFixed(1)}s"><circle cx="${x + 5}" cy="${98}" r="5" fill="${c}"/><text x="${x + 18}" y="103" font-size="14" fill="${t.muted}">${k}</text>
<text x="${x}" y="140" font-size="26" font-weight="700" fill="${t.text}">${v}</text></g>`;
  });
  // status bar
  const bx = 420, bw = 500, by = 160;
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="8" rx="4" fill="${t.track}"/>`;
  let cx = bx;
  mini.forEach(([, v, c], i) => {
    const w = (v / ext.length) * bw;
    if (w < 1) return;
    s += `<rect class="grow" style="animation-delay:${(0.5 + i * 0.1).toFixed(1)}s" x="${cx.toFixed(1)}" y="${by}" width="${Math.max(0, w - 3).toFixed(1)}" height="8" rx="3" fill="${c}"/>`;
    cx += w;
  });

  s += `<text x="40" y="214" font-size="16" font-weight="600" fill="${t.text}">Breakdown</text>`;
  const cols = { n: 52, repo: 76, stars: 560, merged: 650, share: 720, prs: 920 };
  s += `<g font-size="12" font-weight="600" fill="${t.muted}"><text x="${cols.n}" y="240">#</text><text x="${cols.repo}" y="240">Repository</text><text x="${cols.stars + 40}" y="240" text-anchor="end">Stars</text><text x="${cols.merged + 30}" y="240" text-anchor="end">Merged</text><text x="${cols.share}" y="240">Share</text><text x="${cols.prs}" y="240" text-anchor="end">PRs</text></g>`;
  s += `<line x1="40" y1="250" x2="${W - 40}" y2="250" stroke="${t.border}"/>`;
  const maxN = rows[0]?.n || 1;
  rows.forEach((e, i) => {
    const y = top + i * rowH + 30;
    const d = (0.3 + i * 0.07).toFixed(2);
    const [owner, repo] = e.name.split("/");
    s += `<g class="fade" style="animation-delay:${d}s">`;
    s += `<text x="${cols.n}" y="${y}" font-size="13" fill="${t.faint}">${i + 1}</text>`;
    s += `<clipPath id="av${i}-${name}"><rect x="${cols.repo}" y="${y - 18}" width="24" height="24" rx="6"/></clipPath>`;
    s += `<image href="${avatars[e.name]}" x="${cols.repo}" y="${y - 18}" width="24" height="24" clip-path="url(#av${i}-${name})"/>`;
    s += `<text x="${cols.repo + 36}" y="${y}" font-size="15" fill="${t.muted}">${esc(owner)}/<tspan font-weight="600" fill="${t.text}">${esc(repo)}</tspan></text>`;
    s += `<text x="${cols.stars + 40}" y="${y}" text-anchor="end" font-size="14" fill="${t.muted}">★ ${fmt(e.stars)}</text>`;
    s += `<text x="${cols.merged + 30}" y="${y}" text-anchor="end" font-size="14" font-weight="600" fill="${e.merged ? t.blue : t.faint}">${e.merged || "–"}</text>`;
    s += `</g>`;
    s += `<rect x="${cols.share}" y="${y - 9}" width="140" height="8" rx="4" fill="${t.track}"/>`;
    s += `<rect class="grow" style="animation-delay:${(0.5 + i * 0.07).toFixed(2)}s" x="${cols.share}" y="${y - 9}" width="${((e.n / maxN) * 140).toFixed(1)}" height="8" rx="4" fill="${t.accent}"/>`;
    s += `<text class="fade" style="animation-delay:${d}s" x="${cols.prs}" y="${y}" text-anchor="end" font-size="15" font-weight="700" fill="${t.text}">${e.n}</text>`;
    if (i < rows.length - 1) s += `<line x1="40" y1="${y + 16}" x2="${W - 40}" y2="${y + 16}" stroke="${t.grid}"/>`;
    s += `\n`;
  });
  const rest = repoList.length - rows.length;
  s += `<text x="40" y="${H - 26}" font-size="12" fill="${t.faint}">${rest > 0 ? `+ ${rest} more repos · ` : ""}live from the GitHub API, refreshed daily</text>`;
  s += `</svg>\n`;
  writeFileSync(`assets/oss-${name}.svg`, s);
}

// ------------------------------------------------------------------ toolbox card
const stack = [
  ["AI / ML", ["PyTorch", "LangGraph", "LangChain", "MCP", "Transformers", "Unsloth", "RL / GRPO"]],
  ["Product", ["Python", "TypeScript", "FastAPI", "React", "Next.js", "Lean 4"]],
  ["Data / infra", ["PostgreSQL", "Neo4j", "Qdrant", "Redis", "Docker", "GitHub Actions"]],
];

function toolbox(name) {
  const t = themes[name];
  const W = 960, H = 410;
  let s = frame(t, W, H, ["Toolbox", "Languages", `${user.repositories.totalCount} repos`], [{ label: "By bytes", on: true }]);
  s += `<text x="40" y="100" font-size="16" font-weight="600" fill="${t.text}">Code by language</text>`;
  const bx = 40, bw = W - 80, by = 116;
  let cx = bx;
  langRows.forEach((l, i) => {
    const w = (l.size / langTotal) * bw;
    s += `<rect class="grow" style="animation-delay:${(i * 0.08).toFixed(2)}s" x="${cx.toFixed(1)}" y="${by}" width="${Math.max(0, w - 3).toFixed(1)}" height="12" rx="3" fill="${l.color}"/>`;
    cx += w;
  });
  langRows.forEach((l, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = 40 + col * 225, y = 160 + row * 28;
    s += `<g class="fade" style="animation-delay:${(0.3 + i * 0.05).toFixed(2)}s"><rect x="${x}" y="${y - 10}" width="10" height="10" rx="2" fill="${l.color}"/><text x="${x + 18}" y="${y}" font-size="14" fill="${t.text}">${esc(l.name)} <tspan fill="${t.muted}">${pctStr(pct(l.size, langTotal))}</tspan></text></g>`;
  });
  s += `<line x1="40" y1="${218}" x2="${W - 40}" y2="${218}" stroke="${t.border}"/>`;
  s += `<text x="40" y="254" font-size="16" font-weight="600" fill="${t.text}">Stack</text>`;
  stack.forEach(([label, items], r) => {
    const y = 280 + r * 40;
    s += `<text x="40" y="${y + 19}" font-size="13" fill="${t.muted}">${label}</text>`;
    let x = 160;
    items.forEach((it, j) => {
      const w = textW(it, 13) + 26;
      s += `<g class="fade" style="animation-delay:${(0.5 + r * 0.15 + j * 0.04).toFixed(2)}s"><rect x="${x}" y="${y}" width="${w}" height="28" rx="14" fill="${t.pill}" stroke="${t.border}"/><text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" font-size="13" font-weight="500" fill="${t.text}">${esc(it)}</text></g>`;
      x += w + 8;
    });
  });
  s += `</svg>\n`;
  writeFileSync(`assets/toolbox-${name}.svg`, s);
}

mkdirSync("assets", { recursive: true });
for (const th of ["dark", "light"]) { activity(th); oss(th); toolbox(th); }
console.log(`built activity/oss/toolbox cards · ${recentTotal} contributions, ${prs.length} PRs, ${ext.length} external`);
