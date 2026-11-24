// Pulls hours from the Practice Lobby hub into site/data/practicelobby.json before the Hugo build.
// If the hub can't be reached, the committed copy is kept so the build still succeeds.
const fs = require("fs");
const path = require("path");

const SOURCE = "https://app.practicelobby.com/api/sites/trestleschiropractic.com/content.json";
const OUT = path.join(__dirname, "../site/data/practicelobby.json");

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function time(hhmm, lower) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
  return lower ? `${t}${h < 12 ? "am" : "pm"}` : `${t} ${h < 12 ? "AM" : "PM"}`;
}

const rangesText = (ranges, lower) =>
  ranges.map((r) => `${time(r.opens, lower)} - ${time(r.closes, lower)}`).join(", ");

function build(content) {
  const days = content.hours.map((d) => ({
    day: cap(d.day),
    short: cap(d.day.slice(0, 3)),
    open: d.ranges.length > 0,
    text: d.ranges.length ? rangesText(d.ranges) : "Closed",
    ranges: d.ranges,
  }));

  // Consecutive days with the same hours, e.g. "Mon - Fri 9am - 7pm and Sat 9am - 1pm"
  const groups = [];
  for (const d of days) {
    const last = groups[groups.length - 1];
    if (last && last.text === d.text) last.to = d;
    else groups.push({ from: d, to: d, text: d.text });
  }
  const parts = groups
    .filter((g) => g.from.open)
    .map((g) => {
      const label = g.from === g.to ? g.from.short : `${g.from.short} - ${g.to.short}`;
      return `${label} ${rangesText(g.from.ranges, true)}`;
    });
  const summary =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join("");

  // schema.org openingHoursSpecification: one entry per distinct time range
  const openingHours = [];
  for (const d of days) {
    for (const r of d.ranges) {
      const spec = openingHours.find((s) => s.opens === r.opens && s.closes === r.closes);
      if (spec) spec.days.push(d.day);
      else openingHours.push({ days: [d.day], opens: r.opens, closes: r.closes });
    }
  }

  return { generatedOn: content.generatedOn, days, summary, openingHours };
}

async function main() {
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content = await res.json();
    if (!Array.isArray(content.hours) || content.hours.length !== 7) throw new Error("unexpected hours format");
    fs.writeFileSync(OUT, JSON.stringify(build(content), null, 2) + "\n");
    console.log(`Practice Lobby hours updated (${content.generatedOn})`);
  } catch (err) {
    if (!fs.existsSync(OUT)) throw err;
    console.warn(`Practice Lobby fetch failed (${err.message}); using committed hours`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
