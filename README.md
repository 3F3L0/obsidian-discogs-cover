# Discogs Cover

Shows the Discogs cover art for a note whenever its frontmatter has a `discogs` property (a release ID, or a Discogs release URL containing one). The cover is displayed above the note title in both Reading view and Live Preview, and the same local cache can be reused from a [Base](https://help.obsidian.md/bases) image column.

## Features

- Displays the cover above the title in **Reading view** and **Live Preview**
- Downloads each cover **once** and caches it locally in the vault (`_discogs-covers/<releaseId>.jpg`), so it works offline and never re-downloads the same release
- The cache is a normal vault folder, so it can be referenced from a Base formula, e.g.:
  ```yaml
  formulas:
    discogs_image: 'link("_discogs-covers/" + discogs + ".jpg")'
  ```
- Command to pre-fill the cache for every note at once: **"Cache all Discogs covers"**
- Optional personal Discogs API token (raises the rate limit from 25 to 60 requests/min)
- Configurable image size and alignment
- Interface available in English and French (follows Obsidian's own display language)

## How it works

1. Add a `discogs` property to a note's frontmatter, with the release ID (e.g. `discogs: "395976"`) or a Discogs release URL.
2. Open the note in Reading view or Live Preview: the cover appears above the title.
3. The image is fetched once from the [Discogs API](https://www.discogs.com/developers), saved under `_discogs-covers/` in your vault, and reused from there afterwards.

To pre-populate the cache for every note that has a `discogs` property (useful before browsing a Base gallery), run **"Cache all Discogs covers"** from the command palette.

## Permissions

The **"Cache all Discogs covers"** command lists every markdown file in the vault (`vault.getMarkdownFiles()`) in order to find the ones with a `discogs` property and pre-fill the local cache for all of them at once. No file content is read beyond its already-indexed frontmatter, and nothing ever leaves the vault except the Discogs release ID sent to `api.discogs.com`.

## Settings

- **Maximum image size** — max width/height of the cover, in pixels (default 300).
- **Alignment** — left / center / right.
- **Discogs token (optional)** — a personal access token from [discogs.com/settings/developers](https://www.discogs.com/settings/developers). Without it, Discogs limits requests to 25/min; with it, 60/min. The token is only used in the `Authorization` header of requests to `api.discogs.com` and is never sent anywhere else.

## Installation

This plugin isn't on the community plugin list yet. To install it manually:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest).
2. Create a folder named `discogs-cover` inside your vault's `.obsidian/plugins/` directory.
3. Copy the three files into that folder.
4. In Obsidian, go to **Settings → Community plugins**, and enable **Discogs Cover**.

## License

[MIT](LICENSE)
