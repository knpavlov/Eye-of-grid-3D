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
    attackType: 'MELEE', firstStrike: true,
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
  FIRE_FREEDONIAN: {
    id: 'FIRE_FREEDONIAN', name: 'Freedonian Wanderer', type: 'UNIT', cost: 2, activation: 1,
    element: 'FIRE', atk: 1, hp: 2,
    attackType: 'MELEE',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], auraGainManaOnSummon: true,
    desc: 'While Freedonian Wanderer is on a non-Fire field, you gain 1 mana each time you summon an allied creature.'
  },
  FIRE_FLAME_LIZARD: {
    id: 'FIRE_FLAME_LIZARD', name: 'Partmole Flame Lizard', type: 'UNIT', cost: 2, activation: 2,
    element: 'FIRE', atk: 2, hp: 2,
    attackType: 'MELEE', firstStrike: true, activationReduction: 1,
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'],
    desc: 'Quickness. The activation cost to attack is 1 less than listed.'
  },
  FIRE_GREAT_MINOS: {
    id: 'FIRE_GREAT_MINOS', name: 'Great Minos of Sciondar', type: 'UNIT', cost: 3, activation: 2,
    element: 'FIRE', atk: 2, hp: 1,
    attackType: 'MELEE',
    attacks: [ { dir: 'N', ranges: [1, 2] } ], // бьёт сразу на 1 и 2 клетки вперёд
    pierce: true, // игнорирует стоящих на пути
    blindspots: ['S'], dodge50: true, diesOffElement: 'FIRE', activationReduction: 1,
    desc: 'Perfect Dodge. The activation cost to attack is 1 less. Destroy Great Minos if he is on a non-Fire field.'
  },
  FIRE_FLAME_ASCETIC: {
    id: 'FIRE_FLAME_ASCETIC', name: 'Flame Ascetic', type: 'UNIT', cost: 3, activation: 3,
    element: 'FIRE', atk: 2, hp: 3,
    attackType: 'MELEE',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], randomPlus2: true, activationReduction: 2,
    desc: 'Adds 2 to its Attack half the time. The activation cost to attack is 2 less than listed.'
  },
  FIRE_TRICEPTAUR: {
    id: 'FIRE_TRICEPTAUR', name: 'Triceptaur Behemoth', type: 'UNIT', cost: 5, activation: 5,
    element: 'FIRE', atk: 5, hp: 4,
    attackType: 'MELEE',
    attacks: [
      { dir: 'N', ranges: [1] },
      { dir: 'E', ranges: [1] },
      { dir: 'W', ranges: [1] }
    ],
    blindspots: ['S'], penaltyByTargets: { '2': -2, '3': -4 },
    friendlyFire: true, // задевает и своих
    desc: 'When Triceptaur Behemoth attacks 2 creatures, subtract 2 from its Attack; when attacking 3 creatures, subtract 4.'
  },
  FIRE_PURSUER: {
    id: 'FIRE_PURSUER', name: 'Pursuer of Saint Dhees', type: 'UNIT', cost: 6, activation: 6,
    element: 'FIRE', atk: 5, hp: 4,
    attackType: 'MELEE',
    attacks: [ { dir: 'N', ranges: [1] } ],
    blindspots: ['S'], dynamicAtk: 'OTHERS_ON_BOARD', activationReduction: 5,
    desc: 'Attack = 5 plus the number of other creatures on the board. The activation cost to attack is 5 less than listed.'
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
