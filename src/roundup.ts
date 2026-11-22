// a monthly roundup post built from the files in the stash folder, in the website's post format:
//
//   export const meta = { title: "...", date: "...", tags: [...] }
//
//   my favourite reads from november.
//
//   ### design
//   - [how to do great work](https://...): wow paul
//
// kept apart from obsidian so it can be tested on its own.

export interface Entry {
  url: string;
  title: string;
  read: string | null; // yyyy-mm-dd
  loved: boolean;
  lovedOn: string | null; // yyyy-mm-dd, when you 👍'd it
  tags: string[];
  note: string | null; // the first note, if any
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

// reads one of stash's own markdown files back into an entry. returns null for anything else.
export function parseStashFile(text: string): Entry | null {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (fields.source !== "stash" || !fields.url) return null;

  const str = (v: string | undefined) => {
    if (v === undefined) return "";
    try { return String(JSON.parse(v)); } catch { return v; }
  };
  let tags: string[] = [];
  try { tags = JSON.parse(fields.tags ?? "[]"); } catch { tags = []; }

  const notes = match[2].split(/\n## notes\n/)[1] ?? "";
  const first = notes.split("\n").find((l) => l.startsWith("- "));
  const note = first ? first.slice(2).replace(/\s*\([^()]*, \d{4}-\d{2}-\d{2}\)\s*$/, "").trim() : null;

  return {
    url: str(fields.url),
    title: str(fields.title) || str(fields.url),
    read: /^\d{4}-\d{2}-\d{2}$/.test(fields.read ?? "") ? fields.read : null,
    loved: fields.loved === "true",
    lovedOn: fields.loved === "true" && /^\d{4}-\d{2}-\d{2}$/.test(fields.loved_on ?? "") ? fields.loved_on : null,
    tags: Array.isArray(tags) ? tags.map(String) : [],
    note: note || null,
  };
}

// links you loved in `month` ("yyyy-mm"), most recently loved first, at most `count`.
// a month with fewer loved links just makes a shorter post: nothing unloved is added to fill it.
export function pick(entries: Entry[], month: string, count: number): Entry[] {
  return entries
    .filter((e) => e.loved && e.lovedOn?.startsWith(month))
    .sort((a, b) => (b.lovedOn ?? "").localeCompare(a.lovedOn ?? ""))
    .slice(0, Math.max(1, count));
}

// text that's safe inside mdx: braces and angle brackets would otherwise be read as code or html
export function mdxText(text: string): string {
  return text.replace(/[\\{}<>[\]]/g, (c) => `\\${c}`).replace(/\s+/g, " ").trim();
}

// brackets and spaces would end a markdown link early (encodeURIComponent leaves brackets alone)
function linkUrl(url: string): string {
  return url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20");
}

export function monthName(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${year}`;
}

export function fileName(month: string): string {
  return `stash-roundup-${month}.md`;
}

export function render(entries: Entry[], month: string, date: string, withNotes: boolean): string {
  const name = monthName(month);
  const lines = [
    "export const meta = {",
    `  title: ${JSON.stringify(`stash roundup: ${name}`)},`,
    `  date: ${JSON.stringify(date)},`,
    `  tags: ["stash", "reading"]`,
    "}",
    "",
    `my favourite reads from ${name.split(" ")[0]}.`,
    "",
  ];

  // group by each link's first tag, in order of first appearance; untagged links go last
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.tags[0] ?? "";
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const untagged = groups.get("");
  groups.delete("");
  const useHeadings = groups.size > 0;
  const ordered: [string, Entry[]][] = [...groups.entries()];
  if (untagged) ordered.push([useHeadings ? "everything else" : "", untagged]);

  for (const [heading, group] of ordered) {
    if (useHeadings) lines.push(`### ${mdxText(heading)}`, "");
    for (const e of group) {
      const comment = withNotes && e.note ? `: ${mdxText(e.note)}` : "";
      lines.push(`- [${mdxText(e.title)}](${linkUrl(e.url)})${comment}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// "yyyy-mm" for the month before `today`, or the current one
export function monthOf(today: Date, offset: 0 | -1): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// the post's date line, in the site's style ("november 30, 2026"): the month's last day, or today if sooner
export function postDate(month: string, today: Date): string {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0));
  const day = last < today ? last : today;
  return `${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}, ${day.getUTCFullYear()}`;
}
