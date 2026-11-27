// Builds the animated intro card (terminal + neural-net mascot) used at the top of the README.
// Run from the repo root: node scripts/build-svgs.mjs
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("assets", { recursive: true });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const themes = {
  dark: {
    bg: "#1d1b20", bar: "#232026", border: "#353139", text: "#f3f1f4", muted: "#a19da6",
    dim: "#4a4650", key: "#ff8a3d", soft: "#ffc08a", ok: "#7ee787", edge: "#3a363e", node: "#2a272e",
  },
  light: {
    bg: "#ffffff", bar: "#f7f6f8", border: "#e3e0e6", text: "#1d1b20", muted: "#65616a",
    dim: "#c4c0c8", key: "#e0600f", soft: "#b3400e", ok: "#1a7f37", edge: "#e3e0e6", node: "#f4f2f6",
  },
};

// plain-English facts; keep these different from what the cards below already show
const WIDTH = 50;
const kv = (key, value) => ({ key, value, dots: ".".repeat(Math.max(2, WIDTH - key.length - value.length - 2)) });
const info = [
  kv("Role", "AI / ML Engineer"),
  kv("Location", "Ahmedabad, India"),
  kv("Timezone", "IST (UTC+5:30)"),
  kv("Focus", "agents · retrieval · speech"),
  kv("On GitHub", "since Sep 2021"),
  kv("Motto", "evals before vibes"),
  kv("Open to", "full-time AI roles ✓"),
];

// pixel-art mascot: a fox peeking over a laptop. Left halves are mirrored to make each row.
// K outline · O orange · D dark orange · W cream · E eye · N nose · L laptop edge · S laptop lid
const FOX_HALF = [
  "......KK.......",
  ".....KOK.......",
  ".....KOOK......",
  "....KODOK......",
  "....KODOOKKKKKK",
  "....KOOOOOOOOOO",
  "...KOOOOOOOOOOO",
  "...KOOOOOOOOOOO",
  "...KOOOEEOOOOOO",
  "...KOOOEEOOOOOO",
  "...KWWOOOOOOOOO",
  "....KWWWWWWWWWN",
  "....KWWWWWWWWWW",
  ".....KWWWWWWWWW",
  "......KKWWWWWWW",
  "..LLLLWWWLLLLLL",
  "..LSSSSSSSSSSSS",
  "..LSSSSSSSSSSSS",
  "..LSSSSSSSSSSSS",
  "..LSSSSSSSSSSSS",
  "..LSSSSSSSSSSSS",
  "..LSSSSSSSSSSSS",
  "..LSSSSSSSSSSSS",
  "..LSSSSSSSSSSSS",
  "..LLLLLLLLLLLLL",
];
const FOX = FOX_HALF.map((h) => h + [...h].reverse().join(""));
// glowing logo on the lid (a lambda)
const LOGO = ["GG...", "..G..", "..GG.", ".G.G.", "G...G"];
// two tail frames, drawn to the right of the laptop as [col,row,char]
const TAIL_A = [[28,9,"W"],[29,9,"W"],[28,10,"O"],[29,10,"W"],[28,11,"O"],[29,11,"O"],[28,12,"O"],[29,12,"O"],[28,13,"D"],[28,14,"D"]];
const TAIL_B = [[30,11,"W"],[31,11,"W"],[29,12,"O"],[30,12,"O"],[31,12,"W"],[28,13,"O"],[29,13,"O"],[30,13,"O"],[28,14,"D"],[29,14,"D"]];
const FLOATERS = ["λ", "∀", "</>", "✓", "{ }"];

function card(name) {
  const t = themes[name];
  const W = 985, H = 420;
  const font = `'JetBrains Mono','Cascadia Code',Consolas,'SFMono-Regular',Menlo,'DejaVu Sans Mono',monospace`;
  
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}" font-size="15">
<style>
  text { font-variant-ligatures: none; }
  .l { opacity: 0; animation: in .35s ease-out forwards; }
  @keyframes in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
  .ch { opacity: 0; animation: show .01s forwards; }
  @keyframes show { to { opacity: 1; } }
  .cursor { animation: blink 1s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .eyes { animation: blinkeye 4.5s step-end infinite; }
  @keyframes blinkeye { 0%, 93% { opacity: 1; } 94%, 97% { opacity: 0; } }
  .tailA { animation: tA 1.6s step-end infinite; } .tailB { opacity: 0; animation: tB 1.6s step-end infinite; }
  @keyframes tA { 0% { opacity: 1; } 50% { opacity: 0; } } @keyframes tB { 0% { opacity: 0; } 50% { opacity: 1; } }
  .logo { animation: logo 2.4s ease-in-out infinite; } @keyframes logo { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  .float { opacity: 0; animation: float 4.5s ease-out infinite; }
  @keyframes float { 0% { opacity: 0; transform: translateY(0); } 15% { opacity: 1; } 70% { opacity: .8; } 100% { opacity: 0; transform: translateY(-130px); } }
</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
<path d="M1 15a14 14 0 0 1 14-14h${W - 30}a14 14 0 0 1 14 14v23H1z" fill="${t.bar}"/>
<line x1="1" y1="38" x2="${W - 1}" y2="38" stroke="${t.border}"/>
<circle cx="24" cy="19.5" r="6" fill="#ff5f57"/><circle cx="44" cy="19.5" r="6" fill="#febc2e"/><circle cx="64" cy="19.5" r="6" fill="#28c840"/>
<text x="${W / 2}" y="24" text-anchor="middle" font-size="13" fill="${t.muted}">aafi@github: ~</text>
`;

  // prompt + typed command
  const cmd = "whoami --verbose";
  s += `<text x="34" y="74" xml:space="preserve"><tspan fill="${t.ok}">aafi@github</tspan><tspan fill="${t.text}">:</tspan><tspan fill="${t.soft}">~</tspan><tspan fill="${t.text}">$ </tspan>${[...cmd].map((c, i) => `<tspan class="ch" style="animation-delay:${(0.3 + i * 0.06).toFixed(2)}s" fill="${t.text}">${esc(c)}</tspan>`).join("")}</text>\n`;

  // ---- mascot
  const px = 10, mx = 58, my = 92;
  const pal = {
    K: name === "dark" ? "#0e0d10" : "#3b2416", O: t.key, D: name === "dark" ? "#c2410c" : "#b3400e",
    W: "#ffe8d2", E: "#1d1b20", N: "#1d1b20", L: name === "dark" ? "#6e6a73" : "#9c98a1",
    S: name === "dark" ? "#34303a" : "#e3e0e6", G: t.key,
  };
  const px1 = (c, r, ch) => `<rect x="${mx + c * px}" y="${my + r * px}" width="${px}" height="${px}" fill="${pal[ch]}"/>`;
  let body = "", eyes = "", logo = "", tailA = "", tailB = "";
  FOX.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === ".") return;
    if (ch === "E") { body += px1(c, r, "O"); eyes += px1(c, r, "E"); }
    else body += px1(c, r, ch);
  }));
  LOGO.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "G") logo += px1(c + 13, r + 18, "G"); }));
  TAIL_A.forEach(([c, r, ch]) => (tailA += px1(c, r, ch)));
  TAIL_B.forEach(([c, r, ch]) => (tailB += px1(c, r, ch)));
  s += `<g class="l" style="animation-delay:.9s" shape-rendering="crispEdges">
<g class="tailA">${tailA}</g><g class="tailB">${tailB}</g>
${body}<g class="eyes">${eyes}</g><g class="logo">${logo}</g>
</g>
`;
  FLOATERS.forEach((f, i) => {
    const x = i % 2 ? mx + 33 * px : mx - 3 * px;
    s += `<text class="float" style="animation-delay:${(1.6 + i * 0.9).toFixed(1)}s" x="${x}" y="${my + 22 * px}" text-anchor="middle" font-size="15" font-weight="bold" fill="${t.key}">${esc(f)}</text>`;
  });
  s += `<text class="l" style="animation-delay:1.3s" x="${mx + 15 * px}" y="${my + 25 * px + 30}" text-anchor="middle" font-size="12" fill="${t.muted}">this is Byte. Byte reviews my PRs.</text>
`;

  // divider
  s += `<line x1="450" y1="100" x2="450" y2="${H - 40}" stroke="${t.border}"/>`;

  // ---- info column
  const xR = 490;
  const start = 0.9;
  s += `<text class="l" style="animation-delay:${start}s" x="${xR}" y="122" font-size="20" font-weight="bold"><tspan fill="${t.text}">Aafi Malek</tspan></text>`;
  s += `<text class="l" style="animation-delay:${start + 0.1}s" x="${xR}" y="146" font-size="13" fill="${t.muted}">I build AI that does the work, then measure if it did.</text>`;
  s += `<line class="l" style="animation-delay:${start + 0.15}s" x1="${xR}" y1="164" x2="${W - 40}" y2="164" stroke="${t.border}"/>`;
  info.forEach((row, i) => {
    const y = 196 + i * 27;
    s += `<text class="l" style="animation-delay:${(start + 0.25 + i * 0.1).toFixed(2)}s" x="${xR}" y="${y}" xml:space="preserve"><tspan fill="${t.key}">${esc(row.key)}</tspan><tspan fill="${t.dim}"> ${row.dots} </tspan><tspan fill="${t.text}">${esc(row.value)}</tspan></text>\n`;
  });
  const py = 196 + info.length * 27 + 14;
  s += `<text class="l" style="animation-delay:${(start + 0.35 + info.length * 0.1).toFixed(2)}s" x="${xR}" y="${py}" xml:space="preserve"><tspan fill="${t.ok}">aafi@github</tspan><tspan fill="${t.text}">:</tspan><tspan fill="${t.soft}">~</tspan><tspan fill="${t.text}">$ </tspan><tspan class="cursor" fill="${t.text}">█</tspan></text>\n`;
  s += `</svg>\n`;
  writeFileSync(`assets/terminal-${name}.svg`, s);
}

card("dark");
card("light");
console.log("built assets/terminal-dark.svg, assets/terminal-light.svg");
