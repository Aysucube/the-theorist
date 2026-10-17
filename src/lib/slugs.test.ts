import { describe, expect, it } from "vitest";
import { edhrecSlug, tcgphSlug } from "./slugs";

// Each pair below was checked against the live site when these rules were written.

describe("edhrecSlug", () => {
  it.each([
    ["Sol Ring", "normal", "sol-ring"],
    ["Atraxa, Praetors' Voice", "normal", "atraxa-praetors-voice"],
    ["Jace, the Mind Sculptor", "normal", "jace-the-mind-sculptor"],
    ["Urza's Saga", "saga", "urzas-saga"],
    ["Lim-Dûl's Vault", "normal", "lim-duls-vault"],
    ["Fire // Ice", "split", "fire-ice"],
    ["Delver of Secrets // Insectile Aberration", "transform", "delver-of-secrets"],
    ["Esika, God of the Tree // The Prismatic Bridge", "modal_dfc", "esika-god-of-the-tree"],
    ["Bonecrusher Giant // Stomp", "adventure", "bonecrusher-giant"],
  ])("%s (%s) -> %s", (name, layout, slug) => {
    expect(edhrecSlug(name, layout)).toBe(slug);
  });
});

describe("tcgphSlug", () => {
  it.each([
    ["Sol Ring", "sol-ring"],
    ["Atraxa, Praetors' Voice", "atraxa-praetors-voice"],
    ["Sensei's Divining Top", "sensei-s-divining-top"],
    ["Urza's Saga", "urza-s-saga"],
    ["Lim-Dûl's Vault", "lim-dul-s-vault"],
    ["Fire // Ice", "fire-ice"],
    ["Delver of Secrets // Insectile Aberration", "delver-of-secrets-insectile-aberration"],
  ])("%s -> %s", (name, slug) => {
    expect(tcgphSlug(name)).toBe(slug);
  });
});
