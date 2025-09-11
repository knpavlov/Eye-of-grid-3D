import { STARTER_FIRESET } from './cards.js';

// Описание доступных колод. Каждая колода содержит имя,
// краткое описание и массив карт. Новые колоды можно
// добавить простым расширением этого списка.
export const DECKS = [
  {
    id: 'starter_fire',
    name: 'Огненное пробуждение',
    desc: 'Базовая колода огненных существ и нейтральных заклинаний.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'placeholder_2',
    name: 'Туманная загадка',
    desc: 'Заглушка: скоро здесь появится новая колода.',
    cards: STARTER_FIRESET,
  },
  {
    id: 'placeholder_3',
    name: 'Ледяной мираж',
    desc: 'Заглушка: колода в разработке.',
    cards: STARTER_FIRESET,
  },
];

export default DECKS;
