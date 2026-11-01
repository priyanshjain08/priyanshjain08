
import fs from "node:fs";
import path from "node:path";

const username = "priyanshjain08";
const token = process.env.GH_TOKEN;

if (!token) throw new Error("GH_TOKEN secret is missing.");

const year = new Date().getUTCFullYear();

const query = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      from: `${year}-01-01T00:00:00Z`,
      to: `${year}-12-31T23:59:59Z`,
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub API error: ${response.status}`);
}

const result = await response.json();

if (result.errors?.length) {
  throw new Error(JSON.stringify(result.errors));
}

const calendar =
  result.data?.user?.contributionsCollection?.contributionCalendar;

if (!calendar) throw new Error("Contribution calendar unavailable.");

const total = calendar.totalContributions;

// Convert daily contributions into weekly totals.
const weekly = calendar.weeks.map((week) =>
  week.contributionDays.reduce(
    (sum, day) => sum + day.contributionCount,
    0
  )
);

const width = 1000;
const height = 330;
const left = 65;
const right = 25;
const top = 55;
const bottom = 65;

const chartWidth = width - left - right;
const chartHeight = height - top - bottom;

const maxValue = Math.max(5, ...weekly);
const yMax = Math.ceil(maxValue / 5) * 5;

const x = (i) =>
  left + (i / Math.max(1, weekly.length - 1)) * chartWidth;

const y = (value) =>
  top + chartHeight - (value / yMax) * chartHeight;

// const points = weekly
//   .map((value, i) => `${x(i)},${y(value)}`)
//   .join(" ");
const coords = weekly.map((value, i) => ({
  x: x(i),
  y: y(value)
}));

function smoothPath(points, tension = 0.65) {
  if (points.length < 2) return "";

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6 * tension;
    const cp1y = p1.y + (p2.y - p0.y) / 6 * tension;

    const cp2x = p2.x - (p3.x - p1.x) / 6 * tension;
    const cp2y = p2.y - (p3.y - p1.y) / 6 * tension;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

const curve = smoothPath(coords, 0.65);
const areaPath = [
  `M ${x(0)} ${top + chartHeight}`,
  ...weekly.map((value, i) => `L ${x(i)} ${y(value)}`),
  `L ${x(weekly.length - 1)} ${top + chartHeight}`,
  "Z",
].join(" ");

const gridLines = Array.from({ length: 5 }, (_, i) => {
  const value = (yMax / 4) * i;
  const yy = y(value);

  return `
    <line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"
      stroke="#30363d" stroke-width="1" />
    <text x="${left - 14}" y="${yy + 4}" text-anchor="end"
      class="axis">${Math.round(value)}</text>
  `;
}).join("");

const monthLabels = Array.from({ length: 12 }, (_, month) => {
  const date = new Date(Date.UTC(year, month, 1));
  const weekIndex = calendar.weeks.findIndex((week) =>
    week.contributionDays.some((day) =>
      day.date === date.toISOString().slice(0, 10)
    )
  );

  if (weekIndex < 0) return "";

  const labels = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  return `
    <text x="${x(weekIndex)}" y="${height - 24}"
      text-anchor="middle" class="month">${labels[month]}</text>
  `;
}).join("");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}">

  <defs>
    <linearGradient id="blueArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#1f6feb" stop-opacity="0.02"/>
    </linearGradient>
  </defs>

  <style>
    text {
      font-family: Arial, Helvetica, sans-serif;
      fill: #c9d1d9;
    }
    .title {
      font-size: 21px;
      font-weight: 600;
    }
    .subtitle {
      font-size: 12px;
      fill: #8b949e;
    }
    .axis {
      font-size: 11px;
      fill: #8b949e;
    }
    .month {
      font-size: 12px;
      fill: #8b949e;
    }
  </style>

  <text x="${left}" y="27" class="title">
    Contribution Activity
  </text>

  <text x="${width - right}" y="27"
        text-anchor="end" class="subtitle">
    ${total} contributions in ${year}
  </text>

  ${gridLines}

  <path d="${areaPath}" fill="url(#blueArea)" />

  <polyline
    points="${points}"
    fill="none"
    stroke="#58a6ff"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  ${monthLabels}

  <text x="${left}" y="${height - 5}" class="subtitle">
    Weekly contribution count
  </text>
</svg>
`;

const output = path.join(
  process.cwd(),
  "assets",
  "contribution-graph.svg"
);

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg.trim() + "\n", "utf8");

console.log(`Generated blue graph: ${total} contributions in ${year}.`);
