const { Plugin, PluginSettingTab, Setting, requestUrl, MarkdownView, Notice } = require("obsidian");
const { getStrings } = require("./i18n");

const BANNER_CLASS = "discogs-cover-banner";
// Dossier de cache local des pochettes, à la racine du vault. Son nom est
// figé car il est aussi référencé en dur dans la formule de
// "Bases/Disques Vinyles.base" (link("_discogs-covers/" + discogs + ".jpg")).
const CACHE_FOLDER = "_discogs-covers";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ALIGNMENT_TO_JUSTIFY = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

const DEFAULT_SETTINGS = {
  maxSize: 300,
  alignment: "center",
  discogsToken: "",
};

function extractReleaseId(value) {
  if (value === null || value === undefined) return null;
  const str = Array.isArray(value) ? String(value[0]) : String(value);
  const match = str.match(/(\d+)/);
  return match ? match[1] : null;
}

module.exports = class DiscogsCoverPlugin extends Plugin {
  async onload() {
    this.i18n = getStrings();
    this.coverCache = {}; // releaseId -> imageUrl | null
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.applySettingsToCss();

    this.addSettingTab(new DiscogsCoverSettingTab(this.app, this));

    // inlineTitleEl est un élément stable, partagé entre la vue lecture et le
    // Live Preview (le titre affiché en haut de chaque note) : en insérant la
    // pochette juste avant lui, on obtient le même emplacement visuel dans
    // les deux modes, sans dépendre du pipeline de rendu spécifique à l'un ou
    // l'autre (post-processor en lecture, CodeMirror en édition).
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.renderCover())
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.renderCover())
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && file.path === activeFile.path) this.renderCover();
      })
    );
    this.app.workspace.onLayoutReady(() => this.renderCover());

    this.addCommand({
      id: "cache-all-covers",
      name: this.i18n.commandCacheAllName,
      callback: () => this.cacheAllCovers(),
    });
  }

  onunload() {
    document.body.style.removeProperty("--discogs-cover-max-size");
    document.body.style.removeProperty("--discogs-cover-justify");
    document.querySelectorAll(`.${BANNER_CLASS}`).forEach((n) => n.remove());
  }

  async renderCover() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const inlineTitleEl = view?.inlineTitleEl;

    if (!view || !view.file || !inlineTitleEl) return;

    const frontmatter = this.app.metadataCache.getFileCache(view.file)?.frontmatter;
    const releaseId = extractReleaseId(frontmatter?.discogs);
    const key = releaseId ? `${view.file.path}:${releaseId}` : null;

    // active-leaf-change et layout-change se déclenchent souvent ensemble
    // pour la même transition : sans ce verrou synchrone (posé avant tout
    // await), deux appels concurrents passeraient chacun le test "pas encore
    // présente" et créeraient deux bannières.
    if (key === this._pendingKey) {
      // Toujours re-vérifier/corriger la position, même si le rendu pour
      // cette clé est déjà en cours ou terminé : Obsidian peut avoir déplacé
      // inlineTitleEl (changement de mode) sans que le contenu ait changé.
      this._repositionExisting(view.contentEl, inlineTitleEl, view.file.path, releaseId);
      return;
    }
    this._pendingKey = key;

    if (!releaseId) {
      view.contentEl.querySelectorAll(`.${BANNER_CLASS}`).forEach((n) => n.remove());
      return;
    }

    const imageUrl = await this.getCoverUrl(releaseId);

    // La note active a pu changer pendant l'appel réseau : on ne touche au
    // DOM que si on correspond toujours à la demande la plus récente.
    if (this._pendingKey !== key) return;

    if (!imageUrl) {
      view.contentEl.querySelectorAll(`.${BANNER_CLASS}`).forEach((n) => n.remove());
      return;
    }

    if (this._repositionExisting(view.contentEl, inlineTitleEl, view.file.path, releaseId)) {
      return;
    }

    view.contentEl.querySelectorAll(`.${BANNER_CLASS}`).forEach((n) => n.remove());

    const banner = document.createElement("div");
    banner.classList.add(BANNER_CLASS);
    banner.dataset.sourcePath = view.file.path;
    banner.dataset.releaseId = releaseId;
    const img = document.createElement("img");
    img.src = imageUrl;
    img.classList.add("discogs-cover-img");
    img.alt = this.i18n.imgAlt(releaseId);
    banner.appendChild(img);

    inlineTitleEl.before(banner);
  }

  // Si une bannière correspondant déjà à cette note/release existe, la
  // replace juste avant inlineTitleEl (qui peut avoir été déplacé par
  // Obsidian lors d'un changement de mode) plutôt que d'en recréer une.
  // Renvoie true si une bannière existante a été traitée ainsi.
  _repositionExisting(contentEl, inlineTitleEl, sourcePath, releaseId) {
    const existing = contentEl.querySelector(`.${BANNER_CLASS}`);
    if (
      !existing ||
      existing.dataset.sourcePath !== sourcePath ||
      existing.dataset.releaseId !== releaseId
    ) {
      return false;
    }
    if (existing.nextElementSibling !== inlineTitleEl) {
      inlineTitleEl.before(existing);
    }
    return true;
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applySettingsToCss();
  }

  applySettingsToCss() {
    // Les bannières déjà affichées se mettent à jour instantanément, sans
    // avoir besoin de rouvrir les notes, puisque ce sont des custom
    // properties CSS lues par styles.css.
    document.body.style.setProperty(
      "--discogs-cover-max-size",
      `${this.settings.maxSize}px`
    );
    document.body.style.setProperty(
      "--discogs-cover-justify",
      ALIGNMENT_TO_JUSTIFY[this.settings.alignment] || "center"
    );
  }

  // Renvoie une URL affichable (resource path local) pour la bannière en
  // lecture/édition, en s'appuyant sur le même cache local que la Base.
  async getCoverUrl(releaseId) {
    if (releaseId in this.coverCache) return this.coverCache[releaseId];

    const path = await this.ensureLocalCover(releaseId);
    if (!path) {
      this.coverCache[releaseId] = null;
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    const resourceUrl = file ? this.app.vault.getResourcePath(file) : null;
    this.coverCache[releaseId] = resourceUrl;
    return resourceUrl;
  }

  // Télécharge la pochette d'un release Discogs et la stocke une seule fois
  // dans CACHE_FOLDER, comme fichier normal du vault (donc utilisable par
  // Bases via link(), et consultable même hors ligne). Renvoie le chemin
  // (relatif au vault) du fichier en cache, ou null en cas d'échec.
  async ensureLocalCover(releaseId) {
    const path = `${CACHE_FOLDER}/${releaseId}.jpg`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) return path;

    const headers = { "User-Agent": "ObsidianDiscogsCoverPlugin/0.1" };
    if (this.settings.discogsToken) {
      headers.Authorization = `Discogs token=${this.settings.discogsToken}`;
    }

    try {
      const releaseRes = await requestUrl({
        url: `https://api.discogs.com/releases/${releaseId}`,
        headers,
      });
      const data = releaseRes.json;
      const remoteImageUrl =
        data.images && data.images.length > 0
          ? data.images[0].uri || data.images[0].resource_url
          : data.thumb || null;
      if (!remoteImageUrl) return null;

      const imageRes = await requestUrl({ url: remoteImageUrl });

      if (!this.app.vault.getAbstractFileByPath(CACHE_FOLDER)) {
        await this.app.vault.createFolder(CACHE_FOLDER).catch(() => {});
      }
      await this.app.vault.createBinary(path, imageRes.arrayBuffer);
      return path;
    } catch (e) {
      console.error("[Discogs Cover] échec de mise en cache", releaseId, e);
      return null;
    }
  }

  async cacheAllCovers() {
    const releaseIds = new Set();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const releaseId = extractReleaseId(frontmatter?.discogs);
      if (releaseId) releaseIds.add(releaseId);
    }

    const ids = Array.from(releaseIds);
    const delayMs = this.settings.discogsToken ? 1100 : 2600; // reste sous 60/min ou 25/min
    let done = 0;
    let failed = 0;

    new Notice(this.i18n.noticeCachingStart(ids.length));

    for (const id of ids) {
      const alreadyCached = !!this.app.vault.getAbstractFileByPath(
        `${CACHE_FOLDER}/${id}.jpg`
      );
      const path = await this.ensureLocalCover(id);
      if (path) done++;
      else failed++;
      if (!alreadyCached) await sleep(delayMs);
    }

    new Notice(this.i18n.noticeCachingDone(done, failed));
  }
};

class DiscogsCoverSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const i18n = this.plugin.i18n;
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName(i18n.settingMaxSizeName)
      .setDesc(i18n.settingMaxSizeDesc)
      .addText((text) =>
        text
          .setPlaceholder("300")
          .setValue(String(this.plugin.settings.maxSize))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            this.plugin.settings.maxSize = parsed;
            await this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName(i18n.settingAlignmentName)
      .setDesc(i18n.settingAlignmentDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("left", i18n.alignLeft)
          .addOption("center", i18n.alignCenter)
          .addOption("right", i18n.alignRight)
          .setValue(this.plugin.settings.alignment)
          .onChange(async (value) => {
            this.plugin.settings.alignment = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName(i18n.settingTokenName)
      .setDesc(i18n.settingTokenDesc)
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder(i18n.tokenPlaceholder)
          .setValue(this.plugin.settings.discogsToken)
          .onChange(async (value) => {
            this.plugin.settings.discogsToken = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }
}
