import { describe, expect, it } from "vitest";
import { isBasicLandName, mergeCollection, missingFromBinder, ownedCount, ownedCounts, parseCollection, splitCsvLine } from "./collection";

describe("parseCollection", () => {
  it("reads a ManaBox CSV, adding printings of the same card together", () => {
    const csv = [
      "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID",
      'Sol Ring,CMM,Commander Masters,410,normal,uncommon,2,1,abc',
      'Sol Ring,C21,Commander 2021,263,normal,uncommon,1,2,def',
      '"Tergrid, God of Fright // Tergrid\'s Lantern",KHM,Kaldheim,112,foil,rare,1,3,ghi',
    ].join("\n");
    expect(parseCollection(csv)).toEqual([
      { name: "Sol Ring", qty: 3 },
      { name: "Tergrid, God of Fright // Tergrid's Lantern", qty: 1 },
    ]);
  });

  it("reads a Moxfield collection CSV with Count first", () => {
    const csv = 'Count,Tradelist Count,Name,Edition,Condition\n4,0,"Forest",dmu,Near Mint\n1,0,"Rhystic Study",pcy,Near Mint';
    expect(parseCollection(csv)).toEqual([
      { name: "Forest", qty: 4 },
      { name: "Rhystic Study", qty: 1 },
    ]);
  });

  it("reads a Dragon Shield CSV after its sep= line, and a file with a byte-order mark", () => {
    const csv = '"sep=,"\nFolder Name,Quantity,Trade Quantity,Card Name,Set Code\nBinder,3,0,Arcane Signet,CMR\nBinder,1,0,"Atraxa, Praetors\' Voice",C16';
    expect(parseCollection(csv)).toEqual([
      { name: "Arcane Signet", qty: 3 },
      { name: "Atraxa, Praetors' Voice", qty: 1 },
    ]);
    expect(parseCollection("﻿Name,Quantity\nSol Ring,2")).toEqual([{ name: "Sol Ring", qty: 2 }]);
  });

  it("falls back to a plain list", () => {
    expect(parseCollection("4 Forest\n1x Sol Ring (CMM) 410\nCommand Tower")).toEqual([
      { name: "Forest", qty: 4 },
      { name: "Sol Ring", qty: 1 },
      { name: "Command Tower", qty: 1 },
    ]);
  });

  it("splits CSV cells, keeping quoted commas and quotes", () => {
    expect(splitCsvLine('1,"Tergrid, God of Fright","say ""hi"""')).toEqual(["1", "Tergrid, God of Fright", 'say "hi"']);
  });
});

describe("collections and decks", () => {
  const binder = mergeCollection([], parseCollection("2 Sol Ring\n1 Tergrid, God of Fright // Tergrid's Lantern\n10 Forest"), "add");

  it("adds copies when adding, and starts over when replacing", () => {
    expect(mergeCollection(binder, [{ name: "sol ring", qty: 1 }], "add").find((c) => c.name === "Sol Ring")?.qty).toBe(3);
    expect(mergeCollection(binder, [{ name: "Swamp", qty: 5 }], "replace")).toEqual([{ name: "Swamp", qty: 5 }]);
  });

  it("counts copies by name or front face", () => {
    const counts = ownedCounts(binder);
    expect(ownedCount(counts, "SOL RING")).toBe(2);
    expect(ownedCount(counts, "Tergrid, God of Fright")).toBe(1);
    expect(ownedCount(counts, "Rhystic Study")).toBe(0);
  });

  it("lists only what a deck is missing, leaving basics out unless asked", () => {
    const counts = ownedCounts(binder);
    const deck = [
      { name: "Sol Ring", qty: 1 },
      { name: "Rhystic Study", qty: 1 },
      { name: "Forest", qty: 14 },
      { name: "Swamp", qty: 10 },
    ];
    expect(missingFromBinder(deck, counts)).toEqual([{ name: "Rhystic Study", qty: 1 }]);
    expect(missingFromBinder(deck, counts, true)).toEqual([
      { name: "Rhystic Study", qty: 1 },
      { name: "Forest", qty: 4 },
      { name: "Swamp", qty: 10 },
    ]);
    expect(isBasicLandName("Snow-Covered Island")).toBe(true);
  });
});
