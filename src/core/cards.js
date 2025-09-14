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

  // --- новые огненные карты ---
  FIRE_FIREFLY_NINJA: {
    id: 'FIRE_FIREFLY_NINJA', name: 'Firefly Ninja', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 1, hp: 2,
    attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], perfectDodgeOnFire: true, invisibilityWithSpider: 'FIRE_SPIDER_NINJA',
    desc: 'На огненной клетке получает Perfect Dodge. Невидимость, если на поле есть союзный Spider Ninja.'
  },
  FIRE_PARTMOLE_FLAME_GUARD: {
    id: 'FIRE_PARTMOLE_FLAME_GUARD', name: 'Partmole Flame Guard', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 1, hp: 3,
    attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [2] } ],
    blindspots: ['S'], plus2IfWaterTarget: true,
    desc: 'Добавляет 2 к атаке, если цель стоит на водной клетке.'
  },
  FIRE_LESSER_GRANVENOA: {
    id: 'FIRE_LESSER_GRANVENOA', name: 'Lesser Granvenoa', type: 'UNIT', cost: 4, activation: 2,
    element: 'FIRE', atk: 2, hp: 4,
    attackType: 'STANDARD', attacks: [
      { dir: 'N', ranges: [1] }, { dir: 'E', ranges: [1] }, { dir: 'S', ranges: [1] }, { dir: 'W', ranges: [1] }
    ],
    blindspots: [], fortress: true, diesOffElement: 'WATER',
    desc: 'Фортресс. Соседние клетки нельзя менять или field-quake. Погибает на водной клетке.'
  },
  FIRE_PARTMOLE_FIRE_ORACLE: {
    id: 'FIRE_PARTMOLE_FIRE_ORACLE', name: 'Partmole Fire Oracle', type: 'UNIT', cost: 4, activation: 2,
    element: 'FIRE', atk: 2, hp: 3,
    attackType: 'MAGIC', attacks: [ { dir: 'N', ranges: [3] } ],
    blindspots: ['S'], onDeathHealAll: 1,
    desc: 'Магическая атака. При смерти все союзные существа получают +1 HP.'
  },
  FIRE_INFERNAL_SCIONDAR_DRAGON: {
    id: 'FIRE_INFERNAL_SCIONDAR_DRAGON', name: 'Infernal Sciondar Dragon', type: 'UNIT', cost: 7, activation: 4,
    element: 'FIRE', atk: 5, hp: 8,
    attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [2] } ],
    blindspots: [], dynamicAtk: 'FIRE_CREATURES', activationReductionOnElement: { element: 'FIRE', reduction: 3 },
    desc: 'Атака = 5 + число других огненных существ. На огненной клетке стоимость активации на 3 меньше.'
  },
  FIRE_DIDI_THE_ENLIGHTENED: {
    id: 'FIRE_DIDI_THE_ENLIGHTENED', name: 'Didi the Enlightened', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 2, hp: 4,
    attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], firstStrike: true, doubleAttack: true, plus1IfTargetOnElement: 'FIRE',
    desc: 'Quickness. Бьёт дважды. +1 ATK против огненных целей.'
  },
  FIRE_WARDEN_HILDA: {
    id: 'FIRE_WARDEN_HILDA', name: 'Warden Hilda', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 2, hp: 4,
    attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [2] } ],
    blindspots: ['S'], plus1IfTargetOnElement: 'FIRE', gainPossessionEnemiesOnElement: 'FIRE',
    desc: '+1 ATK против огненных существ. При призыве на неогненное поле захватывает врагов на огненных клетках.'
  },
  FIRE_CRUCIBLE_KING_DIOS_IV: {
    id: 'FIRE_CRUCIBLE_KING_DIOS_IV', name: 'Crucible King Dios IV', type: 'UNIT', cost: 6, activation: 4,
    element: 'FIRE', atk: 3, hp: 6,
    attackType: 'STANDARD', attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], doubleAttack: true,
    desc: 'Атакует дважды. Дополнительные магические эффекты пока не реализованы.'
  },
  FIRE_SCIONDAR_FIRE_GOD: {
    id: 'FIRE_SCIONDAR_FIRE_GOD', name: 'Sciondar Fire God', type: 'UNIT', cost: 9, activation: 5,
    element: 'FIRE', atk: 3, hp: 9,
    attackType: 'MAGIC', attacks: [ { dir: 'N', ranges: [3] } ],
    blindspots: [], incarnation: true, targetAllNonElement: 'FIRE', diesOffElement: 'BIOLITH',
    desc: 'Инкарнация. Магическая атака по всем врагам не на огненных клетках. Гибнет на биолитовой клетке.'
  },
  FIRE_RED_CUBIC: {
    id: 'FIRE_RED_CUBIC', name: 'Red Cubic', type: 'UNIT', cost: 1, activation: 1,
    element: 'FIRE', atk: 0, hp: 1,
    attackType: 'STANDARD', attacks: [],
    blindspots: ['E','S','W'], sacrificeTransform: true,
    desc: 'Sacrifice: превращается в любое некубическое огненное существо из руки.'
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
