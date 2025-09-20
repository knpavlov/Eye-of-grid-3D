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
    attackType: 'STANDARD', pierce: true,
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
    attackType: 'STANDARD', pierce: true,
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

  WATER_CLOUD_RUNNER: {
    id: 'WATER_CLOUD_RUNNER', name: 'Cloud Runner', type: 'UNIT', cost: 3, activation: 2,
    element: 'WATER', atk: 1, hp: 2,
    attackType: 'STANDARD', chooseDir: true,
    attacks: [
      { dir: 'E', ranges: [1, 2], mode: 'ANY', ignoreAlliedBlocking: true },
      { dir: 'W', ranges: [1, 2], mode: 'ANY', ignoreAlliedBlocking: true },
    ],
    dodge: { chance: 0.5, attempts: 1 },
    drawOnSummonByElementFields: { element: 'WATER', includeSelf: true, includeCenter: true },
    desc: 'Dodge attempt. When Cloud Runner is summoned, draw cards equal to the number of Water fields.'
  },

  WATER_DON_OF_VENOA: {
    id: 'WATER_DON_OF_VENOA', name: 'Don of Venoa', type: 'UNIT', cost: 5, activation: 3,
    element: 'WATER', atk: 2, hp: 3,
    attackType: 'STANDARD',
    attackSchemes: [
      {
        key: 'BASE',
        label: 'Cleave',
        attacks: [
          { dir: 'N', ranges: [1], group: 'FRONT_BACK' },
          { dir: 'S', ranges: [1], group: 'FRONT_BACK' },
        ],
      },
      {
        key: 'WATER_SWIRL',
        label: 'Whirlpool',
        attacks: [
          { dir: 'N', ranges: [1], group: 'SWIRL' },
          { dir: 'S', ranges: [1], group: 'SWIRL' },
          { dir: 'E', ranges: [1], group: 'SWIRL' },
          { dir: 'W', ranges: [1], group: 'SWIRL' },
        ],
      },
    ],
    defaultAttackScheme: 'BASE',
    mustUseSchemeOnElement: [ { element: 'WATER', scheme: 'WATER_SWIRL' } ],
    dodge: { chance: 0.5, attempts: 1 },
    gainDodgeFromAdjacentEnemies: { attemptsPerEnemy: 1 },
    grantDodgeAdjacentAllies: 1,
    desc: 'Dodge attempt. Gains one Dodge attempt for each adjacent enemy. Adjacent allied creatures gain one Dodge attempt. While on a Water field he strikes all adjacent cells.'
  },

  WATER_MERCENARY_SAVIOR_LATOO: {
    id: 'WATER_MERCENARY_SAVIOR_LATOO', name: 'Mercenary Savior Latoo', type: 'UNIT', cost: 3, activation: 2,
    element: 'WATER', atk: 2, hp: 3,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1, 2], group: 'LINE' } ],
    plusAtkIfTargetOnElement: { element: 'WATER', amount: 1 },
    auraGrantDodgeOnElement: { element: 'WATER', attempts: 1, includeSelf: false },
    dodge: { chance: 0.5, attempts: 1 },
    desc: 'Dodge attempt. Adds 1 to his Attack if at least one target is on a Water field. While Latoo is on the board, allied creatures on Water fields gain one Dodge attempt.'
  },

  WATER_TRITONAN_HARPOONSMAN: {
    id: 'WATER_TRITONAN_HARPOONSMAN', name: 'Tritonan Harpoonsman', type: 'UNIT', cost: 2, activation: 1,
    element: 'WATER', atk: 1, hp: 2,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1, 2], group: 'LINE' } ],
    gainDodgeOnElement: { element: 'WATER', attempts: 1 },
    desc: 'While on a Water field Tritonan Harpoonsman gains Dodge attempt.'
  },

  WATER_ALUHJA_PRIESTESS: {
    id: 'WATER_ALUHJA_PRIESTESS', name: 'Aluhja Priestess', type: 'UNIT', cost: 2, activation: 1,
    element: 'WATER', atk: 1, hp: 1,
    attackType: 'MAGIC',
    attacks: [ { dir: 'N', ranges: [1, 2, 3], mode: 'ANY' } ],
    blindspots: ['N', 'E', 'S', 'W'],
    gainDodgeOnElement: { element: 'WATER', attempts: 1 },
    desc: 'Magic Attack. While on a Water field, Aluhja Priestess gains Dodge attempt.'
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
  EARTH_VERZAR_ELEPHANT_BRIGADE: {
    id: 'EARTH_VERZAR_ELEPHANT_BRIGADE', name: 'Verzar Elephant Brigade', type: 'UNIT', cost: 5, activation: 3,
    element: 'EARTH', atk: 2, hp: 5,
    attackType: 'STANDARD',
    attackSchemes: [
      { key: 'BASE', attacks: [ { dir: 'N', ranges: [1, 2], group: 'LINE', ignoreBlocking: true } ] },
      { key: 'ALT', attacks: [ { dir: 'N', ranges: [1] } ] },
    ],
    defaultAttackScheme: 'BASE',
    mustUseSchemeOnElement: [ { element: 'EARTH', scheme: 'ALT' } ],
    blindspots: ['S'],
    auraModifiers: [
      { stat: 'ATK', amount: 2, target: 'ALLY', scope: 'ADJACENT', sourceOnElement: 'EARTH' },
      { stat: 'ACTIVATION', amount: 1, target: 'ALLY', scope: 'ADJACENT', sourceOnElement: 'EARTH' },
    ],
    desc: 'Verzar Elephant Brigade must use its secondary attack while it is on an Earth field. While Verzar Elephant Brigade is on an Earth field, allied creatures on adjacent fields add 2 to their Attack and 1 to their Activation Cost.'
  },
  EARTH_DUNGEON_OF_TEN_TYRANTS: {
    id: 'EARTH_DUNGEON_OF_TEN_TYRANTS', name: 'Dungeon of Ten Tyrants', type: 'UNIT', cost: 4, activation: 2,
    element: 'EARTH', atk: 1, hp: 4,
    attackType: 'STANDARD', chooseDir: true,
    attacks: [
      { dir: 'N', ranges: [1] },
      { dir: 'E', ranges: [1] },
      { dir: 'S', ranges: [1] },
      { dir: 'W', ranges: [1] }
    ],
    blindspots: [],
    fortress: true,
    manaGainOnNonElement: { element: 'EARTH', amount: 1 },
    diesOnElement: 'FOREST', // 'FOREST' соответствует древесному полю
    desc: 'Fortress: cannot attack unless counterattacking. While on a non‑Earth field, its summoner gains 1 mana at the start of their turn. Destroy if on a Wood field.'
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
  WATER_SIAM_TRAITOR_OF_SEAS: {
    id: 'WATER_SIAM_TRAITOR_OF_SEAS', name: 'Siam, Traitor of Seas', type: 'UNIT', cost: 3, activation: 2,
    element: 'WATER', atk: 2, hp: 4,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    doubleAttack: true,
    plusAtkVsElement: { element: 'WATER', amount: 1 },
    auraModifiers: [
      { stat: 'ATK', amount: -1, target: 'ENEMY', scope: 'BOARD', targetOnElement: 'WATER' },
    ],
    desc: 'Siam attacks the same target twice. The counterattack of target creature occurs after second attack. Siam adds 1 Attack if the target creature is a Water creature. All enemies on Water fields subtract 1 from their Attack.'
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
    possession: true,
    possessionEffects: [
      { pattern: 'FRONT', range: 1, id: 'TENTACLES_FRONT' },
    ],
    desc: 'Tentacles of Possession gain Possession of the enemy directly in front of it.'
  },
  WATER_IMPOSTER_QUEEN_ANFISA: {
    id: 'WATER_IMPOSTER_QUEEN_ANFISA', name: 'Imposter Queen Anfisa', type: 'UNIT', cost: 6, activation: 2,
    element: 'WATER', atk: 2, hp: 5,
    attackType: 'MAGIC',
    attacks: [],
    blindspots: ['N','E','S','W'],
    possession: true,
    possessionEffects: [
      { pattern: 'ADJACENT', requireSourceElement: 'WATER', id: 'ANFISA_WATER_AURA' },
    ],
    desc: 'Magic Attack. While on a Water field, Imposter Queen Anfisa gains Possession of all enemies on adjacent fields.'
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
  FOREST_JUNO_FOREST_DRAGON: {
    id: 'FOREST_JUNO_FOREST_DRAGON', name: 'Juno Forest Dragon', type: 'UNIT', cost: 7, activation: 4,
    element: 'FOREST', atk: 5, hp: 8,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1, 2], mode: 'ANY', ignoreBlocking: true } ],
    blindspots: ['S'],
    dynamicAtk: 'FOREST_CREATURES',
    auraModifiers: [
      { stat: 'ACTIVATION', amount: 2, target: 'ENEMY', scope: 'ADJACENT', sourceOnElement: 'FOREST' },
    ],
    desc: 'Juno Forest Dragon\'s Attack is equal to 5 plus the number of other Wood creatures on the board. While Juno Forest Dragon is on a Wood field, enemies on adjacent fields add 2 to their Activation Cost.'
  },
  FOREST_SLEEPTRAP: {
    id: 'FOREST_SLEEPTRAP', name: 'Sleeptrap', type: 'UNIT', cost: 2, activation: 1,
    element: 'FOREST', atk: 0, hp: 2,
    attackType: 'STANDARD',
    attacks: [],
    blindspots: ['N', 'E', 'S', 'W'],
    auraModifiers: [
      { stat: 'ACTIVATION', amount: 1, target: 'ENEMY', scope: 'ADJACENT' },
    ],
    desc: 'Enemies on adjacent fields add 1 to their Activation Cost.'
  },
  WOOD_JUNO_PRISONER_TRAP: {
    id: 'WOOD_JUNO_PRISONER_TRAP', name: 'Juno Prisoner Trap', type: 'UNIT', cost: 4, activation: 2,
    element: 'FOREST', atk: 0, hp: 4, // 'FOREST' используется для древесных полей
    attackType: 'STANDARD', chooseDir: true,
    attacks: [
      { dir: 'N', ranges: [1] },
      { dir: 'E', ranges: [1] },
      { dir: 'S', ranges: [1] },
      { dir: 'W', ranges: [1] }
    ],
    blindspots: [],
    fortress: true,
    onEnemySummonAdjacentHealAllies: 1,
    diesOnElement: 'EARTH',
    desc: 'Fortress: cannot attack unless counterattacking. When an enemy creature is summoned adjacent to it, all other allied creatures gain 1 HP. Destroy if on an Earth field.'
  },
  WOOD_EDIN_THE_PERSECUTED: {
    id: 'WOOD_EDIN_THE_PERSECUTED', name: 'Edin the Persecuted', type: 'UNIT', cost: 3, activation: 2,
    element: 'FOREST', atk: 2, hp: 3,
    attackType: 'MAGIC',
    attacks: [],
    blindspots: ['S'],
    plus1IfTargetOnElement: 'FOREST',
    grantInvisibilityToAlliesOnElement: 'FOREST',
    desc: '+1 Attack while attacking a creature on a Wood field. Allied creatures on Wood fields have Invisibility.'
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
  BIOLITH_SCION_BIOLITH_LORD: {
    id: 'BIOLITH_SCION_BIOLITH_LORD', name: 'Scion, Biolith Lord', type: 'UNIT', cost: 6, activation: 3,
    element: 'BIOLITH', atk: 2, hp: 5,
    attackType: 'MAGIC',
    attacks: [],
    blindspots: ['N', 'E', 'S', 'W'],
    magicTargetsSameElement: true,
    auraModifiers: [
      { stat: 'ACTIVATION', amount: -2, target: 'ALLY', scope: 'BOARD', targetElement: 'BIOLITH', excludeSelf: true },
    ],
    desc: 'Scion\'s Magic Attack targets all enemies of the same element as the target. All other allied Biolith creatures subtract 2 from their Activation Cost.'
  },
  BIOLITH_DRAGOON_DRAGON_CAVALRY: {
    id: 'BIOLITH_DRAGOON_DRAGON_CAVALRY', name: 'Dragoon Dragon Cavalry', type: 'UNIT', cost: 5, activation: 3,
    element: 'BIOLITH', atk: 3, hp: 5,
    attackType: 'STANDARD',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    doubleAttack: true,
    desc: 'Dragoon Dragon Cavalry attacks the same target twice. The counterattack of target creature occurs after the second attack. All enemy dragons subtract 3 from their Attack.'
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

  BIOLITH_AEGIS_CITADEL: {
    id: 'BIOLITH_AEGIS_CITADEL', name: 'Aegis Citadel', type: 'UNIT', cost: 5, activation: 3,
    element: 'BIOLITH', atk: 1, hp: 5,
    attackType: 'STANDARD', chooseDir: true,
    attacks: [
      { dir: 'N', ranges: [1] },
      { dir: 'E', ranges: [1] },
      { dir: 'S', ranges: [1] },
      { dir: 'W', ranges: [1] }
    ],
    blindspots: [],
    fortress: true,
    invisibilityAuraSameElement: true,
    desc: 'Fortress: cannot attack except when counterattacking. Grants Invisibility to all allied creatures of the same element as the field it occupies.'
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
