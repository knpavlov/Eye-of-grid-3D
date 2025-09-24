// Формирование HTML-содержимого всплывающей подсказки существа
const ICONS = {
  summon: new URL('../../textures/Icon_mana.png', import.meta.url).href,
  activation: new URL('../../textures/Icon_activation.png', import.meta.url).href,
  health: new URL('../../textures/Icon_heart.png', import.meta.url).href,
  attack: new URL('../../textures/Icon_sword.png', import.meta.url).href,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatValue(value) {
  if (value == null || value === '') return '—';
  return escapeHtml(value);
}

function buildStatBlock(costs = {}, stats = {}) {
  const items = [
    { key: 'summon', icon: ICONS.summon, label: 'Summon', value: costs.summon },
    { key: 'activation', icon: ICONS.activation, label: 'Activation', value: costs.activation },
    { key: 'health', icon: ICONS.health, label: 'HP', value: stats.health },
    { key: 'attack', icon: ICONS.attack, label: 'ATK', value: stats.attack },
  ];

  const rows = items.map(({ key, icon, label, value }) => `
    <div class="unit-tooltip__stat" data-stat="${key}">
      <img class="unit-tooltip__icon" src="${icon}" alt="${escapeHtml(label)}" />
      <div class="unit-tooltip__stat-info">
        <div class="unit-tooltip__stat-label">${escapeHtml(label)}</div>
        <div class="unit-tooltip__stat-value">${formatValue(value)}</div>
      </div>
    </div>
  `);

  return `
    <div class="unit-tooltip__stats-grid">
      ${rows.join('')}
    </div>
  `;
}

function buildDescription(description) {
  const text = typeof description === 'string' ? description.trim() : '';
  if (!text) return '';
  const parts = text.split(/\n+/).map(part => `<div>${escapeHtml(part)}</div>`);
  return `<div class="unit-tooltip__description">${parts.join('')}</div>`;
}

function buildStatuses(statuses = []) {
  if (!Array.isArray(statuses) || !statuses.length) return '';
  const chips = statuses.map((status, idx) => {
    const label = escapeHtml(status?.label ?? 'Status');
    const tone = escapeHtml(status?.tone ?? 'neutral');
    return `<span class="unit-tooltip__status unit-tooltip__status--${tone}" data-idx="${idx}">${label}</span>`;
  });
  return `<div class="unit-tooltip__statuses">${chips.join('')}</div>`;
}

export function buildUnitTooltipContent({ name, costs, stats, description, statuses }) {
  const safeName = escapeHtml(name ?? 'Creature');
  const statsBlock = buildStatBlock(costs, stats);
  const descBlock = buildDescription(description);
  const statusesBlock = buildStatuses(statuses);

  return `
    <div class="unit-tooltip">
      <div class="unit-tooltip__header">
        <div class="unit-tooltip__name">${safeName}</div>
        ${statsBlock}
      </div>
      ${descBlock}
      ${statusesBlock}
    </div>
  `;
}
