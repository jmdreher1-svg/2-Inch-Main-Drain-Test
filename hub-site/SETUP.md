# How to publish the hub site

This folder contains the landing page for **John Dreher's Fire Protection
Engineering Tools**. To make it live at `https://jmdreher1-svg.github.io`,
follow these steps.

## 1. Create the hub repo

On GitHub, create a new public repository named **exactly**:

    jmdreher1-svg.github.io

The name must match your username exactly — that's the magic name that
tells GitHub to serve the repo at the root URL `https://jmdreher1-svg.github.io`.

## 2. Copy these files into the new repo

From this folder (`hub-site/`), copy `index.html` and `styles.css` into the
root of the new `jmdreher1-svg.github.io` repo and push them to `main`.

You can do this from your terminal:

```bash
# clone the empty new repo
git clone https://github.com/jmdreher1-svg/jmdreher1-svg.github.io.git
cd jmdreher1-svg.github.io

# copy the two files from this repo
cp /path/to/2-Inch-Main-Drain-Test/hub-site/index.html .
cp /path/to/2-Inch-Main-Drain-Test/hub-site/styles.css .

git add index.html styles.css
git commit -m "Initial hub site"
git push origin main
```

## 3. Enable GitHub Pages on each repo

You'll need Pages enabled in three places:

| Repo | Pages branch | Pages URL |
|---|---|---|
| `jmdreher1-svg.github.io` (hub) | `main`, root | `https://jmdreher1-svg.github.io` |
| `2-Inch-Main-Drain-Test` | `main`, root | `https://jmdreher1-svg.github.io/2-Inch-Main-Drain-Test/` |
| `Fire-Pump-Test-Curves` | `main`, root | `https://jmdreher1-svg.github.io/Fire-Pump-Test-Curves/` |

For each repo:

1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` (or whichever branch has your built site)
4. Folder: `/ (root)`
5. Click **Save**

Wait ~1 minute. The published URL appears at the top of the Pages settings
page.

## 4. Verify the links

Once all three Pages sites are live, click each "Launch tool" card from
the hub and confirm they load. If a card 404s, double-check:

- The repo is **public** (Pages doesn't work on private repos on the free
  tier without Pro).
- Repo name capitalization in the URL matches the actual repo name. GitHub
  is usually case-insensitive about this, but Pages can be picky.

## 5. Adding more tools later

When you build a new tool:

1. Push it to its own repo, enable Pages on that repo.
2. Edit `index.html` in the hub repo and copy the `<a class="tool-card">…</a>`
   block for a new card. Change the `href`, `<h3>`, description, and SVG
   icon.
3. Commit and push. The hub redeploys in ~30 seconds.

## Notes on case sensitivity

This drain-test repo currently uses mixed case (`2-Inch-Main-Drain-Test`).
The hub links use the same case. If you ever rename a repo to all-lowercase,
update the `href` values in `index.html`.
