const STRINGS = {
  en: {
    settingMaxSizeName: "Maximum image size",
    settingMaxSizeDesc: "Maximum width/height of the cover, in pixels.",
    settingAlignmentName: "Alignment",
    settingAlignmentDesc: "Horizontal alignment of the cover.",
    alignLeft: "Left",
    alignCenter: "Center",
    alignRight: "Right",
    settingTokenName: "Discogs token (optional)",
    settingTokenDesc:
      "Personal Discogs token: raises the rate limit from 25 to 60 requests/min. Create one at discogs.com/settings/developers.",
    tokenPlaceholder: "Discogs token",
    commandCacheAllName: "Cache all Discogs covers",
    noticeCachingStart: (count) => `Discogs Cover: caching ${count} cover(s)...`,
    noticeCachingDone: (done, failed) =>
      `Discogs Cover: ${done} cover(s) cached, ${failed} failure(s).`,
    imgAlt: (releaseId) => `Discogs cover (release ${releaseId})`,
  },
  fr: {
    settingMaxSizeName: "Taille maximale de l'image",
    settingMaxSizeDesc: "Largeur/hauteur maximale de la pochette, en pixels.",
    settingAlignmentName: "Alignement",
    settingAlignmentDesc: "Alignement horizontal de la pochette.",
    alignLeft: "Gauche",
    alignCenter: "Centre",
    alignRight: "Droite",
    settingTokenName: "Token Discogs (optionnel)",
    settingTokenDesc:
      "Jeton personnel Discogs : fait passer la limite de requêtes de 25 à 60/min. À créer sur discogs.com/settings/developers.",
    tokenPlaceholder: "Token Discogs",
    commandCacheAllName: "Mettre en cache toutes les pochettes Discogs",
    noticeCachingStart: (count) => `Discogs Cover : mise en cache de ${count} pochette(s)...`,
    noticeCachingDone: (done, failed) =>
      `Discogs Cover : ${done} pochette(s) en cache, ${failed} échec(s).`,
    imgAlt: (releaseId) => `Pochette Discogs (release ${releaseId})`,
  },
};

// Pas d'API i18n officielle côté plugins : on réutilise la langue d'interface
// que le coeur d'Obsidian persiste lui-même dans localStorage.
function detectLocale() {
  try {
    const lang = window.localStorage.getItem("language");
    if (lang && lang.toLowerCase().startsWith("fr")) return "fr";
  } catch (e) {
    // localStorage indisponible (contexte restreint) : on retombe sur l'anglais.
  }
  return "en";
}

function getStrings() {
  return STRINGS[detectLocale()] || STRINGS.en;
}

module.exports = { getStrings, detectLocale };
