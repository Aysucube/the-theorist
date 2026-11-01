// What each of EDHREC's playstyles is about and how it wins, for the hover card
// on a playstyle. EDHREC's pages name their themes but don't explain them, so
// the common ones are written out here; creature types and companions follow
// one pattern each, and anything else falls back on the name. closersIn reads
// a playstyle's own cards for the ones that end games. Pure, so it's easy to test.
import type { CardDetails } from "@/lib/types";
import type { PlaystyleCard } from "./api";

export interface PlaystyleGuide {
  /** What the deck does, in a sentence. */
  about: string;
  /** The ways it tends to win. */
  wins: string[];
}

const guide = (about: string, ...wins: string[]): PlaystyleGuide => ({ about, wins });

export const BALANCED_GUIDE = guide(
  "Follows all of this commander's decks instead of leaning into one idea, so it plays the cards they share.",
  "Whatever the commander does best",
  "Combat damage from a solid board",
  "Your strongest threats, backed by interaction",
);

const GUIDE: Record<string, PlaystyleGuide> = {
  tokens: guide("Floods the board with creature tokens from cheap, repeatable sources, then makes them all count at once.", "Swing with a wide board after a team pump", "Drain the table as tokens enter or die", "Overrun effects like Craterhoof Behemoth"),
  "plus-1-plus-1-counters": guide("Stacks +1/+1 counters on creatures and doubles them, so small threats quickly outgrow the table.", "Attack with oversized creatures", "Trample over blockers with one huge threat", "Proliferate until the counters end it"),
  combo: guide("Assembles two or three cards that together win on the spot, using tutors and card draw to find them.", "An infinite combo that drains or burns the table", "Infinite mana into a big finisher", "Infinite creatures or combat steps"),
  artifacts: guide("Fills the board with artifacts for mana, value and payoffs that care about how many you control.", "A wide or huge artifact board in combat", "Damage or drain per artifact", "Artifact combos such as Sword of the Meek loops"),
  aggro: guide("Plays cheap, hard-hitting creatures and pressures the table from the first turns.", "Combat damage before opponents stabilize", "Haste and extra attackers to close quickly", "Team pumps for one lethal swing"),
  spellslinger: guide("Casts a stream of instants and sorceries, with payoffs that trigger on every spell.", "Burn or drain from spell triggers", "A big copied spell", "Storm counts or tokens made by spells"),
  reanimator: guide("Fills the graveyard, then brings back the biggest creatures for far less than their cost.", "Fast, huge reanimated threats in combat", "Mass reanimation for one giant turn", "Repeated enter-the-battlefield value"),
  lifegain: guide("Gains life every turn and turns that life into cards, counters and damage.", "Drain equal to life gained", "Creatures grown by lifegain triggers", "Win-the-game cards at a high life total"),
  control: guide("Answers everything with counterspells, removal and wipes, then wins late with one protected threat.", "A single hard-to-answer finisher", "Card advantage until opponents run out", "A planeswalker or big spell nobody can stop"),
  aristocrats: guide("Sacrifices its own creatures for value and drains the table each time one dies.", "Drain from death triggers like Blood Artist", "Sacrifice loops that drain out the table", "Recursion that keeps the engine going"),
  burn: guide("Deals direct damage to the whole table, doubling it and turning small triggers into lethal.", "Damage to each opponent each turn", "Damage doublers on a big burn spell", "Pingers and triggers that add up"),
  ramp: guide("Plays extra lands and mana early to cast huge spells turns ahead of the table.", "Huge creatures long before anyone can answer them", "X spells cast for a lot", "Eldrazi-sized finishers"),
  "lands-matter": guide("Plays extra lands and gets paid for each one, often replaying them from the graveyard.", "Land creatures and huge land-based attackers", "Landfall triggers that drain or burn", "Massive mana into a big finisher"),
  voltron: guide("Piles equipment and auras on one creature, usually the commander, and wins through commander damage.", "21 commander damage", "One evasive, protected attacker", "Double strike or extra combats on it"),
  midrange: guide("Plays efficient threats and answers, trading well until its stronger cards take over.", "Bigger threats than the table can match", "Steady combat damage", "Card advantage that wins the long game"),
  equipment: guide("Fills the deck with equipment and ways to attach it cheaply, turning any creature into a threat.", "Commander damage on a loaded attacker", "Team-wide boosts from equipment", "Double strike and evasion on one creature"),
  enchantress: guide("Draws a card for each enchantment and builds a board that gets harder to attack.", "Big auras or anthems on your creatures", "Constellation triggers that drain or make tokens", "Overwhelming card advantage"),
  mill: guide("Empties opponents' libraries so they lose by drawing from nothing.", "Decking every opponent", "A big mill spell for the rest", "Using their graveyards against them"),
  blink: guide("Exiles and returns its own permanents to reuse their enter-the-battlefield effects.", "Value that buries the table in cards and tokens", "Repeated drain or removal triggers", "Infinite blink combos"),
  graveyard: guide("Treats the graveyard as a second hand, casting and returning cards from it.", "Recursive threats nobody can get rid of", "Huge creatures that count your graveyard", "Mass reanimation"),
  discard: guide("Makes opponents discard their hands and punishes them for it.", "Damage for each discard", "Opponents with no resources left", "Threats nobody can answer with empty hands"),
  treasure: guide("Makes Treasure tokens for huge mana bursts and rewards sacrificing them.", "A huge spell from a pile of Treasure", "Damage or drain as Treasure is sacrificed", "Extra attackers paid for in one turn"),
  legends: guide("Fills the deck with legendary permanents and rewards casting them.", "A board of strong legends in combat", "Legendary payoffs that drain or draw", "One big turn from cost reduction"),
  sacrifice: guide("Feeds its own permanents to sacrifice outlets for value and to dodge removal.", "Drain as creatures die", "Fling or sacrifice for lethal damage", "Loops with recursion"),
  clones: guide("Copies the best creatures on the table, yours or theirs.", "Copies of the strongest threat on the table", "Doubled enter-the-battlefield effects", "A board of the best creature in the game"),
  auras: guide("Enchants its creatures with auras, cheating their cost and protecting them.", "Commander damage on an enchanted attacker", "Aura payoffs that grow the team", "One evasive, hexproof threat"),
  "card-draw": guide("Draws far more cards than the table and pays off every extra card.", "Damage per card drawn", "Overwhelming card advantage", "Drawing into a combo"),
  flying: guide("Plays creatures that fly over blockers and pumps the skies.", "Evasive combat damage nobody can block", "Flying team pumps", "Giving the whole team flying for a lethal swing"),
  wheels: guide("Makes every player discard and redraw, punishing them for each new hand.", "Damage for each card drawn by opponents", "Burning the table with repeated wheels", "A refilled hand into a big turn"),
  "group-slug": guide("Hurts every opponent at once with damage and taxes, so all of them lose at the same pace.", "Damage to each opponent each turn", "Life drain that races the table", "Pingers and punishers"),
  historic: guide("Casts artifacts, legends and Sagas, with payoffs that trigger on each.", "A board grown by historic triggers", "Value engines that bury the table", "Legendary threats in combat"),
  storm: guide("Casts many cheap spells in one turn, then finishes with a storm spell.", "Grapeshot-style damage to each opponent", "A tutor chain into a storm finisher", "Tokens or drain for each spell"),
  landfall: guide("Plays extra lands and triggers something every time one enters.", "Landfall creatures that outgrow the table", "Damage or drain per land", "Huge tokens made by landfall"),
  stax: guide("Locks the table down with taxes and restrictions, then wins behind them.", "A small threat nobody can answer", "Opponents who can't play the game", "Slowly attacking through a lock"),
  "self-mill": guide("Mills its own library to fuel graveyard payoffs.", "Huge creatures counting the graveyard", "Mass reanimation", "Win-the-game cards at an empty library"),
  theft: guide("Steals opponents' best cards and uses them against the table.", "Attacking with their stolen threats", "Their combos and bombs in your hands", "Drain or sacrifice on what you took"),
  "extra-combats": guide("Takes additional combat steps to multiply every attack.", "Several attacks in one turn", "Attack triggers that stack up", "Commander damage in a single turn"),
  "group-hug": guide("Helps the whole table with extra cards and mana, staying safe while building a win.", "A quiet finisher after everyone is exhausted", "Win-the-game cards", "Opponents who won't attack you"),
  "good-stuff": guide("Plays the strongest cards in its colors rather than one theme.", "Powerful threats and bombs", "Steady card advantage", "Whatever the table can't answer"),
  infect: guide("Attacks with poison so ten poison counters win, ignoring life totals.", "Ten poison on each opponent", "Proliferate to finish them off", "Team-wide infect from one swing"),
  "big-mana": guide("Makes enormous amounts of mana and spends it on huge plays.", "A giant X spell", "Eldrazi-sized threats", "Copying or untapping for one big turn"),
  "forced-combat": guide("Forces opponents' creatures to attack each other, keeping you safe.", "Opponents killing each other", "Damage from creatures you never controlled", "A clean swing into empty boards"),
  "commander-matters": guide("Builds around casting and recasting the commander, with payoffs that care.", "Commander damage", "Payoffs for repeatedly casting it", "Value engines led by the commander"),
  chaos: guide("Makes the game unpredictable with random effects that scramble every plan.", "Surviving the mayhem you caused", "Random big effects going your way", "Opponents whose plans fell apart"),
  planeswalkers: guide("Protects a team of planeswalkers and uses their abilities every turn.", "Planeswalker ultimates", "Tokens and value from loyalty abilities", "Proliferate for fast ultimates"),
  "x-spells": guide("Pumps mana into spells whose size is decided by X.", "A lethal X burn or drain spell", "Huge X creatures", "Doubling X with copy effects"),
  vehicles: guide("Crews big artifact vehicles with cheap creatures.", "Hard-hitting vehicles that dodge wipes", "Vehicle payoffs in combat", "Commander damage from a crewed attacker"),
  lifedrain: guide("Makes opponents lose life while gaining it back.", "Repeated drain from triggers", "Exsanguinate-style X spells", "Drain combos such as Sanguine Bond"),
  toolbox: guide("Runs one-of answers and tutors for the right piece each game.", "The exact threat each game needs", "Silver-bullet answers that keep you ahead", "Tutored combos"),
  "pillow-fort": guide("Makes attacking you painful or impossible, then wins behind the walls.", "A late finisher from safety", "Opponents who fight each other", "Win-the-game cards"),
  "minus-1-minus-1-counters": guide("Shrinks and kills creatures with -1/-1 counters while keeping its own alive.", "A table with no creatures left", "Combat on an empty board", "Proliferate to finish creatures and players"),
  cascade: guide("Casts expensive spells that cast more spells for free.", "Free spells stacking into a huge turn", "Value that outpaces the table", "Threats from nowhere"),
  tempo: guide("Plays cheap threats and uses bounce and counters to keep opponents off balance.", "Evasive creatures backed by interaction", "Opponents always a turn behind", "Damage before they recover"),
  hatebears: guide("Plays small creatures that shut down what opponents want to do.", "Cheap attackers while they're locked out", "Disrupted opponents who can't recover", "Combat on a weak board"),
  exile: guide("Exiles cards and gets paid for having cards in exile.", "Casting from exile to win the value war", "Creatures that grow with exiled cards", "Removing every answer"),
  dredge: guide("Replaces draws with big graveyard fills for huge recursion.", "Recursive threats", "Mass reanimation", "Win-the-game cards from a full graveyard"),
  populate: guide("Copies its best token over and over.", "Copies of a huge token", "A wide board of tokens", "Team pumps on tokens"),
  "birthing-pod": guide("Upgrades creatures step by step up the mana curve with Birthing Pod effects.", "Chains that find the right creature", "Infinite combos with Pod", "Value at each step"),
  "extra-turns": guide("Takes turn after turn so opponents never get to play.", "Chained extra turns", "Attacking every turn", "Taking every turn until the game ends"),
  etb: guide("Plays creatures with enter-the-battlefield effects and multiplies them.", "Doubled value from every creature", "Drain or damage on enter", "Blink or recursion loops"),
  stompy: guide("Ramps into big green creatures and hits harder than the table can block.", "Huge tramplers in combat", "Team pumps on large creatures", "Fight effects that clear the way"),
  "self-damage": guide("Pays life on purpose for strong effects, turning its own pain into power.", "Fast starts paid for in life", "Damage matched to opponents", "Payoffs that trigger on losing life"),
  proliferate: guide("Adds counters of every kind each turn, speeding up everything it has.", "Poison finished by proliferate", "Planeswalker ultimates", "Huge creatures from counters"),
  "spell-copy": guide("Copies its instants and sorceries for double the effect.", "A copied X spell", "Doubled burn or draw", "Copied extra turns"),
  cantrips: guide("Casts cheap spells that replace themselves, with payoffs for each.", "Spell triggers that add up", "A deep library dig into a win", "Storm-style turns"),
  "toughness-matters": guide("Plays walls and high-toughness creatures, attacking with toughness instead of power.", "Defenders attacking for their toughness", "Doran-style combat", "Damage equal to toughness"),
  "attack-triggers": guide("Gets paid every time its creatures attack.", "Triggers that drain before combat ends", "Extra attackers and tokens", "Extra combats stacking triggers"),
  topdeck: guide("Controls the top of its library and plays from it.", "Card advantage from the top of the library", "Revealed cards that hit for damage", "Set-up big turns"),
  affinity: guide("Plays piles of artifacts that make its spells nearly free.", "Cheap, huge artifact creatures", "Metalcraft and affinity payoffs", "An early, wide attack"),
  energy: guide("Stores energy counters and spends them on strong effects.", "Spent energy on big attacks", "Growing creatures", "Repeated removal and damage"),
  food: guide("Makes Food tokens and sacrifices them for life and value.", "Drain from sacrifice triggers", "Creatures that grow from Food", "A big board of tokens"),
  "land-destruction": guide("Destroys lands so opponents run out of mana.", "Opponents with nothing to cast", "Threats that survive the mana shortage", "A slow win from a locked table"),
  defenders: guide("Plays walls and gives them the ability to attack.", "Defenders swinging for their toughness", "Huge blockers turned attackers", "Damage based on defenders"),
  sagas: guide("Plays Sagas and resets them for repeated chapter effects.", "Repeated chapter value", "Saga payoffs", "Chapter finishers"),
  monarch: guide("Becomes the monarch for extra cards and defends the title.", "Card advantage that never stops", "Blockers that protect the crown", "Punishing whoever attacks you"),
  "modified-creatures": guide("Puts auras, equipment and counters on creatures, with payoffs for doing so.", "Attacks with modified creatures", "Payoffs that trigger on modified attackers", "Growing the whole team"),
  cycling: guide("Cycles cards for value and triggers payoffs each time.", "Cycling triggers that make tokens or damage", "Card flow that finds the win", "Big creatures from the graveyard"),
  ninjutsu: guide("Sneaks in ninjas by swapping them with unblocked attackers.", "Unblocked ninjas with strong triggers", "Evasive creatures that set up ninjutsu", "Card advantage from combat"),
  "activated-abilities": guide("Uses abilities on the board as a mana sink and copies them.", "Repeated abilities into infinite combos", "Mana spent every turn", "Rings of Three Wishes-style tutors"),
  anthems: guide("Stacks team-wide boosts so every creature hits harder.", "A wide board with several anthems", "Overrun-style swings", "Cheap creatures hitting far above their size"),
  "tap-untap": guide("Taps and untaps its permanents for extra mana and triggers.", "Infinite untap combos", "Huge mana from untapping lands", "Tapping down opposing blockers"),
  counterspells: guide("Keeps mana open to counter every important spell.", "A protected finisher", "Opponents who can't resolve anything", "Payoffs for countering spells"),
  morph: guide("Plays creatures face down and flips them for surprise effects.", "Big surprise flips", "Face-down payoffs", "Evasive 2/2 attackers"),
  pingers: guide("Deals one damage again and again with repeatable abilities.", "Pingers plus damage doublers", "Infinite ping combos", "Picking off creatures and walkers"),
  devotion: guide("Stacks colored mana symbols for mana and devotion payoffs.", "Gray Merchant-style drains", "Nykthos mana into huge plays", "Devotion-sized creatures"),
  clues: guide("Makes Clue tokens and cracks them for steady card draw.", "Card advantage nobody can match", "Artifact payoffs on Clues", "Damage or tokens per sacrifice"),
  politics: guide("Bargains, votes and goads to steer the table.", "Convincing opponents to fight each other", "A late finisher once they're weak", "Deals that keep you alive"),
  unblockable: guide("Makes its creatures impossible to block.", "Commander damage with no blockers", "Combat triggers every turn", "Huge unblocked attackers"),
  deathtouch: guide("Uses deathtouch so any creature trades up, with pingers for removal.", "Pingers with deathtouch wiping boards", "Attackers nobody wants to block", "Combat on an empty board"),
  "triggered-abilities": guide("Doubles triggered abilities for extra value from everything.", "Doubled drain and damage triggers", "Panharmonicon-style value", "Triggers that snowball"),
  "go-wide": guide("Plays many small creatures and boosts them all.", "A wide swing with a team pump", "More attackers than blockers", "Overrun effects"),
  dungeon: guide("Ventures through dungeons for steady value.", "Completed dungeon rewards", "Payoffs for venturing", "Value that outpaces the table"),
  flashback: guide("Casts spells from the graveyard for a second use.", "Doubled spells over a long game", "Recursion nobody can exhaust", "A big flashback finisher"),
  discover: guide("Casts spells that find free spells from the top of the library.", "Free spells stacking up", "Value that outpaces the table", "Discover chains in one turn"),
  zoo: guide("Plays efficient creatures across colors with strong mana.", "Fast, efficient combat", "Pumps on a varied team", "Finishers in every color"),
  snow: guide("Plays snow lands and permanents for snow payoffs.", "Snow mana into big plays", "Payoffs counting snow permanents", "Huge creatures that grow"),
  "ad-nauseam": guide("Draws its whole deck with Ad Nauseam and wins with what it finds.", "Thassa's Oracle or similar with an empty library", "A combo found from the big draw", "Life-gain cushions to keep going"),
  mutate: guide("Merges creatures into a single huge threat with stacked abilities.", "One giant, evasive attacker", "Mutate triggers that add up", "Commander damage from a merged commander"),
  flash: guide("Plays everything at instant speed to surprise the table.", "Ambush attackers at end of turn", "Instant-speed answers and threats", "Free spells on other turns"),
  donate: guide("Gives opponents harmful cards that hurt them.", "Opponents killed by what you gave them", "Punishers they can't remove", "A safe finisher behind them"),
  fight: guide("Uses big creatures to fight and remove the opposition.", "Clearing blockers for lethal", "Repeated fight removal", "Huge attackers on an empty board"),
  "self-discard": guide("Discards its own cards on purpose for madness and graveyard value.", "Reanimated discards", "Payoffs on discard", "Damage from each discard"),
  prowess: guide("Pumps creatures by casting noncreature spells in combat.", "A spell-fueled big attack", "Double strike on a pumped creature", "Evasive attackers"),
  "counters-matter": guide("Plays all kinds of counters and rewards having them.", "Attackers grown by counters", "Proliferate finishers", "Damage from counter payoffs"),
  aikido: guide("Redirects and punishes what opponents do to you, turning their own attacks and spells against them.", "Opponents beaten by their own cards", "Fog and redirect until they fall", "A late finisher"),
  haste: guide("Plays creatures that attack the turn they arrive.", "Damage from nowhere", "Rebuilding the board and swinging at once", "Extra attackers in one big turn"),
  bounce: guide("Returns permanents to hand for tempo and value.", "Opponents kept off their board", "Replayed enter-the-battlefield value", "Evasive attackers on a clear table"),
  prison: guide("Locks down opponents' permanents so they can't act.", "Opponents with nothing to do", "A small finisher behind the lock", "Slow, certain damage"),
  power: guide("Plays high-power creatures and rewards having them.", "Attacks by large creatures", "Damage equal to power", "Cards drawn for high power"),
  "multicolor-matters": guide("Plays multicolor spells and gets paid for each.", "Value from each multicolor spell", "Powerful gold threats", "Huge mana for big spells"),
  "impulse-draw": guide("Exiles the top of its library and plays those cards at once.", "Card advantage from exile", "Huge turns from free cards", "Burn payoffs on playing exiled cards"),
  scry: guide("Scrys every turn for perfect draws and payoffs.", "Always having the right card", "Scry triggers that make tokens or damage", "A big finisher when it counts"),
  "coin-flip": guide("Flips coins for wild effects, with cards to win the flips.", "Krark's Thumb-powered big plays", "Repeated coin effects", "Lucky damage"),
  rock: guide("Plays strong green and black value and answers.", "Grinding the table down", "Efficient threats", "Recursion that outlasts answers"),
  "mana-dorks": guide("Plays cheap creatures that make mana, then pays them off.", "Fast mana into a big finisher", "Creature mana turned into pumps", "A wide board of dorks"),
  weenies: guide("Plays lots of low-cost creatures and pumps them all.", "Wide attacks by cheap creatures", "Anthems on small creatures", "Fast starts"),
  "die-roll": guide("Rolls dice for random effects and rewards each roll.", "Natural 20 payoffs", "Repeated roll triggers", "Dragons and damage from dice"),
  amass: guide("Grows a single Army token with repeated amass.", "A huge Army attacker", "Team payoffs on Armies", "Proliferating counters"),
  party: guide("Fills out a party of Cleric, Rogue, Warrior and Wizard.", "Full-party payoffs", "Cheap creatures in combat", "Big effects at a full party"),
  "the-ring": guide("Tempts itself with the Ring and grows its Ring-bearer.", "A huge Ring-bearer", "Ring temptation payoffs", "Unblockable attacks"),
  "land-animation": guide("Turns its lands into creatures and attacks with them.", "A surprise army of lands", "Huge land attackers", "Team pumps on lands"),
  fling: guide("Throws big creatures at opponents for lethal damage.", "Fling for commander-sized damage", "Copied fling effects", "Sudden burn"),
  polymorph: guide("Turns tokens into giant creatures by polymorphing them.", "A cheap spell into a game-ending creature", "Huge creatures on turn four", "Repeated polymorph"),
  "sneak-attack": guide("Cheats big creatures onto the board with Sneak Attack effects.", "Fast huge attackers", "Enter-the-battlefield finishers", "Annihilator"),
  "mana-rocks": guide("Plays artifact mana early for explosive turns.", "Big spells well ahead of the table", "Artifact payoffs", "X spells"),
  lure: guide("Forces every creature to block one attacker, clearing the way for the rest.", "An alpha strike after a lure", "Deathtouch lures that wipe boards", "Unblocked attackers"),
  "turbo-fog": guide("Prevents all combat damage while winning another way.", "A slow alternative win", "Mill or drain behind fogs", "Opponents who can't deal damage"),
  "shadowborn-apostles": guide("Runs many copies of Shadowborn Apostle to sacrifice into Demons.", "Demons fetched from the library", "A swarm of Apostles", "Sacrifice payoffs"),
  "persistent-petitioners": guide("Runs many copies of Persistent Petitioners to mill the table.", "Mill from many Petitioners", "A horde of Advisors", "Doubled attackers"),
  "relentless-rats": guide("Runs a horde of Relentless Rats that each boost one another.", "A swarm of huge Rats", "Doubling season for Rats", "Overwhelming board"),
  "rat-colony": guide("Runs a horde of Rat Colony that grows with every Rat.", "Huge Rats that scale together", "A swarm of Rats", "Team pumps"),
  "slime-against-humanity": guide("Runs many copies of Slime Against Humanity, tokens growing with each one in exile or the graveyard.", "Oozes that grow every copy", "Mill yourself for bigger tokens", "A huge Ooze board"),
  "hare-apparent": guide("Runs many copies of Hare Apparent for a growing Rabbit army.", "A wide board of Rabbits", "Tokens that scale with each copy", "Team pumps"),
};

/** EDHREC's themes that are creature types. */
const KINDRED = new Set(
  "elves goblins zombies humans vampires angels dragons dinosaurs wizards demons cats pirates faeries merfolk phyrexians knights slivers rats assassins elementals birds ninjas hydras spirits soldiers warriors saprolings horrors allies shapeshifters sea-creatures squirrels insects dwarves spiders rogues frogs mutants rabbits myr dogs clerics bears snakes beasts wolves werewolves wraiths gods heroes artificers villains treefolk otters thopters orcs halflings oozes sphinxes fungi constructs samurai giants golems robots tyranids lizards bats apes wurms mice raccoons skeletons turtles scarecrows minotaurs devils lhurgoyfs monks time-lords necrons druids crabs plants illusions horses nightmares phoenixes advisors unicorns kithkin archers praetors avatars daleks rebels gorgons cybermen drakes astartes gnomes griffins satyrs shamans moonfolk foxes whales pegasi atogs mercenaries goats sharks elders elephants berserkers barbarians servos specters kor cephalids symbiotes bards ogres minions hippos kavu nobles shades fractals crocodiles eldrazi".split(" "),
);

/** What a playstyle does and how it wins. */
export function playstyleGuide(slug: string, name: string): PlaystyleGuide {
  const known = GUIDE[slug];
  if (known) return known;
  if (KINDRED.has(slug)) {
    return guide(
      `Fills the deck with ${name} and the cards that reward having many of them, with lords to make each one stronger.`,
      `A wide board of ${name} boosted by lords`,
      "A team pump for one lethal swing",
      `Payoffs that drain or damage for each of your ${name}`,
    );
  }
  if (slug.endsWith("-companion")) {
    const companion = name.replace(/\s*companion$/i, "");
    return guide(`Builds the whole deck to meet ${companion}'s rule, so it starts each game with a free extra card as its companion.`, `${companion} arriving as an extra threat`, "A steadier game from the extra card", "Whatever the commander does best");
  }
  return guide(`Builds around ${name}: the cards EDHREC's players keep choosing for it.`, `Getting the most from ${name}`, "Combat damage from the board it builds", "The finishers listed below");
}

const CLOSERS: [RegExp, string][] = [
  [/you win the game|(?:player|opponent) loses the game/, "Wins on the spot"],
  [/(?:additional|extra) combat/, "Extra combat"],
  [/extra turn/, "Extra turn"],
  [/poison counter|\binfect\b|\btoxic\b/, "Poison"],
  [/each opponent loses|opponents? lose/, "Drains the table"],
  [/damage to each opponent/, "Burns the table"],
  [/creatures you control (?:get \+|have [^.]*(?:double strike|trample)|gain [^.]*(?:double strike|trample))/, "Pumps the team"],
  [/annihilator/, "Annihilator"],
];

/** The cards among a playstyle's own that end games, the ones it leans on most first. */
export function closersIn(cards: PlaystyleCard[], details: Record<string, CardDetails>, limit = 5): { name: string; how: string }[] {
  const out: { name: string; how: string }[] = [];
  for (const { name } of cards) {
    const card = details[name];
    if (!card || /\bLand\b/.test(card.typeLine.split(" // ")[0])) continue;
    const text = card.oracleText.toLowerCase();
    const closer = CLOSERS.find(([pattern]) => pattern.test(text));
    if (closer) out.push({ name, how: closer[1] });
    if (out.length >= limit) break;
  }
  return out;
}
