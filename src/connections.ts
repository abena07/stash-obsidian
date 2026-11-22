// a connection is one stash server (discord server) the plugin syncs: its code and its own folder.
// most people have one (their personal server); someone also in a group server adds a second.
//
// kept apart from main.ts so it can be tested without obsidian.

export interface Connection {
  name: string; // shown in settings and messages, e.g. "personal" or "friends"
  code: string;
  folder: string;
}

// settings saved before connections existed had a single code and folder
interface OldSettings {
  code?: string;
  folder?: string;
  connections?: Connection[];
}

export const FIRST_FOLDER = "stash";

// the connections from saved settings. an old single code becomes the first connection,
// keeping its folder, so nothing moves in your vault when you update.
export function fromSaved(saved: OldSettings): Connection[] {
  if (Array.isArray(saved.connections)) return saved.connections.map(clean);
  return [clean({ name: "", code: saved.code ?? "", folder: saved.folder ?? FIRST_FOLDER })];
}

function clean(c: Partial<Connection>): Connection {
  return { name: (c.name ?? "").trim(), code: (c.code ?? "").trim(), folder: (c.folder ?? "").trim() || FIRST_FOLDER };
}

// a folder for a new connection that no other connection uses, e.g. "stash-friends"
export function newFolder(existing: Connection[], name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "server";
  const taken = new Set(existing.map((c) => c.folder));
  let folder = `${FIRST_FOLDER}-${slug}`;
  for (let n = 2; taken.has(folder); n++) folder = `${FIRST_FOLDER}-${slug}-${n}`;
  return folder;
}

// how a connection is named in messages
export function label(c: Connection, index: number): string {
  return c.name || (index === 0 ? "your stash" : `server ${index + 1}`);
}

// folders shared by more than one connection: their files would collide, so say so in settings
export function sharedFolders(connections: Connection[]): string[] {
  const seen = new Map<string, number>();
  for (const c of connections) seen.set(c.folder, (seen.get(c.folder) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([f]) => f);
}

// the folders the plugin writes to. a folder inside another (stash and stash/friends) is
// dropped, since reading the outer one already covers it.
export function readFolders(connections: Connection[]): string[] {
  const folders = [...new Set(connections.map((c) => c.folder.replace(/^\/+|\/+$/g, "")))];
  return folders.filter((f) => !folders.some((o) => o !== f && f.startsWith(`${o}/`)));
}
