import { describe, expect, it } from "vitest";
import { partIds, sortRelated, type RelatedPart } from "./related";

const part = (component: string, name: string, typeLine: string, id?: string): RelatedPart => ({ component, name, typeLine, id });

describe("sortRelated", () => {
  it("gathers tokens, one per token, with every card that makes it", () => {
    const result = sortRelated(
      {
        Bitterblossom: [part("token", "Faerie Rogue", "Token Creature — Faerie Rogue", "a"), part("combo_piece", "Bitterblossom", "Kindred Enchantment — Faerie", "b")],
        "Mistbind Clique": [part("token", "Faerie Rogue", "Token Creature — Faerie Rogue", "c")],
        "Tendershoot Dryad": [part("token", "Saproling", "Token Creature — Saproling", "d")],
      },
      { a: { power: "1", toughness: "1", imageUrl: "faerie.jpg", text: "Flying" }, c: { power: "1", toughness: "1", text: "Flying" }, d: { power: "1", toughness: "1" } },
    );
    expect(result.tokens.map((t) => t.name)).toEqual(["Faerie Rogue", "Saproling"]);
    expect(result.tokens[0]).toMatchObject({ stats: "1/1", imageUrl: "faerie.jpg", from: ["Bitterblossom", "Mistbind Clique"] });
  });

  it("keeps tokens with the same name apart when they aren't the same token", () => {
    const result = sortRelated(
      { A: [part("token", "Soldier", "Token Creature — Soldier", "a")], B: [part("token", "Soldier", "Token Creature — Soldier", "b")] },
      { a: { power: "1", toughness: "1" }, b: { power: "2", toughness: "2" } },
    );
    expect(result.tokens).toHaveLength(2);
  });

  it("finds emblems and game pieces, and skips other linked cards and checklists", () => {
    const result = sortRelated(
      {
        "Elspeth, Sun's Champion": [part("combo_piece", "Elspeth, Sun's Champion Emblem", "Emblem — Elspeth", "e")],
        "Queen Marchesa": [part("combo_piece", "The Monarch", "Card", "m")],
        "Hanweir Battlements": [part("combo_piece", "Eldritch Moon Checklist", "Card", "x")],
        "Acererak the Archlich": [part("combo_piece", "Tomb of Annihilation", "Dungeon", "t"), part("combo_piece", "Some Partner", "Legendary Creature — Human", "p")],
      },
      {},
    );
    expect(result.emblems.map((e) => e.name)).toEqual(["Elspeth, Sun's Champion Emblem"]);
    expect(result.pieces.map((p) => p.name)).toEqual(["The Monarch", "Tomb of Annihilation"]);
  });

  it("pairs meld partners and double-faced cards", () => {
    const result = sortRelated(
      {
        "Hanweir Battlements": [
          part("meld_part", "Hanweir Battlements", "Land", "h"),
          part("meld_part", "Hanweir Garrison", "Creature — Human Soldier", "g"),
          part("meld_result", "Hanweir, the Writhing Township", "Legendary Creature — Eldrazi Ooze", "r"),
        ],
        "Delver of Secrets": [{ component: "back", name: "Insectile Aberration", typeLine: "Creature — Human Insect", transforms: true, imageUrl: "back.jpg" }],
        "Fell the Profane": [{ component: "back", name: "Fell Mire", typeLine: "Land" }],
      },
      { r: { imageUrl: "township.jpg" } },
    );
    expect(result.pairs).toEqual([
      { from: "Hanweir Battlements", to: "Hanweir Garrison", how: "Melds with", imageUrl: undefined },
      { from: "Hanweir Battlements", to: "Hanweir, the Writhing Township", how: "Melds into", imageUrl: "township.jpg" },
      { from: "Delver of Secrets", to: "Insectile Aberration", how: "Transforms into", imageUrl: "back.jpg" },
      { from: "Fell the Profane", to: "Fell Mire", how: "Other side", imageUrl: undefined },
    ]);
  });
});

describe("meld partners", () => {
  it("lists a pair once when both halves are in the deck", () => {
    const result = sortRelated(
      {
        Bruna: [part("meld_part", "Gisela", "Creature", "g"), part("meld_result", "Brisela", "Creature", "r")],
        Gisela: [part("meld_part", "Bruna", "Creature", "b"), part("meld_result", "Brisela", "Creature", "r")],
      },
      {},
    );
    expect(result.pairs.map((p) => `${p.from} ${p.how} ${p.to}`)).toEqual(["Bruna Melds with Gisela", "Bruna Melds into Brisela"]);
  });
});

describe("partIds", () => {
  it("asks only about what will be shown, each once", () => {
    const ids = partIds({
      A: [part("token", "Saproling", "Token Creature — Saproling", "s"), part("combo_piece", "Eldritch Moon Checklist", "Card", "x")],
      B: [part("token", "Saproling", "Token Creature — Saproling", "s"), part("meld_part", "Other", "Creature", "m")],
    });
    expect(ids).toEqual(["s"]);
  });
});
