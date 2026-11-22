import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath, requestUrl } from "obsidian";
import { Action, RemoteFile, State, nextState, plan, summary } from "./sync.ts";
import * as roundup from "./roundup.ts";

// the public stash bot. people who self-host change this in settings.
const DEFAULT_SERVER = "https://api.stash.bennett-eghan.com";

interface Settings {
  server: string;
  code: string;
  folder: string;
  which: "read" | "loved" | "all";
  intervalMinutes: number;
  roundupFolder: string;
  roundupCount: number;
  roundupNotes: boolean;
}

const DEFAULTS: Settings = {
  server: DEFAULT_SERVER,
  code: "",
  folder: "stash",
  which: "read",
  intervalMinutes: 30,
  roundupFolder: "roundups",
  roundupCount: 7,
  roundupNotes: false, // notes are private in discord; a roundup is public, so opt in
};

interface Saved {
  settings: Settings;
  state: State;
}

export default class StashPlugin extends Plugin {
  settings: Settings = { ...DEFAULTS };
  state: State = {};
  private timer: number | null = null;
  private syncing = false;

  async onload() {
    const saved = ((await this.loadData()) ?? {}) as Partial<Saved>;
    this.settings = { ...DEFAULTS, ...(saved.settings ?? {}) };
    this.state = saved.state ?? {};

    this.addCommand({ id: "sync-now", name: "Sync now", callback: () => this.sync(true) });
    this.addCommand({
      id: "roundup-last-month", name: "Make monthly roundup (last month)",
      callback: () => this.makeRoundup(roundup.monthOf(new Date(), -1)),
    });
    this.addCommand({
      id: "roundup-this-month", name: "Make monthly roundup (this month so far)",
      callback: () => this.makeRoundup(roundup.monthOf(new Date(), 0)),
    });
    this.addSettingTab(new StashSettings(this.app, this));
    this.app.workspace.onLayoutReady(() => this.sync(false));
    this.schedule();
  }

  async persist() {
    await this.saveData({ settings: this.settings, state: this.state } satisfies Saved);
  }

  schedule() {
    if (this.timer !== null) window.clearInterval(this.timer);
    const minutes = Math.max(5, this.settings.intervalMinutes);
    this.timer = window.setInterval(() => this.sync(false), minutes * 60 * 1000);
    this.registerInterval(this.timer);
  }

  async sync(loud: boolean) {
    if (this.syncing) return;
    if (!this.settings.code) {
      if (loud) new Notice("stash: add your code in settings first. get one with /connect obsidian in discord.");
      return;
    }
    this.syncing = true;
    try {
      const files = await this.fetchFiles();
      const vault = this.app.vault;
      const read = async (path: string) => {
        const file = vault.getAbstractFileByPath(normalizePath(path));
        return file instanceof TFile ? await vault.read(file) : null;
      };
      const actions = await plan(files, this.state, this.settings.folder, read);
      await this.apply(actions);
      this.state = nextState(this.state, actions);
      await this.persist();
      const changed = actions.some((a) => !["unchanged"].includes(a.kind));
      if (loud || changed) new Notice(summary(actions), 8000);
    } catch (err) {
      console.error("stash sync failed", err);
      if (loud) new Notice(`stash: ${err instanceof Error ? err.message : "sync failed"}`, 8000);
    } finally {
      this.syncing = false;
    }
  }

  async makeRoundup(month: string) {
    const vault = this.app.vault;
    const folder = normalizePath(this.settings.folder);
    const files = vault.getMarkdownFiles().filter((f) => f.path.startsWith(`${folder}/`));
    const entries = (await Promise.all(files.map(async (f) => roundup.parseStashFile(await vault.read(f)))))
      .filter((e): e is roundup.Entry => e !== null);
    const picked = roundup.pick(entries, month, this.settings.roundupCount);
    if (picked.length === 0) {
      new Notice(`stash: nothing loved in ${roundup.monthName(month)} yet. react 👍 on links in discord, then sync.`, 8000);
      return;
    }

    const outFolder = normalizePath(this.settings.roundupFolder || "roundups");
    const path = normalizePath(`${outFolder}/${roundup.fileName(month)}`);
    const existing = vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      // never overwrite: you may have edited it already
      new Notice(`stash: the ${roundup.monthName(month)} roundup already exists, opening it.`, 8000);
      await this.app.workspace.getLeaf(true).openFile(existing);
      return;
    }
    if (!vault.getAbstractFileByPath(outFolder)) await vault.createFolder(outFolder);
    const text = roundup.render(picked, month, roundup.postDate(month, new Date()), this.settings.roundupNotes);
    const file = await vault.create(path, text);
    await this.app.workspace.getLeaf(true).openFile(file);
    new Notice(`stash: made your ${roundup.monthName(month)} roundup with ${picked.length} link${picked.length === 1 ? "" : "s"}.`, 8000);
  }

  private async fetchFiles(): Promise<RemoteFile[]> {
    const base = this.settings.server.replace(/\/+$/, "");
    const response = await requestUrl({
      url: `${base}/api/v1/links?which=${encodeURIComponent(this.settings.which)}`,
      headers: { Authorization: `Bearer ${this.settings.code.trim()}` },
      throw: false,
    });
    if (response.status === 401) throw new Error("that code doesn't work. get a new one with /connect obsidian.");
    if (response.status === 429) throw new Error("syncing too often. try again in a minute.");
    if (response.status !== 200) throw new Error(`the server answered ${response.status}.`);
    return (response.json as { files: RemoteFile[] }).files;
  }

  private async apply(actions: Action[]) {
    const vault = this.app.vault;
    const folder = normalizePath(this.settings.folder);
    if (folder && folder !== "/" && !vault.getAbstractFileByPath(folder)) {
      await vault.createFolder(folder);
    }
    for (const a of actions) {
      if (a.kind === "create") {
        await vault.create(normalizePath(a.path), a.content);
      } else if (a.kind === "update") {
        const file = vault.getAbstractFileByPath(normalizePath(a.path));
        if (file instanceof TFile) await vault.modify(file, a.content);
      } else if (a.kind === "rename") {
        const file = vault.getAbstractFileByPath(normalizePath(a.from));
        if (file instanceof TFile) {
          await this.app.fileManager.renameFile(file, normalizePath(a.to)); // keeps links to it working
          const moved = vault.getAbstractFileByPath(normalizePath(a.to));
          if (moved instanceof TFile) await vault.modify(moved, a.content);
        }
      }
    }
  }
}

class StashSettings extends PluginSettingTab {
  constructor(app: App, private plugin: StashPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    containerEl.createEl("p", {
      text: "stash syncs the links you save with the stash discord bot into a folder here. "
        + "files you edit are never overwritten.",
    });

    new Setting(containerEl)
      .setName("Code")
      .setDesc("run /connect obsidian in discord and paste the code here. it works like a password.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("stash_…").setValue(s.code).onChange(async (v) => {
          s.code = v.trim();
          await this.plugin.persist();
        });
      });

    new Setting(containerEl)
      .setName("Folder")
      .setDesc("where the files go in your vault.")
      .addText((t) => t.setValue(s.folder).onChange(async (v) => {
        s.folder = v.trim() || "stash";
        await this.plugin.persist();
      }));

    new Setting(containerEl)
      .setName("Which links")
      .addDropdown((d) => d
        .addOption("read", "read or loved (✅ or 👍)")
        .addOption("loved", "loved (marked 👍)")
        .addOption("all", "all saved links")
        .setValue(s.which)
        .onChange(async (v) => {
          s.which = v as Settings["which"];
          await this.plugin.persist();
        }));

    new Setting(containerEl)
      .setName("Sync every")
      .setDesc("minutes, while obsidian is open (at least 5).")
      .addText((t) => t.setValue(String(s.intervalMinutes)).onChange(async (v) => {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n) && n >= 5) {
          s.intervalMinutes = n;
          await this.plugin.persist();
          this.plugin.schedule();
        }
      }));

    new Setting(containerEl)
      .setName("Server")
      .setDesc("leave as is unless you run your own copy of stash.")
      .addText((t) => t.setValue(s.server).onChange(async (v) => {
        s.server = v.trim() || DEFAULT_SERVER;
        await this.plugin.persist();
      }));

    new Setting(containerEl)
      .addButton((b) => b.setButtonText("Sync now").setCta().onClick(() => this.plugin.sync(true)));

    new Setting(containerEl).setName("Monthly roundup").setHeading();
    containerEl.createEl("p", {
      text: "run \"stash: make monthly roundup\" from the command palette to turn the links you loved (👍) "
        + "that month into a post for your site, grouped by tag.",
    });

    new Setting(containerEl)
      .setName("Roundup folder")
      .addText((t) => t.setValue(s.roundupFolder).onChange(async (v) => {
        s.roundupFolder = v.trim() || "roundups";
        await this.plugin.persist();
      }));

    new Setting(containerEl)
      .setName("Links per roundup")
      .addText((t) => t.setValue(String(s.roundupCount)).onChange(async (v) => {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n) && n >= 1) {
          s.roundupCount = n;
          await this.plugin.persist();
        }
      }));

    new Setting(containerEl)
      .setName("Include my notes")
      .setDesc("off by default: your notes are private in discord, and a roundup is meant to be published. "
        + "turn on to add your first note on each link as a short comment.")
      .addToggle((t) => t.setValue(s.roundupNotes).onChange(async (v) => {
        s.roundupNotes = v;
        await this.plugin.persist();
      }));
  }
}
