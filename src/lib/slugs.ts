// Each site turns a card name into a URL slug differently.

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function hyphenate(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * EDHREC drops apostrophes ("urzas-saga") and uses only the front face of
 * double-faced and adventure cards, but keeps both halves of split cards ("fire-ice").
 */
export function edhrecSlug(name: string, layout: string) {
  const face = layout === "split" ? name : name.split(" // ")[0];
  return hyphenate(stripAccents(face).replace(/['’]/g, ""));
}

/** TCGph uses the full name and turns apostrophes into hyphens ("urza-s-saga"). */
export function tcgphSlug(name: string) {
  return hyphenate(stripAccents(name));
}
