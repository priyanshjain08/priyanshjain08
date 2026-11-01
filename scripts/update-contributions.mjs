
import fs from "node:fs";
import path from "node:path";

const username = "priyanshjain08";
const token = process.env.GH_TOKEN;

if (!token) {
  throw new Error("GH_TOKEN secret is missing.");
}

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
  throw new Error(JSON.stringify(result.errors, null, 2));
}

const calendar =
  result.data?.user?.contributionsCollection?.contributionCalendar;

if (!calendar) {
  throw new Error("Could not retrieve the contribution calendar.");
}

const total = calendar.totalContributions;

const counts = new Map();

for (const week of calendar.weeks) {
  for (const day of week.contributionDays) {
    counts.set(day.date, day.contributionCount);
  }
}

const start = new Date(Date.UTC(year, 0, 1));
const end = new Date(Date.UTC(year, 11, 31));

const firstMonday = new Date(start);
const offset = (start.getUTCDay() + 6) % 7;
firstMonday.setUTCDate(firstMonday.getUTCDate() - offset);

const cell = 11;
const gap = 3;
const step = cell + gap;
const left = 58;
const top = 38;
const width = 1000;
const height = 170;

function colorFor(count) {
  if (count === 0) return "#161b22";
  if (count <= 2) return "#0e4429";
  if (count <= 4) return "#006d32";
  if (count <= 6) return "#26a641";
  return "#39d353";
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const rects = [];
const months = [];
const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

for (let month = 0; month < 12; month++) {
  const date = new Date(Date.UTC(year, month, 1));
  const daysFromMonday =
    Math.round((date - firstMonday) / 86400000);
  const week = Math.floor(daysFromMonday / 7);

  months.push(
    `<text x="${left + week * step}" y="17" class="month">${monthNames[month]}</text>`
  );
}

for (
  let date = new Date(start);
  date <= end;
  date.setUTCDate(date.getUTCDate() + 1)
) {
  const dateString = date.toISOString().slice(0, 10);
  const count = counts.get(dateString) ?? 0;

  const daysFromMonday =
    Math.round((date - firstMonday) / 86400000);

  const week = Math.floor(daysFromMonday / 7);
  const weekday = daysFromMonday % 7;

  const x = left + week * step;
  const y = top + weekday * step;

  rects.push(`
    <rect
      x="${x}"
      y="${y}"
      width="${cell}"
      height="${cell}"
      rx="2"
      fill="${colorFor(count)}"
    >
      <title>${count} contributions on ${dateString}</title>
    </rect>
  `);
}

const dayLabels = [
  { text: "Mon", row: 0 },
  { text: "Wed", row: 2 },
  { text: "Fri", row: 4 },
];

const labels = dayLabels.map(
  ({ text, row }) =>
    `<text x="30" y="${top + row * step + 9}" class="day">${text}</text>`
).join("");

const legendColors = [0, 1, 3, 5, 7]
  .map((count, index) => `
    <rect
      x="${width - 176 + index * 18}"
      y="143"
      width="12"
      height="12"
      rx="2"
      fill="${colorFor(count)}"
    />
  `).join("");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}">
  <style>
    text {
      font-family: Arial, Helvetica, sans-serif;
      fill: #c9d1d9;
    }
    .heading {
      font-size: 18px;
      font-weight: 600;
    }
    .month {
      font-size: 12px;
    }
    .day {
      font-size: 11px;
      text-anchor: middle;
    }
    .legend {
      font-size: 11px;
      fill: #8b949e;
    }
  </style>

  <text x="0" y="17" class="heading">
    ${total} contributions in ${year}
  </text>

  ${months.join("")}
  ${labels}
  ${rects.join("")}

  <text x="${width - 252}" y="153" class="legend">Less</text>
  ${legendColors}
  <text x="${width - 76}" y="153" class="legend">More</text>
</svg>
`;

const output = path.join(
  process.cwd(),
  "assets",
  "contribution-graph.svg"
);

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg.trim() + "\n", "utf8");

console.log(`Updated ${year} contribution graph: ${total} contributions.`);
