// Builds the animated SVGs used in the profile README.
// Run from the repo root: node scripts/build-svgs.mjs
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("assets", { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------- terminal
const themes = {
  dark: {
    bg: "#0d1117", bar: "#161b22", border: "#30363d", text: "#c9d1d9",
    dim: "#484f58", key: "#ff8a3d", accent: "#58a6ff", ok: "#3fb950", robot: "#8b949e",
  },
  light: {
    bg: "#ffffff", bar: "#f6f8fa", border: "#d0d7de", text: "#24292f",
    dim: "#afb8c1", key: "#d4590f", accent: "#0969da", ok: "#1a7f37", robot: "#57606a",
  },
};

const W = 54; // characters per key/value line
const kv = (key, value) => {
  const dots = Math.max(2, W - key.length - value.length - 3);
  return { key, dots: ".".repeat(dots), value };
};

const info = [
  { head: "aafi@malek" },
  { rule: true },
  kv("OS", "Ahmedabad, Gujarat, IN"),
  kv("Uptime", "on GitHub since Sep 2021"),
  kv("Host", "AI / ML Engineer"),
  kv("Kernel", "agents · retrieval · speech"),
  kv("Shell", "Python · TypeScript · Lean 4"),
  kv("Packages", "PyTorch, LangGraph, FastAPI"),
  kv("IDE", "whichever one ships it"),
  { blank: true },
  kv("Hobbies.RL", "bots that play Wordle, Atari"),
  kv("Hobbies.Math", "Lean 4 proofs on Erdős problems"),
  kv("Status", "open to full-time roles ✓"),
  { blank: true },
  { section: "Contact" },
  kv("Email", "aafimalek2023@gmail.com"),
  kv("LinkedIn", "in/aafi-malek"),
  kv("X", "@aafimalek2032"),
  kv("Medium", "@Aafimalek"),
  { blank: true },
  { palette: true },
];

// every line is exactly 24 columns; BUBBLE / EYES / CHEST are drawn specially
const robot = [
  "  .------------------.  ",
  "BUBBLE",
  "  '----.-------------'  ",
  "        \\               ",
  "   .----------------.   ",
  "   |  .--.    .--.  |   ",
  "EYES",
  "   |  '--'    '--'  |   ",
  "   |     \\____/     |   ",
  "   '-------..-------'   ",
  "  .--------''--------.  ",
  " /|  [ AI  /  ML ]   |\\ ",
  "CHEST",
  "\\_|__________________|_/",
  "     |__|      |__|     ",
  "    (____)    (____)    ",
];
for (const l of robot) if (l.length !== 24 && !/^[A-Z]+$/.test(l)) throw new Error(`robot line not 24 wide: "${l}"`);
const bubbleMsgs = ["beep boop!", "hire aafi :)", "proofs > vibes", "ship > talk"];

function terminal(name) {
  const t = themes[name];
  const lh = 22;
  const top = 74;
  const xL = 34;
  const xR = 402;
  const rows = info.length + 2;
  const height = top + rows * lh + 28;
  const width = 985;
  const font = `'JetBrains Mono','Cascadia Code',Consolas,'SFMono-Regular',Menlo,'DejaVu Sans Mono',monospace`;
  const start = 1.4; // seconds when the output starts appearing

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}" font-size="15">
<style>
  .l { opacity: 0; animation: in .35s ease-out forwards; }
  @keyframes in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
  text { font-variant-ligatures: none; }
  .ch { opacity: 0; animation: show .01s forwards; }
  @keyframes show { to { opacity: 1; } }
  .cursor { animation: blink 1s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .eo { animation: eo 4s step-end infinite; }
  .ec { opacity: 0; animation: ec 4s step-end infinite; }
  @keyframes eo { 0%, 90% { opacity: 1; } 92% { opacity: 0; } 96% { opacity: 1; } }
  @keyframes ec { 0%, 90% { opacity: 0; } 92% { opacity: 1; } 96% { opacity: 0; } }
  .k { fill: ${t.key}; } .d { fill: ${t.dim}; } .v { fill: ${t.text}; } .a { fill: ${t.accent}; } .o { fill: ${t.ok}; }
</style>
<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
<path d="M1 13a12 12 0 0 1 12-12h${width - 26}a12 12 0 0 1 12 12v23H1z" fill="${t.bar}"/>
<line x1="1" y1="36" x2="${width - 1}" y2="36" stroke="${t.border}"/>
<circle cx="22" cy="18.5" r="6" fill="#ff5f57"/><circle cx="42" cy="18.5" r="6" fill="#febc2e"/><circle cx="62" cy="18.5" r="6" fill="#28c840"/>
<text x="${width / 2}" y="23" text-anchor="middle" font-size="13" fill="${t.robot}">aafi@github: ~</text>
<text x="${xL}" y="${top - 2}" xml:space="preserve"><tspan class="o">aafi@github</tspan><tspan class="v">:</tspan><tspan class="a">~</tspan><tspan class="v">$ </tspan>${[..."neofetch"].map((ch, i) => `<tspan class="v ch" style="animation-delay:${(0.3 + i * 0.1).toFixed(1)}s">${ch}</tspan>`).join("")}</text>
`;

  // robot
  const ry = top + lh * 2 + 4;
  const rx = xL + 58;
  const cyc = 2.5 * bubbleMsgs.length;
  robot.forEach((line, i) => {
    const y = ry + i * lh;
    const d = (start + i * 0.05).toFixed(2);
    const at = `class="l" style="animation-delay:${d}s"`;
    if (line === "BUBBLE") {
      out += `<g ${at}><text x="${rx}" y="${y}" xml:space="preserve" fill="${t.robot}">  |                  |  </text>`;
      bubbleMsgs.forEach((m, j) => {
        const pad = 14 - m.length, txt = " ".repeat(Math.floor(pad / 2)) + m + " ".repeat(Math.ceil(pad / 2));
        out += `<text class="msg" style="animation-delay:${(j * 2.5).toFixed(1)}s" x="${rx}" y="${y}" xml:space="preserve" fill="${t.accent}">     ${esc(txt)}</text>`;
      });
      out += `</g>\n`;
    } else if (line === "EYES") {
      const eye = (c) => `   |  |<tspan class="k" font-weight="bold">${c}</tspan> |    |<tspan class="k" font-weight="bold">${c}</tspan> |  |   `;
      out += `<g ${at} fill="${t.robot}"><text x="${rx}" y="${y}" xml:space="preserve" class="eo">${eye("o")}</text><text x="${rx}" y="${y}" xml:space="preserve" class="ec">${eye("-")}</text></g>\n`;
    } else if (line === "CHEST") {
      out += `<text ${at} x="${rx}" y="${y}" xml:space="preserve" fill="${t.robot}">/ |  <tspan class="o">&gt;</tspan><tspan class="o cursor">_</tspan>              | \\</text>\n`;
    } else {
      out += `<text ${at} x="${rx}" y="${y}" xml:space="preserve" fill="${t.robot}">${esc(line)}</text>\n`;
    }
  });
  out = out.replace("</style>", `  .msg { opacity: 0; animation: msg ${cyc}s step-end infinite; }
  @keyframes msg { 0% { opacity: 1; } ${(100 / bubbleMsgs.length).toFixed(2)}% { opacity: 0; } }
</style>`);

  // info column
  info.forEach((row, i) => {
    const y = top + lh * (i + 1) + 4;
    const d = (start + 0.15 + i * 0.09).toFixed(2);
    const open = `<text class="l" style="animation-delay:${d}s" x="${xR}" y="${y}" xml:space="preserve">`;
    if (row.blank) return;
    if (row.head) out += `${open}<tspan class="a" font-weight="bold">aafi</tspan><tspan class="v">@</tspan><tspan class="a" font-weight="bold">malek</tspan></text>\n`;
    else if (row.rule) out += `${open}<tspan class="d">${"─".repeat(W)}</tspan></text>\n`;
    else if (row.section) out += `${open}<tspan class="d">── </tspan><tspan class="a">${row.section}</tspan><tspan class="d"> ${"─".repeat(W - row.section.length - 4)}</tspan></text>\n`;
    else if (row.palette) {
      const cols = ["#0d1117", "#ff5f57", "#3fb950", "#febc2e", "#2f6bff", "#bc8cff", "#39c5cf", "#e6edf3"];
      out += `<g class="l" style="animation-delay:${d}s">` +
        cols.map((c, j) => `<rect x="${xR + j * 30}" y="${y - 14}" width="26" height="18" rx="3" fill="${c}" stroke="${t.border}"/>`).join("") +
        `</g>\n`;
    } else out += `${open}<tspan class="k">${esc(row.key)}</tspan><tspan class="v">: </tspan><tspan class="d">${row.dots}</tspan><tspan class="v"> ${esc(row.value)}</tspan></text>\n`;
  });

  // final prompt with blinking cursor
  const last = (start + 0.15 + info.length * 0.09 + 0.2).toFixed(2);
  const py = top + lh * (info.length + 1) + 10;
  out += `<text class="l" style="animation-delay:${last}s" x="${xL}" y="${py}" xml:space="preserve"><tspan class="o">aafi@github</tspan><tspan class="v">:</tspan><tspan class="a">~</tspan><tspan class="v">$ </tspan><tspan class="v cursor">█</tspan></text>\n`;
  out += `</svg>\n`;
  writeFileSync(`assets/terminal-${name}.svg`, out);
}

terminal("dark");
terminal("light");

// ---------------------------------------------------------------- wordle
const answer = "AGENT";
const guesses = ["CRANE", "AMEND", "AGENT"];

function score(guess) {
  const res = Array(5).fill("x");
  const pool = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = "g";
    else pool[answer[i]] = (pool[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === "g") continue;
    if (pool[guess[i]]) { res[i] = "y"; pool[guess[i]]--; }
  }
  return res;
}

function wordle() {
  const tile = 58, gap = 8, cols = 5, rowsN = 6;
  const boardW = cols * tile + (cols - 1) * gap;
  const width = 420, height = 560;
  const ox = (width - boardW) / 2, oy = 92;
  const fill = { g: "#3fb950", y: "#d29922", x: "#3a3f47" };
  const rowStart = (r) => 0.8 + r * 2.1;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'Segoe UI',Helvetica,Arial,sans-serif">
<style>
  .t { transform-box: fill-box; transform-origin: center; animation: flip .5s ease-in-out both; }
  @keyframes flip { 0% { transform: scaleY(1); } 50% { transform: scaleY(0); } 100% { transform: scaleY(1); } }
  .ch { opacity: 0; animation: pop .15s ease-out forwards; }
  @keyframes pop { from { opacity: 0; } to { opacity: 1; } }
  .win { transform-box: fill-box; transform-origin: center; animation: hop .4s ease-out both; }
  @keyframes hop { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
  .fin { opacity: 0; animation: pop .4s ease-out forwards; }
  ${Object.entries(fill).map(([k, c]) => `.p${k} { animation: p${k} .01s linear both; } @keyframes p${k} { from { fill: transparent; stroke: #565f6b; } to { fill: ${c}; stroke: ${c}; } }`).join("\n  ")}
</style>
<rect width="${width}" height="${height}" rx="14" fill="#0d1117" stroke="#30363d"/>
<text x="${width / 2}" y="44" text-anchor="middle" font-size="26" font-weight="800" letter-spacing="6" fill="#e6edf3">WORDLE</text>
<text x="${width / 2}" y="68" text-anchor="middle" font-size="13" fill="#8b949e">target: the thing I like building most</text>
`;

  for (let r = 0; r < rowsN; r++) {
    const g = guesses[r];
    const sc = g ? score(g) : null;
    const win = g === answer;
    for (let c = 0; c < cols; c++) {
      const x = ox + c * (tile + gap), y = oy + r * (tile + gap);
      if (!g) {
        s += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="4" fill="none" stroke="#30363d" stroke-width="2"/>\n`;
        continue;
      }
      const typeAt = rowStart(r) - 0.7 + c * 0.12;
      const flipAt = rowStart(r) + c * 0.28;
      const paintAt = flipAt + 0.25;
      const hopAt = rowStart(r) + 5 * 0.28 + 0.4 + c * 0.1;
      s += `<g${win ? ` class="win" style="animation-delay:${hopAt.toFixed(2)}s"` : ""}><g class="t" style="animation-delay:${flipAt.toFixed(2)}s">` +
        `<rect class="p${sc[c]}" style="animation-delay:${paintAt.toFixed(2)}s" x="${x}" y="${y}" width="${tile}" height="${tile}" rx="4" stroke-width="2"/>` +
        `<text class="ch" style="animation-delay:${typeAt.toFixed(2)}s" x="${x + tile / 2}" y="${y + tile / 2 + 11}" text-anchor="middle" font-size="31" font-weight="800" fill="#ffffff">${g[c]}</text>` +
        `</g></g>\n`;
    }
  }
  const end = rowStart(guesses.length - 1) + 2.2;
  s += `<text class="fin" style="animation-delay:${end.toFixed(2)}s" x="${width / 2}" y="${oy + 6 * (tile + gap) + 26}" text-anchor="middle" font-size="16" font-weight="700" fill="#3fb950">solved in 3/6 · it's agents, obviously</text>\n`;
  s += `<text x="${width / 2}" y="${height - 16}" text-anchor="middle" font-size="11" fill="#6e7681">a scripted replay · the real RL agent lives in wordle-rl</text>\n`;
  s += `</svg>\n`;
  writeFileSync("assets/wordle.svg", s);
}

wordle();
console.log("built assets/terminal-dark.svg, assets/terminal-light.svg, assets/wordle.svg");
