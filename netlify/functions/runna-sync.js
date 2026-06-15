const ICS_URL = "https://cal.runna.com/9e29284cfd0a559682dd77338a7b2f03.ics";

// Unfold RFC5545 line folding (continuation lines start with a space or tab)
function unfoldLines(text) {
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(s) {
  if (!s) return s;
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Parse a DTSTART value (handles VALUE=DATE and DATE-TIME, with or without TZID)
function parseDate(value) {
  if (!value) return null;
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo}-${d}`;
}

function parseEvents(icsText) {
  const lines = unfoldLines(icsText);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = rawKey.split(";")[0];

    switch (key) {
      case "UID":
        current.uid = value;
        break;
      case "SUMMARY":
        current.summary = unescapeText(value);
        break;
      case "DESCRIPTION":
        current.description = unescapeText(value);
        break;
      case "DTSTART":
        current.date = parseDate(value);
        break;
      case "DTEND":
        current.endDate = parseDate(value);
        break;
      default:
        break;
    }
  }

  return events;
}

// Pull a distance like "4.5mi" / "4.5 mi" / "10K" / "10k" out of free text
function extractDistance(text) {
  if (!text) return null;
  let m = text.match(/(\d+(?:\.\d+)?)\s*mi\b/i);
  if (m) return { value: parseFloat(m[1]), unit: "mi" };
  m = text.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  if (m) return { value: parseFloat(m[1]), unit: "km" };
  m = text.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (m) return { value: parseFloat(m[1]), unit: "km" };
  return null;
}

// Pull a pace like "9:12/mi" or "9:12 min/mi" out of free text
function extractPace(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2}:\d{2})\s*(?:min)?\s*\/\s*(mi|km)/i);
  if (!m) return null;
  return { pace: m[1], unit: m[2].toLowerCase() };
}

// Pull a duration like "45:12" or "1:32:10" out of free text
function extractDuration(text) {
  if (!text) return null;
  const m = text.match(/\b(\d{1,2}:\d{2}:\d{2}|\d{1,3}:\d{2})\b/);
  return m ? m[1] : null;
}

// Pull split lines such as "Mile 1: 9:05" / "1km: 5:30" / "1.00 mi @ 10:31 /mi"
function extractSplits(text) {
  if (!text) return [];
  const splits = [];
  const lines = text.split("\n");
  let autoIndex = 0;
  for (const line of lines) {
    let m = line.match(/^\s*(?:Mile|Km|KM|Lap)\s*(\d+)\s*[:\-]\s*(\d{1,2}:\d{2})/i);
    if (m) {
      splits.push({ index: parseInt(m[1], 10), time: m[2] });
      continue;
    }
    m = line.match(/^\s*([\d.]+)\s*(mi|km)\s*@\s*(\d{1,2}:\d{2})\s*\/\s*(?:mi|km)/i);
    if (m) {
      autoIndex++;
      splits.push({ index: autoIndex, distance: parseFloat(m[1]), unit: m[2].toLowerCase(), time: m[3] });
    }
  }
  return splits;
}

// Strip the "📲 View in the Runna app: <link>" line from descriptions
function cleanDescription(text) {
  if (!text) return text;
  return text
    .split("\n")
    .filter((line) => !/view in the runna app/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Map a Runna workout type (from UID or SUMMARY) to this app's category tags
const TYPE_TAG_MAP = {
  EASY_RUN: { tag: "easy", z2: true },
  LONG_RUN: { tag: "long", z2: true },
  RECOVERY_RUN: { tag: "easy", z2: true },
  PROGRESSION_RUN: { tag: "tempo", z2: false },
  TEMPO: { tag: "tempo", z2: false },
  TEMPO_RUN: { tag: "tempo", z2: false },
  OVER_UNDER: { tag: "tempo", z2: false },
  OVER_UNDERS: { tag: "tempo", z2: false },
  STEADY_STATE: { tag: "tempo", z2: false },
  INTERVAL: { tag: "intervals", z2: false },
  INTERVALS: { tag: "intervals", z2: false },
  REPS: { tag: "intervals", z2: false },
  HILL: { tag: "hills", z2: false },
  HILLS: { tag: "hills", z2: false },
  HILL_REPS: { tag: "hills", z2: false },
  RACE: { tag: "race", z2: false },
  REST: { tag: "rest", z2: false },
  STRENGTH: { tag: "strength", z2: false },
};

// Parse plan_week_<N>_<TYPE>_<idx> from a planned-workout UID
function parsePlanUid(uid) {
  const m = uid.match(/plan_week_(\d+)_([A-Z0-9_]+?)_(\d+)$/i);
  if (!m) return { week: null, type: null, index: null };
  return { week: parseInt(m[1], 10), type: m[2].toUpperCase(), index: parseInt(m[3], 10) };
}

exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  let icsText;
  try {
    const res = await fetch(ICS_URL);
    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Failed to fetch Runna feed", status: res.status }) };
    }
    icsText = await res.text();
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Failed to fetch Runna feed", message: err.message }) };
  }

  const events = parseEvents(icsText);

  const planned = [];
  const completed = [];

  for (const ev of events) {
    if (!ev.uid || !ev.date) continue;

    if (ev.uid.startsWith("plan_week_") || ev.uid.toUpperCase().includes("UPCOMING_PLAN_WORKOUT")) {
      const { week, type, index } = parsePlanUid(ev.uid);
      const description = cleanDescription(ev.description);
      const distance = extractDistance(ev.summary) || extractDistance(description);
      const mapped = type && TYPE_TAG_MAP[type] ? TYPE_TAG_MAP[type] : { tag: null, z2: false };
      planned.push({
        uid: ev.uid,
        date: ev.date,
        week,
        type,
        index,
        title: ev.summary || null,
        description: description || null,
        distance: distance ? distance.value : null,
        distanceUnit: distance ? distance.unit : null,
        tag: mapped.tag,
        z2: mapped.z2,
      });
    } else if (ev.uid.toUpperCase().includes("COMPLETED_NON_PLAN_WORKOUT") || ev.uid.startsWith("completed_")) {
      const description = cleanDescription(ev.description);
      const distance = extractDistance(ev.summary) || extractDistance(description);
      const pace = extractPace(description) || extractPace(ev.summary);
      const duration = extractDuration(description);
      const splits = extractSplits(description);
      completed.push({
        uid: ev.uid,
        date: ev.date,
        title: ev.summary || null,
        description: description || null,
        distance: distance ? distance.value : null,
        distanceUnit: distance ? distance.unit : null,
        pace: pace ? pace.pace : null,
        paceUnit: pace ? pace.unit : null,
        duration,
        splits,
      });
    }
  }

  planned.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  completed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { statusCode: 200, headers, body: JSON.stringify({ planned, completed }) };
};
