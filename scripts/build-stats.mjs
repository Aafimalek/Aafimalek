// Builds the dashboard-style cards in assets/ from live GitHub data.
// Run from the repo root: node scripts/build-stats.mjs
// Uses $GITHUB_TOKEN (set in Actions) or falls back to `gh auth token` locally.
// Only public data is shown; private work appears as one aggregate count.
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

// ------------------------------------------------------------------ content you may want to edit
const MATH = [
  { id: "fink", repo: "fink-recursive-divisors", field: "Number theory",
    title: "Fink's conjecture on recursive divisors",
    result: "Conjecture 1, settled with a full formal proof.",
    checks: ["Lean 4 proof", "exact check to 10⁶"] },
  { id: "erdos", repo: "erdos-385-almost-all", field: "Number theory",
    title: "Erdős Problems #385 and #430",
    result: "Both hold for almost all n. Still open for every n.",
    checks: ["Lean 4 density theorems", "exact computation"] },
  { id: "latin", repo: "latin-square-gap", field: "Combinatorics",
    title: "Just above the Latin-square bound",
    result: "The first sizes of maximal orthogonal partial Latin squares past 3s².",
    checks: ["Lean 4 gap theorem", "exhaustive checks"] },
  { id: "euler", repo: "novel-discoveries", field: "Combinatorics",
    title: "Euler's 36 officers, small and maximal",
    result: "Small maximal arrangements, with a written reduction.",
    checks: ["Lean 4 witness", "13 SAT certificates"] },
];
const GAMES = [
  { repo: "atari_rl", name: "atari_rl", tag: "DQN", desc: "Learned Atari Breakout from pixels over 6M steps" },
  { repo: "rl_snake_game", name: "rl_snake_game", tag: "DQN", desc: "A snake that learned not to bite itself" },
  { repo: "flappy_bird_AI", name: "flappy_bird_AI", tag: "NEAT", desc: "Evolved a bird that finally gets gravity" },
];
const STACK = [ // [label, simple-icons slug or null] - every entry shows up in my public repos
  ["ML & training", [["PyTorch", "pytorch"], ["TensorFlow", "tensorflow"], ["Keras", "keras"], ["scikit-learn", "scikitlearn"], ["Transformers", "huggingface"], ["Unsloth", null], ["TRL", null], ["OpenCV", "opencv"], ["Gymnasium", null]]],
  ["LLMs & agents", [["LangGraph", "langgraph"], ["LangChain", "langchain"], ["CrewAI", "crewai"], ["MCP", "modelcontextprotocol"], ["Ollama", "ollama"], ["Groq", null], ["OpenAI", null], ["Gemini", "googlegemini"], ["Claude", "claude"], ["LiveKit", "livekit"]]],
  ["Data & retrieval", [["pandas", "pandas"], ["NumPy", "numpy"], ["ChromaDB", null], ["FAISS", null], ["Qdrant", "qdrant"], ["Neo4j", "neo4j"], ["PostgreSQL", "postgresql"], ["MongoDB", "mongodb"], ["SQLite", "sqlite"], ["Redis", "redis"]]],
  ["Backend", [["FastAPI", "fastapi"], ["Flask", "flask"], ["Streamlit", "streamlit"], ["Node.js", "nodedotjs"], ["Express", "express"], ["Clerk", "clerk"]]],
  ["Frontend", [["Next.js", "nextdotjs"], ["React", "react"], ["Tailwind", "tailwindcss"], ["shadcn/ui", "shadcnui"], ["D3.js", "d3"], ["Pyodide", null]]],
  ["Infra & tooling", [["Docker", "docker"], ["AWS", null], ["Vercel", "vercel"], ["Azure", null], ["Actions", "githubactions"], ["Jupyter", "jupyter"], ["Kaggle", "kaggle"], ["Puppeteer", "puppeteer"], ["Selenium", "selenium"], ["Manim", null]]],
];

// ------------------------------------------------------------------ data
const now = new Date();
const dayKey = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n));
const from90 = daysAgo(DAYS - 1);
const from365 = daysAgo(364);

const repoFields = MATH.concat(GAMES, [{ repo: "wordle-rl" }])
  .map((p, i) => `r${i}: repository(owner:"${LOGIN}", name:"${p.repo}") { name stargazerCount pushedAt primaryLanguage { name } }`)
  .join("\n");

const base = await gql(
  `query($login:String!, $from90:DateTime!, $from365:DateTime!, $to:DateTime!) {
    user(login:$login) {
      recent: contributionsCollection(from:$from90, to:$to) {
        totalCommitContributions totalIssueContributions totalPullRequestReviewContributions
        restrictedContributionsCount totalRepositoriesWithContributedCommits
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      }
      year: contributionsCollection(from:$from365, to:$to) {
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount weekday } } }
      }
      repositories(ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, first:100) {
        totalCount
        nodes { languages(first:10, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name } } } }
      }
    }
    ${repoFields}
  }`,
  { login: LOGIN, from90: from90.toISOString(), from365: from365.toISOString(), to: now.toISOString() },
);
const user = base.user;
const repoInfo = {};
for (const [k, v] of Object.entries(base)) if (k.startsWith("r") && v) repoInfo[v.name] = v;

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

// 90-day daily series
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
const r = user.recent;
const recentTotal = r.contributionCalendar.totalContributions;
const prs90 = opened.reduce((a, b) => a + b, 0);
const merged90 = mergedS.reduce((a, b) => a + b, 0);

// past-year calendar stats
const yearWeeks = user.year.contributionCalendar.weeks;
const yearDays = yearWeeks.flatMap((w) => w.contributionDays);
const yearTotal = user.year.contributionCalendar.totalContributions;
let longest = 0, run = 0;
for (const d of yearDays) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = yearDays.length - 1; i >= 0; i--) {
  if (yearDays[i].contributionCount) current++;
  else if (i === yearDays.length - 1) continue; // today can still be empty
  else break;
}
const activeDays = yearDays.filter((d) => d.contributionCount).length;
const best = yearDays.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), yearDays[0]);
const byWeekday = Array(7).fill(0);
for (const d of yearDays) byWeekday[d.weekday] += d.contributionCount;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const topWeekday = WEEKDAYS[byWeekday.indexOf(Math.max(...byWeekday))];

// open source
const ext = prs.filter((p) => p.repository.owner.login !== LOGIN);
const extRepos = {};
for (const p of ext) {
  const k = p.repository.nameWithOwner;
  extRepos[k] ??= { name: k, owner: p.repository.owner, stars: p.repository.stargazerCount, n: 0, merged: 0 };
  extRepos[k].n++;
  if (p.mergedAt) extRepos[k].merged++;
}
const repoList = Object.values(extRepos).sort((a, b) => b.n - a.n || b.stars - a.stars);
const combinedStars = repoList.reduce((a, e) => a + e.stars, 0);
const extMerged = ext.filter((p) => p.mergedAt).length;
const extOpen = ext.filter((p) => p.state === "OPEN").length;
const ext90 = ext.filter((p) => p.createdAt.slice(0, 10) >= dates[0]).length;
const extAdds = ext.reduce((a, p) => a + p.additions, 0);

// languages (notebook outputs and markup inflate byte counts, so they're left out)
const SKIP_LANGS = new Set(["Jupyter Notebook", "HTML", "CSS", "TeX", "SCSS", "Dockerfile", "Makefile", "Shell", "PowerShell", "Batchfile"]);
const langs = {};
for (const repo of user.repositories.nodes)
  for (const e of repo.languages.edges)
    if (!SKIP_LANGS.has(e.node.name)) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
const langTotal = Object.values(langs).reduce((a, b) => a + b, 0);
const langTop = Object.entries(langs).sort((x, y) => y[1] - x[1]).filter(([, v]) => v / langTotal >= 0.005).slice(0, 7);
const otherSize = langTotal - langTop.reduce((acc, l) => acc + l[1], 0);
const langRows = otherSize / langTotal >= 0.001 ? [...langTop, ["Other", otherSize]] : langTop;

const avatars = {};
for (const e of repoList.slice(0, 8)) {
  const url = e.owner.avatarUrl + (e.owner.avatarUrl.includes("?") ? "&" : "?") + "s=56";
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  avatars[e.name] = `data:image/png;base64,${buf.toString("base64")}`;
}

// ------------------------------------------------------------------ theme + helpers
const themes = {
  dark: {
    bg: "#1d1b20", border: "#353139", text: "#f3f1f4", muted: "#a19da6", faint: "#6e6a73", grid: "#312e35",
    o1: "#ff8a3d", o2: "#ffc08a", o3: "#c2410c", gray: "#6e6a73", pill: "#2a272e", pillOn: "#3a363e", track: "#34303a",
    heat: ["#2c2930", "#5c2b12", "#9c4216", "#e0661f", "#ff9d52"],
    ramp: ["#ff8a3d", "#f2701f", "#ffa868", "#c2410c", "#ffc08a", "#9a3412", "#ffd9b8", "#6e6a73"],
    tile: "#232026", tileEmpty: "#2a272e", tileEdge: "#3e3a43",
  },
  light: {
    bg: "#ffffff", border: "#e3e0e6", text: "#1d1b20", muted: "#65616a", faint: "#9c98a1", grid: "#eeebf0",
    o1: "#f26a1b", o2: "#f8a55f", o3: "#b3400e", gray: "#b4b0b8", pill: "#f4f2f6", pillOn: "#ffffff", track: "#ece9ef",
    heat: ["#efedf1", "#ffd9b8", "#ffab66", "#f26a1b", "#b3400e"],
    ramp: ["#f26a1b", "#d9560f", "#f8a55f", "#b3400e", "#ffc898", "#8a2f0a", "#ffe1c7", "#b4b0b8"],
    tile: "#ffffff", tileEmpty: "#ffffff", tileEdge: "#d9d5dd",
  },
};
const FONT = `'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k" : String(n));
const pct = (a, b) => (b ? (a / b) * 100 : 0);
const pctStr = (p) => (p > 0 && p < 0.1 ? "<0.1%" : p.toFixed(1) + "%");
const textW = (s, size) => s.length * size * 0.53;
const mon = (d) => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" });
const monDay = (d) => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const delay = (s) => `style="animation-delay:${s.toFixed(2)}s"`;

function wrap(text, max) {
  const out = [];
  let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > max) { out.push(line.trim()); line = w; }
    else line += " " + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

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

const STYLE = `<style>
  .fade { opacity: 0; animation: fade .6s ease-out forwards; }
  @keyframes fade { to { opacity: 1; } }
  .draw { stroke-dasharray: 2400; stroke-dashoffset: 2400; animation: draw 1.8s ease-out forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .grow { transform-box: fill-box; transform-origin: left center; transform: scaleX(0); animation: grow .9s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes grow { to { transform: scaleX(1); } }
  .pop { transform-box: fill-box; transform-origin: center; opacity: 0; animation: popin .35s ease-out forwards; }
  @keyframes popin { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }
</style>`;

function frame(t, W, H, crumbs, right = []) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
${STYLE}
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${t.bg}" stroke="${t.border}"/>
<line x1="1" y1="60" x2="${W - 1}" y2="60" stroke="${t.border}"/>
`;
  let x = 28;
  crumbs.forEach((c, i) => {
    if (i) { s += `<text x="${x}" y="37" font-size="16" fill="${t.faint}">/</text>`; x += 20; }
    s += `<text x="${x}" y="37" font-size="16" font-weight="600" fill="${i ? t.text : t.muted}">${esc(c)}</text>`;
    x += textW(c, 16) + 14;
  });
  let rx = W - 28;
  [...right].reverse().forEach((p) => {
    const w = textW(p.label, 14) + 28;
    rx -= w;
    s += `<rect x="${rx}" y="16" width="${w}" height="30" rx="8" fill="${p.on ? t.pillOn : t.pill}" stroke="${t.border}"/>`;
    s += `<text x="${rx + w / 2}" y="36" text-anchor="middle" font-size="14" font-weight="${p.on ? 600 : 500}" fill="${p.on ? t.text : t.muted}">${esc(p.label)}</text>`;
    rx -= 8;
  });
  return s;
}

const sectionTitle = (t, x, y, label, right) =>
  `<text x="${x}" y="${y}" font-size="16" font-weight="600" fill="${t.text}">${esc(label)}</text>` +
  (right ? `<text x="${right.x}" y="${y}" text-anchor="end" font-size="13" fill="${t.muted}">${right.html}</text>` : "");

// ------------------------------------------------------------------ activity card
function activity(name) {
  const t = themes[name];
  const W = 960, H = 760;
  const updated = now.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  let s = frame(t, W, H, ["Activity", "All repos", "Last 90 days"], [{ label: `updated ${updated}` }, { label: "90 days", on: true }]);

  s += `<text class="fade" x="40" y="124" font-size="48" font-weight="800" fill="${t.text}" letter-spacing="-1">${recentTotal.toLocaleString("en-US")}</text>`;
  s += `<text class="fade" x="40" y="150" font-size="14" fill="${t.muted}">contributions in the last 90 days</text>`;
  const legend = [
    { c: t.o1, name: "Commits", v: r.totalCommitContributions, sub: `across ${r.totalRepositoriesWithContributedCommits} public repos` },
    { c: t.o2, name: "Pull requests", v: prs90, sub: `opened in the last 90 days · ${merged90} merged` },
    { c: t.o3, name: "Issues & reviews", v: r.totalIssueContributions + r.totalPullRequestReviewContributions, sub: `${r.totalIssueContributions} issues · ${r.totalPullRequestReviewContributions} reviews` },
    { c: t.gray, name: "Private work", v: r.restrictedContributionsCount, sub: "in private repos" },
  ];
  legend.forEach((l, i) => {
    const y = 196 + i * 56;
    s += `<g class="fade" ${delay(0.2 + i * 0.12)}><circle cx="45" cy="${y - 5}" r="5" fill="${l.c}"/>
<text x="60" y="${y}" font-size="16" font-weight="600" fill="${t.text}">${esc(l.name)} <tspan font-size="13" font-weight="400" fill="${t.muted}">${pctStr(pct(l.v, recentTotal))}</tspan></text>
<text x="370" y="${y}" text-anchor="end" font-size="18" font-weight="700" fill="${t.text}">${l.v.toLocaleString("en-US")}</text>
<text x="40" y="${y + 22}" font-size="13" fill="${t.muted}">${esc(l.sub)}</text></g>\n`;
  });

  // area chart
  const px0 = 470, px1 = 920, py0 = 120, py1 = 330;
  s += `<text x="${px0 - 50}" y="96" font-size="16" font-weight="600" fill="${t.text}">Daily contributions</text>`;
  s += `<g font-size="11" fill="${t.muted}"><circle cx="${px1 - 186}" cy="92" r="4" fill="${t.o1}"/><text x="${px1 - 178}" y="96">all</text><circle cx="${px1 - 146}" cy="92" r="4" fill="${t.o2}"/><text x="${px1 - 138}" y="96">PRs opened</text><circle cx="${px1 - 62}" cy="92" r="4" fill="${t.o3}"/><text x="${px1 - 54}" y="96">PRs merged</text></g>`;
  const sT = smooth(total), sO = smooth(opened), sM = smooth(mergedS);
  const yMax = niceMax(Math.max(...sT, ...sO) * 1.1);
  const X = (i) => px0 + (i / (DAYS - 1)) * (px1 - px0);
  const Y = (v) => py1 - (v / yMax) * (py1 - py0);
  for (let k = 0; k <= 4; k++) {
    const v = (yMax / 4) * k, y = Y(v);
    s += `<line x1="${px0}" y1="${y}" x2="${px1}" y2="${y}" stroke="${t.grid}"/>`;
    s += `<text x="${px0 - 12}" y="${y + 4}" text-anchor="end" font-size="11" fill="${t.muted}">${fmt(Math.round(v))}</text>`;
  }
  s += `<defs><linearGradient id="gA-${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.o1}" stop-opacity=".55"/><stop offset="1" stop-color="${t.o1}" stop-opacity="0.02"/></linearGradient></defs>`;
  [
    { data: sT, c: t.o1, fill: `url(#gA-${name})`, op: 1, w: 2.2 },
    { data: sO, c: t.o2, fill: t.o2, op: 0.22, w: 1.8 },
    { data: sM, c: t.o3, fill: t.o3, op: 0.3, w: 1.6 },
  ].forEach((se, i) => {
    const pts = se.data.map((v, j) => [X(j), Y(v)]);
    const line = spline(pts, py1);
    s += `<path class="fade" ${delay(0.6 + i * 0.2)} d="${line} L${px1},${py1} L${px0},${py1} Z" fill="${se.fill}" fill-opacity="${se.op}"/>`;
    s += `<path class="draw" ${delay(i * 0.2)} d="${line}" fill="none" stroke="${se.c}" stroke-width="${se.w}" stroke-linejoin="round" stroke-linecap="round"/>\n`;
  });
  s += `<line x1="${px0}" y1="${py1}" x2="${px1}" y2="${py1}" stroke="${t.faint}"/>`;
  [0, Math.floor((DAYS - 1) / 2), DAYS - 1].forEach((i, k) => {
    s += `<text x="${X(i)}" y="${py1 + 22}" text-anchor="${["start", "middle", "end"][k]}" font-size="11" font-weight="600" fill="${t.muted}">${monDay(dates[i]).toUpperCase()}</text>`;
  });

  // contribution heatmap (past year)
  const hx = 70, hy = 470, cell = 12, gap = 3;
  s += `<line x1="40" y1="400" x2="${W - 40}" y2="400" stroke="${t.border}"/>`;
  s += sectionTitle(t, 40, 436, "Contribution graph", { x: W - 40, html: `<tspan font-weight="700" fill="${t.text}">${yearTotal.toLocaleString("en-US")}</tspan> contributions in the past year` });
  const nonzero = yearDays.map((d) => d.contributionCount).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))] || 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (c) => (!c ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);
  let lastMonth = "";
  yearWeeks.forEach((w, wi) => {
    const x = hx + wi * (cell + gap);
    const first = w.contributionDays[0];
    const m = mon(first.date);
    if (m !== lastMonth && wi < yearWeeks.length - 2) {
      s += `<text x="${x}" y="${hy - 8}" font-size="11" fill="${t.muted}">${m}</text>`;
      lastMonth = m;
    }
    w.contributionDays.forEach((d) => {
      const y = hy + d.weekday * (cell + gap);
      s += `<rect class="pop" ${delay(0.4 + wi * 0.018)} x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${t.heat[level(d.contributionCount)]}"><title>${d.contributionCount} on ${d.date}</title></rect>`;
    });
  });
  [["Mon", 1], ["Wed", 3], ["Fri", 5]].forEach(([l, i]) => {
    s += `<text x="${hx - 10}" y="${hy + i * (cell + gap) + 10}" text-anchor="end" font-size="11" fill="${t.muted}">${l}</text>`;
  });
  const ly = hy + 7 * (cell + gap) + 18;
  let lx = W - 40 - 5 * (cell + gap) - 34;
  s += `<text x="${lx - 8}" y="${ly + 10}" text-anchor="end" font-size="11" fill="${t.muted}">Less</text>`;
  t.heat.forEach((c, i) => { s += `<rect x="${lx + i * (cell + gap)}" y="${ly}" width="${cell}" height="${cell}" rx="3" fill="${c}"/>`; });
  s += `<text x="${lx + 5 * (cell + gap) + 4}" y="${ly + 10}" font-size="11" fill="${t.muted}">More</text>`;

  // past-year highlights (nothing here repeats the other cards)
  s += sectionTitle(t, 40, 640, "Past year highlights");
  const totals = [
    ["Current streak", `${current} day${current === 1 ? "" : "s"}`, "and counting"],
    ["Longest streak", `${longest} days`, "past year"],
    ["Active days", String(activeDays), `of 365`],
    ["Best day", String(best.contributionCount), monDay(best.date)],
    ["Busiest weekday", topWeekday.slice(0, 3), "most contributions"],
  ];
  totals.forEach(([k, v, sub], i) => {
    const x = 40 + i * 180;
    s += `<g class="fade" ${delay(0.8 + i * 0.08)}><text x="${x}" y="674" font-size="13" fill="${t.muted}">${esc(k)}</text>
<text x="${x}" y="702" font-size="22" font-weight="700" fill="${t.text}">${esc(v)}</text>
<text x="${x}" y="722" font-size="12" fill="${t.faint}">${esc(sub)}</text></g>`;
  });
  s += `</svg>\n`;
  writeFileSync(`assets/activity-${name}.svg`, s);
}

// ------------------------------------------------------------------ open-source card
function oss(name) {
  const t = themes[name];
  const rows = repoList.slice(0, 8);
  const W = 960, rowH = 46, top = 250, H = top + rows.length * rowH + 64;
  let s = frame(t, W, H, ["Open source", "Pull requests", "All time"], [{ label: `${repoList.length} repos · +${fmt(extAdds)} lines · ${fmt(combinedStars)}★` }]);

  s += `<text class="fade" x="40" y="124" font-size="48" font-weight="800" fill="${t.text}" letter-spacing="-1">${ext.length}</text>`;
  s += `<text class="fade" x="40" y="150" font-size="14" fill="${t.muted}">PRs to other people's repos, all time (${ext90} in the last 90 days)</text>`;
  const mini = [["Merged", extMerged, t.o1], ["In review", extOpen, t.o2], ["Closed", ext.length - extMerged - extOpen, t.gray]];
  mini.forEach(([k, v, c], i) => {
    const x = 450 + i * 160;
    s += `<g class="fade" ${delay(0.2 + i * 0.1)}><circle cx="${x + 5}" cy="98" r="5" fill="${c}"/><text x="${x + 18}" y="103" font-size="14" fill="${t.muted}">${k}</text>
<text x="${x}" y="140" font-size="26" font-weight="700" fill="${t.text}">${v}</text></g>`;
  });
  const bx = 450, bw = 470, by = 160;
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="8" rx="4" fill="${t.track}"/>`;
  let cx = bx;
  mini.forEach(([, v, c], i) => {
    const w = (v / ext.length) * bw;
    if (w < 1) return;
    s += `<rect class="grow" ${delay(0.5 + i * 0.1)} x="${cx.toFixed(1)}" y="${by}" width="${Math.max(0, w - 3).toFixed(1)}" height="8" rx="3" fill="${c}"/>`;
    cx += w;
  });

  s += sectionTitle(t, 40, 214, "Breakdown");
  const cols = { n: 52, repo: 76, stars: 600, merged: 680, share: 720, prs: 920 };
  s += `<g font-size="12" font-weight="600" fill="${t.muted}"><text x="${cols.n}" y="240">#</text><text x="${cols.repo}" y="240">Repository</text><text x="${cols.stars}" y="240" text-anchor="end">Stars</text><text x="${cols.merged}" y="240" text-anchor="end">Merged</text><text x="${cols.share}" y="240">Share</text><text x="${cols.prs}" y="240" text-anchor="end">PRs</text></g>`;
  s += `<line x1="40" y1="250" x2="${W - 40}" y2="250" stroke="${t.border}"/>`;
  const maxN = rows[0]?.n || 1;
  rows.forEach((e, i) => {
    const y = top + i * rowH + 30;
    const [owner, repo] = e.name.split("/");
    s += `<g class="fade" ${delay(0.3 + i * 0.07)}>`;
    s += `<text x="${cols.n}" y="${y}" font-size="13" fill="${t.faint}">${i + 1}</text>`;
    s += `<clipPath id="av${i}-${name}"><rect x="${cols.repo}" y="${y - 18}" width="24" height="24" rx="6"/></clipPath>`;
    s += `<image href="${avatars[e.name]}" x="${cols.repo}" y="${y - 18}" width="24" height="24" clip-path="url(#av${i}-${name})"/>`;
    s += `<text x="${cols.repo + 36}" y="${y}" font-size="15" fill="${t.muted}">${esc(owner)}/<tspan font-weight="600" fill="${t.text}">${esc(repo)}</tspan></text>`;
    s += `<text x="${cols.stars}" y="${y}" text-anchor="end" font-size="14" fill="${t.muted}">★ ${fmt(e.stars)}</text>`;
    s += `<text x="${cols.merged}" y="${y}" text-anchor="end" font-size="14" font-weight="600" fill="${e.merged ? t.o1 : t.faint}">${e.merged || "–"}</text>`;
    s += `<text x="${cols.prs}" y="${y}" text-anchor="end" font-size="15" font-weight="700" fill="${t.text}">${e.n}</text></g>`;
    s += `<rect x="${cols.share}" y="${y - 9}" width="150" height="8" rx="4" fill="${t.track}"/>`;
    s += `<rect class="grow" ${delay(0.5 + i * 0.07)} x="${cols.share}" y="${y - 9}" width="${((e.n / maxN) * 150).toFixed(1)}" height="8" rx="4" fill="${t.o1}"/>`;
    if (i < rows.length - 1) s += `<line x1="40" y1="${y + 16}" x2="${W - 40}" y2="${y + 16}" stroke="${t.grid}"/>`;
    s += `\n`;
  });
  const rest = repoList.length - rows.length;
  s += `<text x="40" y="${H - 26}" font-size="12" fill="${t.faint}">${rest > 0 ? `+ ${rest} more repos · ` : ""}live from the GitHub API, refreshed every 6 hours</text>`;
  s += `</svg>\n`;
  writeFileSync(`assets/oss-${name}.svg`, s);
}

// ------------------------------------------------------------------ arcade card (games + Wordle replay)
function arcade(name) {
  const t = themes[name];
  const W = 960, H = 500;
  let s = frame(t, W, H, ["Reinforcement learning", "Game-playing agents"], [{ label: "Wordle replay", on: true }]);
  s = s.replace("</style>", `  .t { transform-box: fill-box; transform-origin: center; animation: flip .5s ease-in-out both; }
  @keyframes flip { 0% { transform: scaleY(1); } 50% { transform: scaleY(0); } 100% { transform: scaleY(1); } }
  .ch { opacity: 0; animation: fade .12s ease-out forwards; }
  .win { transform-box: fill-box; transform-origin: center; animation: hop .4s ease-out both; }
  @keyframes hop { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
  .pg { animation: pg .01s linear both; } @keyframes pg { from { fill: ${t.tileEmpty}; stroke: ${t.tileEdge}; } to { fill: ${t.o1}; stroke: ${t.o1}; } }
  .py { animation: py .01s linear both; } @keyframes py { from { fill: ${t.tileEmpty}; stroke: ${t.tileEdge}; } to { fill: ${t.o2}; stroke: ${t.o2}; } }
  .px { animation: px .01s linear both; } @keyframes px { from { fill: ${t.tileEmpty}; stroke: ${t.tileEdge}; } to { fill: ${t.faint}; stroke: ${t.faint}; } }
</style>`);

  // Wordle board
  const answer = "AGENT", guesses = ["CRANE", "AMEND", "AGENT"];
  const score = (g) => {
    const res = Array(5).fill("x"), pool = {};
    for (let i = 0; i < 5; i++) { if (g[i] === answer[i]) res[i] = "g"; else pool[answer[i]] = (pool[answer[i]] || 0) + 1; }
    for (let i = 0; i < 5; i++) if (res[i] !== "g" && pool[g[i]]) { res[i] = "y"; pool[g[i]]--; }
    return res;
  };
  const tile = 50, gap = 7, ox = 64, oy = 92;
  const rowStart = (r) => 0.8 + r * 2.1;
  for (let rr = 0; rr < 6; rr++) {
    const g = guesses[rr], sc = g && score(g), win = g === answer;
    for (let c = 0; c < 5; c++) {
      const x = ox + c * (tile + gap), y = oy + rr * (tile + gap);
      if (!g) { s += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="6" fill="${t.tileEmpty}" stroke="${t.tileEdge}" stroke-width="2"/>`; continue; }
      const flipAt = rowStart(rr) + c * 0.28;
      s += `<g${win ? ` class="win" ${delay(rowStart(rr) + 1.8 + c * 0.1)}` : ""}><g class="t" ${delay(flipAt)}>` +
        `<rect class="p${sc[c]}" ${delay(flipAt + 0.25)} x="${x}" y="${y}" width="${tile}" height="${tile}" rx="6" stroke-width="2"/>` +
        `<text class="ch" ${delay(rowStart(rr) - 0.7 + c * 0.12)} x="${x + tile / 2}" y="${y + tile / 2 + 10}" text-anchor="middle" font-size="27" font-weight="800" fill="${name === "dark" ? "#fff" : t.text}">${g[c]}</text></g></g>\n`;
    }
  }
  s += `<text class="fade" ${delay(rowStart(2) + 2.2)} x="${ox + (5 * tile + 4 * gap) / 2}" y="${oy + 6 * (tile + gap) + 18}" text-anchor="middle" font-size="13" fill="${t.muted}">scripted replay · AGENT in 3</text>`;
  s += `<line x1="400" y1="84" x2="400" y2="${H - 28}" stroke="${t.border}"/>`;

  // wordle-rl headline
  const wr = repoInfo["wordle-rl"];
  const x0 = 436, x1 = 920;
  s += `<text x="${x0}" y="104" font-size="18" font-weight="700" fill="${t.text}">wordle-rl</text>`;
  s += `<text x="${x1}" y="104" text-anchor="end" font-size="14" fill="${t.muted}">★ ${wr?.stargazerCount ?? 0}</text>`;
  s += `<text x="${x0}" y="126" font-size="13" fill="${t.muted}">Gemma 3 270M taught Wordle on free Kaggle GPUs · $0 compute</text>`;
  s += `<text class="fade" x="${x0}" y="178" font-size="44" font-weight="800" fill="${t.text}" letter-spacing="-1">97%</text>`;
  s += `<text class="fade" x="${x0 + 100}" y="160" font-size="13" fill="${t.muted}">win rate on WordleBench</text>`;
  s += `<text class="fade" x="${x0 + 100}" y="178" font-size="13" fill="${t.muted}">3.68 guesses on average</text>`;
  [["Gemma 3 270M (mine)", 97, t.o1], ["GPT-5 (cited)", 99, t.gray]].forEach(([l, v, c], i) => {
    const y = 210 + i * 30;
    s += `<text x="${x0}" y="${y + 4}" font-size="13" fill="${t.text}">${l}</text>`;
    s += `<rect x="${x0 + 150}" y="${y - 6}" width="280" height="10" rx="5" fill="${t.track}"/>`;
    s += `<rect class="grow" ${delay(0.4 + i * 0.15)} x="${x0 + 150}" y="${y - 6}" width="${(v / 100) * 280}" height="10" rx="5" fill="${c}"/>`;
    s += `<text x="${x1}" y="${y + 4}" text-anchor="end" font-size="13" font-weight="700" fill="${t.text}">${v}%</text>`;
  });
  s += `<text x="${x0}" y="270" font-size="11" fill="${t.faint}">270M params vs a frontier model · word-level decoding · GPT-5 score from the leaderboard</text>`;

  // older games
  s += `<line x1="${x0}" y1="292" x2="${x1}" y2="292" stroke="${t.border}"/>`;
  s += `<text x="${x0}" y="322" font-size="13" font-weight="600" fill="${t.muted}">Earlier agents</text>`;
  GAMES.forEach((g, i) => {
    const y = 356 + i * 46;
    const info = repoInfo[g.repo];
    const tw = textW(g.tag, 11) + 16;
    s += `<g class="fade" ${delay(0.6 + i * 0.1)}>`;
    s += `<text x="${x0}" y="${y}" font-size="15" font-weight="600" fill="${t.text}">${esc(g.name)}</text>`;
    s += `<rect x="${x0 + textW(g.name, 15) + 12}" y="${y - 14}" width="${tw}" height="19" rx="9.5" fill="${t.pill}" stroke="${t.border}"/>`;
    s += `<text x="${x0 + textW(g.name, 15) + 12 + tw / 2}" y="${y}" text-anchor="middle" font-size="11" font-weight="600" fill="${t.o1}">${esc(g.tag)}</text>`;
    s += `<text x="${x1}" y="${y}" text-anchor="end" font-size="13" fill="${t.muted}">★ ${info?.stargazerCount ?? 0}</text>`;
    s += `<text x="${x0}" y="${y + 19}" font-size="13" fill="${t.muted}">${esc(g.desc)}</text></g>`;
  });
  s += `</svg>\n`;
  writeFileSync(`assets/arcade-${name}.svg`, s);
}

// ------------------------------------------------------------------ math tiles (one SVG each so each is clickable)
function mathTile(m, name) {
  const t = themes[name];
  const info = repoInfo[m.repo] || {};
  const W = 460, H = 210;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
${STYLE}
<defs><linearGradient id="mg-${m.id}-${name}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.o1}" stop-opacity=".16"/><stop offset=".55" stop-color="${t.o1}" stop-opacity="0"/></linearGradient></defs>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="url(#mg-${m.id}-${name})"/>
<rect x="1" y="1" width="5" height="${H - 2}" rx="2.5" fill="${t.o1}"/>
`;
  const fw = m.field.length * 8.4 + 24;
  s += `<rect x="26" y="22" width="${fw}" height="22" rx="11" fill="none" stroke="${t.o1}"/><text x="${26 + fw / 2}" y="37" text-anchor="middle" font-size="11" font-weight="700" letter-spacing=".8" fill="${t.o1}">${esc(m.field.toUpperCase())}</text>`;
  // verified badge
  s += `<g transform="translate(${W - 132},22)"><rect width="108" height="22" rx="11" fill="${t.o1}"/><path d="M12 11.5l3.2 3.2 6-6.4" stroke="${name === "dark" ? "#1d1b20" : "#ffffff"}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="30" y="15.5" font-size="11" font-weight="700" fill="${name === "dark" ? "#1d1b20" : "#ffffff"}">Lean-checked</text></g>`;
  wrap(m.title, 40).slice(0, 2).forEach((line, i) => {
    s += `<text x="26" y="${80 + i * 25}" font-size="20" font-weight="700" fill="${t.text}">${esc(line)}</text>`;
  });
  const ty = wrap(m.title, 40).length > 1 ? 132 : 108;
  wrap(m.result, 58).slice(0, 2).forEach((line, i) => {
    s += `<text x="26" y="${ty + i * 19}" font-size="14" fill="${t.muted}">${esc(line)}</text>`;
  });
  s += `<line x1="26" y1="${H - 44}" x2="${W - 24}" y2="${H - 44}" stroke="${t.grid}"/>`;
  let x = 26;
  m.checks.forEach((c) => {
    s += `<text x="${x}" y="${H - 18}" font-size="12.5" fill="${t.text}"><tspan fill="${t.o1}" font-weight="700">✓</tspan> ${esc(c)}</text>`;
    x += textW(c, 12.5) + 36;
  });
  s += `<text x="${W - 24}" y="${H - 18}" text-anchor="end" font-size="14" font-weight="700" fill="${t.o1}">↗</text>`;
  s += `</svg>
`;
  writeFileSync(`assets/math-${m.id}-${name}.svg`, s);
}

// ------------------------------------------------------------------ toolbox card
const iconCache = {};
async function icon(slug, color) {
  if (!slug) return null;
  const key = slug + color;
  if (!(key in iconCache)) {
    const res = await fetch(`https://cdn.simpleicons.org/${slug}/${color.slice(1)}`);
    iconCache[key] = res.ok ? `data:image/svg+xml;base64,${Buffer.from(await res.text()).toString("base64")}` : null;
  }
  return iconCache[key];
}

async function toolbox(name) {
  const t = themes[name];
  const W = 960;
  const perRow = 10, step = 74, tileS = 46, labelW = 150, gx = 40 + labelW;
  const rowsPer = STACK.map(([, items]) => Math.ceil(items.length / perRow));
  const top = 300;
  const H = top + rowsPer.reduce((acc, n) => acc + n * 78, 0) + STACK.length * 14 + 20;
  const toolCount = STACK.reduce((acc, [, items]) => acc + items.length, 0);
  let s = frame(t, W, H, ["Toolbox", "Languages & stack", `${toolCount} tools`]);

  // languages: donut + legend
  const cx = 130, cy = 180, R = 64, SW = 20, C = 2 * Math.PI * R;
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${t.track}" stroke-width="${SW}"/>`;
  let acc = 0;
  langRows.forEach(([lname, size], i) => {
    const frac = size / langTotal, len = Math.max(0, frac * C - 3);
    s += `<circle class="fade" ${delay(0.15 + i * 0.12)} cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${lname === "Other" ? t.gray : t.ramp[i]}" stroke-width="${SW}" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-acc * C).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    acc += frac;
  });
  const [topName, topSize] = langRows[0];
  s += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="26" font-weight="800" fill="${t.text}">${Math.round(pct(topSize, langTotal))}%</text>`;
  s += `<text x="${cx}" y="${cy + 21}" text-anchor="middle" font-size="12" fill="${t.muted}">${esc(topName)}</text>`;
  s += sectionTitle(t, 250, 112, "Languages");
  langRows.forEach(([lname, size], i) => {
    const y = 144 + i * 26;
    s += `<g class="fade" ${delay(0.4 + i * 0.06)}><rect x="250" y="${y - 10}" width="10" height="10" rx="2" fill="${lname === "Other" ? t.gray : t.ramp[i]}"/><text x="268" y="${y}" font-size="14" fill="${t.text}">${esc(lname)}</text><text x="420" y="${y}" text-anchor="end" font-size="14" font-weight="600" fill="${t.muted}">${pctStr(pct(size, langTotal))}</text></g>`;
  });
  s += `<text x="250" y="${144 + langRows.length * 26 + 4}" font-size="11" fill="${t.faint}">by bytes · notebooks &amp; markup excluded</text>`;
  // headline numbers
  [[String(toolCount), "tools I've shipped with"], [String(user.repositories.totalCount), "public repos"], [String(STACK.length), "areas, end to end"]].forEach(([v, k], i) => {
    const x = 520 + i * 140;
    s += `<g class="fade" ${delay(0.3 + i * 0.1)}><text x="${x}" y="178" font-size="36" font-weight="800" fill="${t.text}" letter-spacing="-1">${v}</text><text x="${x}" y="202" font-size="13" fill="${t.muted}">${k}</text></g>`;
  });
  s += `<line x1="40" y1="${top - 30}" x2="${W - 40}" y2="${top - 30}" stroke="${t.border}"/>`;

  // icon grid
  let y0 = top;
  for (let g = 0; g < STACK.length; g++) {
    const [label, items] = STACK[g];
    s += `<text x="40" y="${y0 + 28}" font-size="12" font-weight="700" letter-spacing="1" fill="${t.o1}">${esc(label.toUpperCase())}</text>`;
    s += `<text x="40" y="${y0 + 46}" font-size="12" fill="${t.faint}">${items.length} tools</text>`;
    for (let j = 0; j < items.length; j++) {
      const [tool, slug] = items[j];
      const x = gx + (j % perRow) * step, y = y0 + Math.floor(j / perRow) * 78;
      const img = await icon(slug, t.o1);
      s += `<g class="pop" ${delay(0.3 + g * 0.15 + j * 0.03)}>`;
      s += `<rect x="${x + (step - tileS) / 2 - 7}" y="${y}" width="${tileS}" height="${tileS}" rx="13" fill="${t.pill}" stroke="${t.border}"/>`;
      const ix = x + (step - tileS) / 2 - 7;
      s += img
        ? `<image href="${img}" x="${ix + 12}" y="${y + 12}" width="22" height="22"/>`
        : `<text x="${ix + tileS / 2}" y="${y + 30}" text-anchor="middle" font-size="${tool.length > 4 ? 16 : 14}" font-weight="800" fill="${t.o1}">${esc(tool.length <= 4 ? tool : tool[0])}</text>`;
      s += `<text x="${ix + tileS / 2}" y="${y + tileS + 16}" text-anchor="middle" font-size="11" fill="${t.text}">${esc(tool)}</text></g>`;
    }
    y0 += rowsPer[g] * 78 + 14;
    if (g < STACK.length - 1) s += `<line x1="40" y1="${y0 - 7}" x2="${W - 40}" y2="${y0 - 7}" stroke="${t.grid}"/>`;
  }
  s += `</svg>
`;
  writeFileSync(`assets/toolbox-${name}.svg`, s);
}

mkdirSync("assets", { recursive: true });
for (const th of ["dark", "light"]) {
  activity(th); oss(th); arcade(th); await toolbox(th);
  for (const m of MATH) mathTile(m, th);
}
console.log(`built cards · ${recentTotal} contributions (90d), ${yearTotal} (year), ${ext.length} OSS PRs`);
