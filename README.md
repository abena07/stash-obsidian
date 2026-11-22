# stash for obsidian

syncs the links and notes you save with the [stash](https://stash.bennett-eghan.com) discord bot into a folder in your vault.

## install (beta)
stash isn't in obsidian's plugin store yet. until then, install it with brat:
1. in obsidian: **settings → community plugins → browse**, search for **brat** (obsidian42 - brat), install and enable it.
2. run **brat: add a beta plugin for testing** from the command palette (cmd/ctrl + p).
3. paste `abena07/stash-obsidian` and confirm. brat installs stash and keeps it updated.
4. in **settings → community plugins**, switch **stash** on.

## set up
1. in discord, run `/connect obsidian`. stash shows you a code that only you can see.
2. open **settings → stash** and paste the code.
3. that's it. it syncs when obsidian opens, every 30 minutes while it's open, and whenever you run **stash: sync now**.

## more than one server
in your own server and a group server too? in **settings → stash**, press **add server**, run `/connect obsidian` in the other server and paste that code. each server syncs into its own folder (e.g. `stash` and `stash-friends`), and the monthly roundup reads them all.

## what it does
- one markdown file per link in `stash/` (you can change the folder), with frontmatter (url, title, saved and read dates, loved, tags) and your notes from the link's discord thread.
- by default only links you've marked ✅ read. you can pick loved or all.
- **it never overwrites a file you've edited, and never brings back one you've deleted.**
- if a link's title changes, its file is renamed (obsidian keeps links to it working).
- files you downloaded with `/export` are picked up if they're unchanged.

## privacy
the code works like a password and only ever shows your own links (or your server's shared pile). `/disconnect obsidian` turns it off. see stash's [privacy policy](https://stash.bennett-eghan.com/privacy.html).

## self-hosting
if you run your own copy of stash, set **server** in the plugin's settings to your bot's address.

## developing
```sh
npm install
npm test        # the sync rules
npm run build   # main.js
```
copy `main.js` and `manifest.json` into `<your vault>/.obsidian/plugins/stash-sync/` to try it.
