// what a sync should do, worked out without touching obsidian so it can be tested on its own.
//
// the rules:
// - a file the plugin wrote, and you haven't changed since, is updated when stash has something new
// - a file you've edited is never overwritten, and a file you've deleted isn't brought back
// - if a link's title changes, its file is renamed (unless you edited it)
// - a file already in the folder that the plugin didn't write (e.g. from /export) is only taken
//   over if it's identical to what stash would write; otherwise it's left alone

export interface RemoteFile {
  id: number;
  name: string; // e.g. "inside .git.md"
  content: string;
}

export interface Known {
  path: string; // where the plugin last wrote it
  hash: string; // hash of what it wrote
}

export type State = Record<string, Known>; // by stash id

export type Action =
  | { kind: "create"; id: number; path: string; content: string }
  | { kind: "update"; id: number; path: string; content: string }
  | { kind: "rename"; id: number; from: string; to: string; content: string }
  | { kind: "adopt"; id: number; path: string; content: string }
  | { kind: "skip-edited"; id: number; path: string }
  | { kind: "skip-deleted"; id: number; path: string }
  | { kind: "skip-taken"; id: number; path: string }
  | { kind: "unchanged"; id: number; path: string };

// what's currently in the vault at a path: its content, or null if there's no file
export type Reader = (path: string) => Promise<string | null>;

// small, fast, non-cryptographic string hash (cyrb53). only used to notice edits.
export function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function joinPath(folder: string, name: string): string {
  const clean = folder.replace(/^\/+|\/+$/g, "");
  return clean ? `${clean}/${name}` : name;
}

export async function plan(files: RemoteFile[], state: State, folder: string, read: Reader): Promise<Action[]> {
  const actions: Action[] = [];
  for (const file of files) {
    const target = joinPath(folder, file.name);
    const known = state[String(file.id)];
    const newHash = hash(file.content);

    if (known) {
      const current = await read(known.path);
      if (current === null) {
        // you deleted (or moved) the file: respect that and don't bring it back
        actions.push({ kind: "skip-deleted", id: file.id, path: known.path });
        continue;
      }
      if (hash(current) !== known.hash) {
        actions.push({ kind: "skip-edited", id: file.id, path: known.path });
        continue;
      }
      if (known.path !== target && (await read(target)) === null) {
        actions.push({ kind: "rename", id: file.id, from: known.path, to: target, content: file.content });
      } else if (known.hash !== newHash) {
        actions.push({ kind: "update", id: file.id, path: known.path, content: file.content });
      } else {
        actions.push({ kind: "unchanged", id: file.id, path: known.path });
      }
      continue;
    }

    const existing = await read(target);
    if (existing === null) {
      actions.push({ kind: "create", id: file.id, path: target, content: file.content });
    } else if (existing === file.content) {
      actions.push({ kind: "adopt", id: file.id, path: target, content: file.content });
    } else {
      actions.push({ kind: "skip-taken", id: file.id, path: target });
    }
  }
  return actions;
}

// the state after the actions have been carried out
export function nextState(state: State, actions: Action[]): State {
  const next: State = { ...state };
  for (const a of actions) {
    if (a.kind === "create" || a.kind === "update" || a.kind === "adopt") {
      next[String(a.id)] = { path: a.path, hash: hash(a.content) };
    } else if (a.kind === "rename") {
      next[String(a.id)] = { path: a.to, hash: hash(a.content) };
    }
  }
  return next;
}

export function summary(actions: Action[]): string {
  const count = (...kinds: Action["kind"][]) => actions.filter((a) => kinds.includes(a.kind)).length;
  const parts = [];
  const added = count("create", "adopt");
  const changed = count("update", "rename");
  const edited = count("skip-edited");
  const taken = count("skip-taken");
  if (added) parts.push(`${added} new`);
  if (changed) parts.push(`${changed} updated`);
  if (edited) parts.push(`${edited} left alone because you edited ${edited === 1 ? "it" : "them"}`);
  if (taken) parts.push(`${taken} skipped because a different file already has that name`);
  return parts.length ? `stash: ${parts.join(", ")}.` : "stash: everything is up to date.";
}
