// База данных всех карт

export const CARDS = {
  // Fire Set (subset extracted; extend as needed)
  FIRE_FLAME_MAGUS: {
    id: 'FIRE_FLAME_MAGUS', name: 'Flame Magus', type: 'UNIT', cost: 1, activation: 1,
    element: 'FIRE', atk: 1, hp: 1,
    attackType: 'MAGIC', // магическая атака
    attacks: [ { dir: 'N', ranges: [1, 2, 3], mode: 'ANY' } ], // стреляет вперёд на 1-3 клетки
    blindspots: ['N','E','S','W'],
    desc: 'Magic Attack: target any creature; no retaliation.'
  },
  FIRE_HELLFIRE_SPITTER: {
    id: 'FIRE_HELLFIRE_SPITTER', name: 'Hellfire Spitter', type: 'UNIT', cost: 1, activation: 1,
    element: 'FIRE', atk: 1, hp: 1,
    attackType: 'STANDARD', firstStrike: true,
    chooseDir: true, // выбирает одно направление атаки
    attacks: [
      { dir: 'N', ranges: [1] },
      { dir: 'E', ranges: [1] },
      { dir: 'S', ranges: [1] },
      { dir: 'W', ranges: [1] }
    ],
    blindspots: [],
    desc: 'Quickness: always strikes first.'
  },
  FIRE_FREEDONIAN_WANDERER: {
    id: 'FIRE_FREEDONIAN_WANDERER', name: 'Freedonian Wanderer', type: 'UNIT', cost: 2, activation: 1,
    element: 'FIRE', atk: 1, hp: 2,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], auraGainManaOnSummon: true,
    desc: 'While Freedonian Wanderer is on a non‑Fire field, you gain 1 mana each time you summon an allied creature.'
  },
  FIRE_PARTMOLE_FLAME_LIZARD: {
    id: 'FIRE_PARTMOLE_FLAME_LIZARD', name: 'Partmole Flame Lizard', type: 'UNIT', cost: 2, activation: 2,
    element: 'FIRE', atk: 2, hp: 2,
    attackType: 'STANDARD', firstStrike: true, activationReduction: 1,
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    desc: 'Quickness. The activation cost to attack is 1 less than listed.'
  },
  FIRE_GREAT_MINOS: {
    id: 'FIRE_GREAT_MINOS', name: 'Great Minos of Sciondar', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 2, hp: 1,
    attackType: 'STANDARD',
    // бьёт сразу по двум клеткам впереди, игнорируя преграды и задевая союзников
    attacks: [ { dir: 'N', ranges: [1, 2] } ],
    blindspots: ['S'], perfectDodge: true, activationReduction: 1, diesOffElement: 'FIRE',
    friendlyFire: true, pierce: true,
    desc: 'Perfect Dodge. The activation cost to attack is 1 less. Destroy Great Minos if he is on a non‑Fire field.'
  },
  FIRE_FLAME_ASCETIC: {
    id: 'FIRE_FLAME_ASCETIC', name: 'Flame Ascetic', type: 'UNIT', cost: 3, activation: 3,
    element: 'FIRE', atk: 2, hp: 3,
    attackType: 'STANDARD', activationReduction: 2,
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], randomPlus2: true,
    desc: 'Adds 2 to its Attack half the time. The activation cost to attack is 2 less than listed.'
  },
  FIRE_TRICEPTAUR_BEHEMOTH: {
    id: 'FIRE_TRICEPTAUR_BEHEMOTH', name: 'Triceptaur Behemoth', type: 'UNIT', cost: 5, activation: 5,
    element: 'FIRE', atk: 5, hp: 4,
    attackType: 'STANDARD',
    attacks: [
      { dir: 'N', ranges: [1] },
      { dir: 'E', ranges: [1] },
      { dir: 'W', ranges: [1] }
    ],
    blindspots: ['S'], penaltyByTargets: { '2': -2, '3': -4 },
    friendlyFire: true,
    desc: 'When Triceptaur Behemoth attacks 2 creatures, subtract 2 from its Attack; when attacking 3 creatures, subtract 4.'
  },
  FIRE_PURSUER_OF_SAINT_DHEES: {
    id: 'FIRE_PURSUER_OF_SAINT_DHEES', name: 'Pursuer of Saint Dhees', type: 'UNIT', cost: 6, activation: 6,
    element: 'FIRE', atk: 5, hp: 4,
    attackType: 'STANDARD', activationReduction: 5,
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], dynamicAtk: 'OTHERS_ON_BOARD',
    desc: 'Attack = 5 plus the number of other creatures on the board. The activation cost to attack is 5 less than listed.'
  },

  FIRE_PARTMOLE_FLAME_GUARD: {
    id: 'FIRE_PARTMOLE_FLAME_GUARD', name: 'Partmole Flame Guard', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 1, hp: 3,
    attackType: 'STANDARD',
    // пробивает первую цель и бьёт следующую за ней
    attacks: [ { dir: 'N', ranges: [1,2] } ],
    pierce: true,
    blindspots: ['S'],
    plusAtkIfTargetOnElement: { element: 'WATER', amount: 2 },
    desc: 'Adds 2 to its Attack if at least one target creature is on a water field.'
  },

  FIRE_LESSER_GRANVENOA: {
    id: 'FIRE_LESSER_GRANVENOA', name: 'Lesser Granvenoa', type: 'UNIT', cost: 4, activation: 2,
    element: 'FIRE', atk: 2, hp: 4,
    attackType: 'STANDARD',
    attacks: [
      { dir: 'N', ranges: [1] },
      { dir: 'E', ranges: [1] },
      { dir: 'S', ranges: [1] },
      { dir: 'W', ranges: [1] }
    ],
    blindspots: [], fortress: true, diesOnElement: 'WATER', fieldquakeLock: { type: 'ADJACENT' },
    desc: 'Fortress. Adjacent fields cannot be field‑quaked or exchanged. Destroy Lesser Granvenoa if it is on a Water field.'
  },

  FIRE_PARTMOLE_FIRE_ORACLE: {
    id: 'FIRE_PARTMOLE_FIRE_ORACLE', name: 'Partmole Fire Oracle', type: 'UNIT', cost: 4, activation: 2,
    element: 'FIRE', atk: 2, hp: 3,
    attackType: 'MAGIC',
    attacks: [ { dir: 'N', ranges: [1,2,3], mode: 'ANY' } ],
    blindspots: ['N','E','S','W'], onDeathAddHPAll: 1,
    desc: 'Magic Attack. If destroyed, all allied creatures on board gain 1 HP.'
  },

  FIRE_INFERNAL_SCIONDAR_DRAGON: {
    id: 'FIRE_INFERNAL_SCIONDAR_DRAGON', name: 'Infernal Sciondar Dragon', type: 'UNIT', cost: 7, activation: 4,
    element: 'FIRE', atk: 5, hp: 8,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1,2] } ],
    blindspots: [], dynamicAtk: 'FIRE_CREATURES', activationReductionOnElement: { element: 'FIRE', reduction: 3 },
    desc: 'Attack = 5 plus the number of other Fire creatures on the board. While on a Fire field, its activation cost to attack is 3 less than listed.'
  },

  FIRE_DIDI_THE_ENLIGHTENED: {
    id: 'FIRE_DIDI_THE_ENLIGHTENED', name: 'Didi the Enlightened', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 2, hp: 4,
    attackType: 'STANDARD', firstStrike: true, doubleAttack: true,
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], plusAtkIfTargetOnElement: { element: 'FIRE', amount: 1 }, fieldquakeLock: { type: 'ELEMENT', element: 'FIRE' },
    desc: 'Quickness. Attacks the same target twice (counterattack after second attack). Adds 1 to his Attack if the target creature is on a Fire field. While Didi is on the board, no Fire field can be field‑quaked or exchanged.'
  },

  FIRE_WARDEN_HILDA: {
    id: 'FIRE_WARDEN_HILDA', name: 'Warden Hilda', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 2, hp: 4,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1, 2] } ],
    blindspots: ['S'],
    plusAtkVsElement: { element: 'FIRE', amount: 1 },
    gainPossessionEnemiesOnElement: { element: 'FIRE', requireDifferentField: true },
    desc: 'Adds 1 to her Attack if the target is a Fire creature. If summoned on a non‑Fire field, you gain possession of any enemies on a Fire field.'
  },

  FIRE_CRUCIBLE_KING_DIOS_IV: {
    id: 'FIRE_CRUCIBLE_KING_DIOS_IV', name: 'Crucible King Dios IV', type: 'UNIT', cost: 6, activation: 4,
    element: 'FIRE', atk: 3, hp: 6,
    attackType: 'STANDARD', doubleAttack: true,
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    mustUseMagicOnElement: 'FIRE', magicAttackArea: 'CROSS', dynamicMagicAtk: 'FIRE_FIELDS',
    attackSchemes: [
      { key: 'BASE', label: 'Base', attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [1] } ] },
      { key: 'ALT', label: 'Alt', attackType: 'MAGIC', magicArea: 'CROSS' },
    ],
    desc: 'Attacks the same target twice (counterattack after second attack). While on a Fire field he must use his Magic Attack, which affects the target and all adjacent enemies. The Attack value is equal to the number of Fire fields.'
  },

  FIRE_RED_CUBIC: {
    id: 'FIRE_RED_CUBIC', name: 'Red Cubic', type: 'UNIT', cost: 1, activation: 1,
    element: 'FIRE', atk: 1, hp: 1,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['E', 'S', 'W'],
    unitActions: [
      { key: 'SACRIFICE_TRANSFORM', element: 'FIRE', label: 'Sacrifice', requireNonCubic: true },
    ],
    desc: 'Sacrifice Red Cubic to summon a non‑cubic Fire creature in its place (facing any direction) without paying the summoning cost. The summoned creature cannot attack on this turn.'
  },

  FIRE_SCIONDAR_FIRE_GOD: {
    id: 'FIRE_SCIONDAR_FIRE_GOD', name: 'Sciondar Fire God', type: 'UNIT', cost: 9, activation: 5,
    element: 'FIRE', atk: 3, hp: 9,
    attackType: 'MAGIC',
    attacks: [], blindspots: [],
    incarnation: true,
    targetAllNonElement: 'FIRE',
    diesOnElement: 'BIOLITH',
    desc: 'Incarnation. Its Magic Attack targets all enemies on non-Fire fields. Destroy Sciondar Fire God if he is on a Biolith field.'
  },

  WATER_GODDESS_TRITONA: {
    id: 'WATER_GODDESS_TRITONA', name: 'Goddess Tritona', type: 'UNIT', cost: 9, activation: 5,
    element: 'WATER', atk: 3, hp: 9,
    attackType: 'MAGIC',
    attacks: [], blindspots: [],
    incarnation: true,
    targetAllNonElement: 'WATER',
    diesOnElement: 'BIOLITH',
    desc: 'Incarnation. Goddess Tritona’s Magic Attack targets all enemies on non-Water fields. Destroy Goddess Tritona if she is on a Biolith field.'
  },

  EARTH_NOVOGUS_GRAVEKEEPER: {
    id: 'EARTH_NOVOGUS_GRAVEKEEPER', name: 'Novogus Gravekeeper', type: 'UNIT', cost: 9, activation: 5,
    element: 'EARTH', atk: 3, hp: 9,
    attackType: 'MAGIC',
    attacks: [], blindspots: [],
    incarnation: true,
    targetAllNonElement: 'EARTH',
    diesOnElement: 'BIOLITH',
    desc: 'Incarnation. Novogus Gravekeeper’s Magic Attack targets all enemies on non-Earth fields. Destroy Novogus Gravekeeper if it is on a Biolith field.'
  },

  FOREST_EXALTED_ELVEN_DEITY: {
    id: 'FOREST_EXALTED_ELVEN_DEITY', name: 'Exalted Elven Deity', type: 'UNIT', cost: 9, activation: 5,
    element: 'FOREST', atk: 3, hp: 9,
    attackType: 'MAGIC',
    attacks: [], blindspots: [],
    incarnation: true,
    targetAllNonElement: 'FOREST',
    diesOnElement: 'BIOLITH',
    desc: 'Incarnation. Exalted Elven Deity’s Magic Attack targets all enemies on non-Wood fields. Destroy Exalted Elven Deity if it is on a Biolith field.'
  },

  BIOLITH_PHASEUS: {
    id: 'BIOLITH_PHASEUS', name: 'Phaseus, Biolith God', type: 'UNIT', cost: 9, activation: 5,
    element: 'BIOLITH', atk: 3, hp: 9,
    attackType: 'MAGIC',
    attacks: [], blindspots: [],
    incarnation: true,
    targetAllEnemies: true,
    diesOffElement: 'BIOLITH',
    desc: 'Incarnation. Phaseus’s Magic Attack targets all enemies. Destroy Phaseus if he is on a non-Biolith field.'
  },

  // Ninja cycle
  FIRE_FIREFLY_NINJA: {
    id: 'FIRE_FIREFLY_NINJA', name: 'Firefly Ninja', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 1, hp: 2,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    gainPerfectDodgeOnElement: 'FIRE',
    invisibilityAllies: ['EARTH_SPIDER_NINJA'],
    desc: 'While on a Fire field it gains Perfect Dodge. Gains Invisibility while at least one allied Spider Ninja is on the board.'
  },
  EARTH_SPIDER_NINJA: {
    id: 'EARTH_SPIDER_NINJA', name: 'Spider Ninja', type: 'UNIT', cost: 3, activation: 2,
    element: 'EARTH', atk: 2, hp: 1,
    attackType: 'MAGIC',
    attacks: [ { dir: 'N', ranges: [1, 2, 3], mode: 'ANY' } ],
    blindspots: ['S'],
    invisibilityAllies: ['WATER_WOLF_NINJA'],
    swapWithTargetOnElement: 'EARTH',
    desc: 'Magic attack. Gains Invisibility while at least one allied Wolf Ninja is on the board. If it damages a creature on an Earth field, it switches places with that creature (which cannot counterattack).'
  },
  EARTH_YELLOW_CUBIC: {
    id: 'EARTH_YELLOW_CUBIC', name: 'Yellow Cubic', type: 'UNIT', cost: 1, activation: 1,
    element: 'EARTH', atk: 1, hp: 1,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['E', 'S', 'W'],
    unitActions: [
      { key: 'SACRIFICE_TRANSFORM', element: 'EARTH', label: 'Sacrifice', requireNonCubic: true },
    ],
    desc: 'Sacrifice Yellow Cubic to summon a non‑cubic Earth creature in its place (facing any direction) without paying the summoning cost. The summoned creature cannot attack on this turn.'
  },
  EARTH_DARK_YOKOZUNA_SEKIMARU: {
    id: 'EARTH_DARK_YOKOZUNA_SEKIMARU', name: 'Dark Yokozuna Sekimaru', type: 'UNIT', cost: 3, activation: 2,
    element: 'EARTH', atk: 2, hp: 3,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    pushTargetOnDamage: { distance: 1 },
    desc: 'If Dark Yokozuna Sekimaru attacks (but does not destroy) a creature, that creature is pushed back one field in the direction of the attack (provided the field is empty) and cannot counterattack.'
  },
  WATER_WOLF_NINJA: {
    id: 'WATER_WOLF_NINJA', name: 'Wolf Ninja', type: 'UNIT', cost: 3, activation: 2,
    element: 'WATER', atk: 1, hp: 3,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1, 2] } ],
    blindspots: ['S'],
    invisibilityAllies: ['FOREST_SWALLOW_NINJA'],
    swapWithTargetOnElement: 'WATER',
    desc: 'Gains Invisibility while at least one allied Swallow Ninja is on the board. If Wolf Ninja damages a creature on a Water field, it switches places with that creature (which cannot counterattack).'
  },
  WATER_BLUE_CUBIC: {
    id: 'WATER_BLUE_CUBIC', name: 'Blue Cubic', type: 'UNIT', cost: 1, activation: 1,
    element: 'WATER', atk: 1, hp: 1,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['E', 'S', 'W'],
    unitActions: [
      { key: 'SACRIFICE_TRANSFORM', element: 'WATER', label: 'Sacrifice', requireNonCubic: true },
    ],
    desc: 'Sacrifice Blue Cubic to summon a non‑cubic Water creature in its place (facing any direction) without paying the summoning cost. The summoned creature cannot attack on this turn.'
  },
  WATER_VENOAN_ASSASSIN: {
    id: 'WATER_VENOAN_ASSASSIN', name: 'Venoan Assassin', type: 'UNIT', cost: 3, activation: 2,
    element: 'WATER', atk: 2, hp: 3,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    backAttack: true,
    desc: 'Always attacks the back of its target.'
  },
  WATER_TENTACLES_OF_POSSESSION: {
    id: 'WATER_TENTACLES_OF_POSSESSION', name: 'Tentacles of Possession', type: 'UNIT', cost: 2, activation: 1,
    element: 'WATER', atk: 0, hp: 2,
    attackType: 'STANDARD',
    attacks: [],
    blindspots: ['S'],
    possessionBehaviors: [
      { keyword: 'FRONT_SINGLE', range: 1 },
    ],
    desc: 'Tentacles of Possession gain Possession of the enemy directly in front of it.'
  },
  WATER_IMPOSTER_QUEEN_ANFISA: {
    id: 'WATER_IMPOSTER_QUEEN_ANFISA', name: 'Imposter Queen Anfisa', type: 'UNIT', cost: 6, activation: 2,
    element: 'WATER', atk: 2, hp: 5,
    attackType: 'MAGIC',
    attacks: [],
    blindspots: ['S'],
    possessionBehaviors: [
      { keyword: 'ADJACENT_ON_ELEMENT', element: 'WATER' },
    ],
    desc: 'Magic Attack. While on a Water field, Imposter Queen Anfisa gains Possession of all adjacent enemies.'
  },
  FOREST_SWALLOW_NINJA: {
    id: 'FOREST_SWALLOW_NINJA', name: 'Swallow Ninja', type: 'UNIT', cost: 3, activation: 2,
    element: 'FOREST', atk: 1, hp: 3,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1, 2] } ],
    blindspots: ['S'],
    friendlyFire: true,
    pierce: true,
    invisibilityAllies: ['FIRE_FIREFLY_NINJA'],
    rotateTargetOnDamage: true,
    desc: 'Gains Invisibility while at least one allied Firefly Ninja is on the board. When Swallow Ninja damages (but does not destroy) a creature, rotate that creature so its back faces Swallow Ninja. The target creature cannot counterattack.'
  },
  FOREST_ELVEN_DEATH_DANCER: {
    id: 'FOREST_ELVEN_DEATH_DANCER', name: 'Elven Death Dancer', type: 'UNIT', cost: 5, activation: 4,
    element: 'FOREST', atk: 1, hp: 3,
    attackType: 'MAGIC',
    attacks: [ { dir: 'N', ranges: [1, 2], mode: 'ANY' } ],
    blindspots: ['S'],
    swapOnDamage: true,
    enemyActivationTaxAdjacent: 3,
    desc: 'Magic Attack. If Elven Death Dancer damages (but does not destroy) a creature, she switches locations with that creature (which cannot counterattack). Enemies on adjacent fields add 3 to their Activation Cost.'
  },
  FOREST_GREEN_CUBIC: {
    id: 'FOREST_GREEN_CUBIC', name: 'Green Cubic', type: 'UNIT', cost: 1, activation: 1,
    element: 'FOREST', atk: 1, hp: 1,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['E', 'S', 'W'],
    unitActions: [
      { key: 'SACRIFICE_TRANSFORM', element: 'FOREST', label: 'Sacrifice', requireNonCubic: true },
    ],
    desc: 'Sacrifice Green Cubic to summon a non‑cubic Wood creature in its place (facing any direction) without paying the summoning cost. The summoned creature cannot attack on this turn.'
  },
  NEUTRAL_WHITE_CUBIC: {
    id: 'NEUTRAL_WHITE_CUBIC', name: 'White Cubic', type: 'UNIT', cost: 1, activation: 1,
    element: 'NEUTRAL', atk: 1, hp: 1,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['E', 'S', 'W'],
    keywords: ['DODGE_ATTEMPT'],
    dodge: { chance: 0.5, attempts: 1 },
    unitActions: [
      { key: 'SACRIFICE_TRANSFORM', label: 'Sacrifice', allowAnyElement: true, requireNonCubic: false },
    ],
    desc: 'White Cubic does not belong to any element. Sacrifice White Cubic to summon any creature in its place (facing any direction) without paying the Summoning Cost. The summoned creature cannot attack this turn. Dodge attempt.'
  },

  BIOLITH_NINJA: {
    id: 'BIOLITH_NINJA', name: 'Biolith Ninja', type: 'UNIT', cost: 4, activation: 2,
    element: 'BIOLITH', atk: 4, hp: 2,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    backAttack: true,
    gainPerfectDodgeOnElement: 'BIOLITH',
    desc: 'While on a Biolith field it gains Perfect Dodge. Always attacks the back of its target.'
  },

  BIOLITH_BOMBER: {
    id: 'BIOLITH_BOMBER', name: 'Biolith Bomber', type: 'UNIT', cost: 3, activation: 2,
    element: 'BIOLITH', atk: 1, hp: 3,
    attackType: 'STANDARD', chooseDir: true,
    attacks: [
      { dir: 'N', ranges: [1, 2], mode: 'ANY', ignoreBlocking: true },
      { dir: 'E', ranges: [1, 2], mode: 'ANY', ignoreBlocking: true },
      { dir: 'S', ranges: [1, 2], mode: 'ANY', ignoreBlocking: true },
      { dir: 'W', ranges: [1, 2], mode: 'ANY', ignoreBlocking: true },
    ],
    blindspots: ['S'],
    plusAtkVsSummonCostAtMost: { limit: 2, amount: 2 },
    desc: 'Adds 2 to its Attack if the target creature has a Summoning Cost of 2 or lower.'
  },

  BIOLITH_BATTLE_CHARIOT: {
    id: 'BIOLITH_BATTLE_CHARIOT', name: 'Biolith Battle Chariot', type: 'UNIT', cost: 4, activation: 4,
    element: 'BIOLITH', atk: 3, hp: 5,
    attackType: 'STANDARD',
    attacks: [
      { dir: 'N', ranges: [1], group: 'FRONT_RIGHT' },
      { dir: 'E', ranges: [1], group: 'FRONT_RIGHT' },
    ],
    friendlyFire: true,
    blindspots: ['S'],
    desc: ''
  },

  BIOLITH_TAURUS_MONOLITH: {
    id: 'BIOLITH_TAURUS_MONOLITH', name: 'Taurus Monolith', type: 'UNIT', cost: 5, activation: 3,
    element: 'BIOLITH', atk: 3, hp: 6,
    attackType: 'STANDARD',
    attacks: [
      { dir: 'N', ranges: [1], group: 'DOUBLE_FRONT', ignoreBlocking: true },
      { dir: 'N', ranges: [2], group: 'DOUBLE_FRONT', ignoreBlocking: true },
    ],
    blindspots: ['S'],
    pushTargetOnDamage: { distance: 1 },
    desc: 'If Taurus Monolith attacks (but does not destroy) a creature, that creature is pushed back one field in the direction of the attack (provided the field is empty) and cannot counterattack.'
  },

  BIOLITH_ARC_SATELLITE_CANNON: {
    id: 'BIOLITH_ARC_SATELLITE_CANNON', name: 'Arc Satellite Cannon', type: 'UNIT', cost: 5, activation: 4,
    element: 'BIOLITH', atk: 4, hp: 5,
    attackType: 'MAGIC', chooseDir: true,
    attacks: [
      { dir: 'N', ranges: [1, 2], mode: 'ANY' },
      { dir: 'E', ranges: [1, 2], mode: 'ANY' },
      { dir: 'S', ranges: [1, 2], mode: 'ANY' },
      { dir: 'W', ranges: [1, 2], mode: 'ANY' },
    ],
    blindspots: ['S'],
    desc: 'Magic Attack: choose one highlighted cell in front, back, left or right to target.'
  },

  FOREST_TWIN_GOBLINS: {
    id: 'FOREST_TWIN_GOBLINS', name: 'Twin Goblins', type: 'UNIT', cost: 2, activation: 1,
    element: 'FOREST', atk: 1, hp: 3,
    attackType: 'STANDARD',
    attacks: [
      { dir: 'N', ranges: [1] },
      { dir: 'S', ranges: [1] },
    ],
    blindspots: [],
    friendlyFire: true,
    desc: ''
  },

  // Spells (subset)
  RAISE_STONE: { id:'RAISE_STONE', name:'Raise Stone', type:'SPELL', cost:2, element:'EARTH', text:'+2 HP to a friendly unit.' },
  SPELL_FISSURES_OF_GOGHLIE: { id: 'SPELL_FISSURES_OF_GOGHLIE', name: 'Fissures of Goghlie', type: 'SPELL', element: 'NEUTRAL', spellType: 'CONJURATION', cost: 2, text: 'Fieldquake any one field.' },
  SPELL_PARMTETIC_HOLY_FEAST: { id: 'SPELL_PARMTETIC_HOLY_FEAST', name: 'Parmetic Holy Feast', type: 'SPELL', element: 'NEUTRAL', spellType: 'RITUAL', cost: 0, ritualCost: 'discard 1 creature', text: 'Discard a creature from hand and gain 2 mana.' },
  SPELL_GOGHLIE_ALTAR: { id: 'SPELL_GOGHLIE_ALTAR', name: 'Goghlie Altar', type: 'SPELL', element: 'NEUTRAL', spellType: 'RITUAL', cost: 0, ritualCost: 'none', text: 'Both players gain mana equal to the number of enemy creatures on the board.' },
  SPELL_BEGUILING_FOG: { id: 'SPELL_BEGUILING_FOG', name: 'Beguiling Fog', type: 'SPELL', element: 'NEUTRAL', spellType: 'CONJURATION', cost: 0, text: 'Rotate any one creature in any direction.' },
  SPELL_CLARE_WILS_BANNER: { id: 'SPELL_CLARE_WILS_BANNER', name: 'Clare Wil’s Banner', type: 'SPELL', element: 'NEUTRAL', spellType: 'CONJURATION', cost: 1, text: 'Friendly creatures get +1 ATK until end of turn.' },
  SPELL_SUMMONER_MESMERS_ERRAND: { id: 'SPELL_SUMMONER_MESMERS_ERRAND', name: "Summoner Mesmer's Errand", type: 'SPELL', element: 'NEUTRAL', spellType: 'CONJURATION', cost: 1, text: 'Draw two cards.' },
};
