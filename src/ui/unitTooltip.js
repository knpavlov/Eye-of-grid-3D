// Формирование HTML-содержимого подсказки для существ
const ICONS = {
  cost: 'textures/Icon_mana.png',
  activation: 'textures/Icon_activation.png',
  hp: 'textures/Icon_heart.png',
  atk: 'textures/Icon_sword.png',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderStat(icon, alt, value) {
  const text = value ?? '—';
  return `
    <div class="unit-tooltip__stat" aria-label="${escapeHtml(alt)}">
      <img src="${icon}" alt="${escapeHtml(alt)}" class="unit-tooltip__stat-icon" />
      <span class="unit-tooltip__stat-value">${escapeHtml(text)}</span>
    </div>
  `;
}

function renderDescription(desc) {
  const raw = desc ?? '';
  const normalized = raw.trim() ? raw : '—';
  const html = escapeHtml(normalized).replace(/\n+/g, '<br>');
  return `
    <div class="unit-tooltip__section">
      <div class="unit-tooltip__section-title">Abilities</div>
      <div class="unit-tooltip__desc">${html}</div>
    </div>
  `;
}

function renderStatuses(statuses) {
  if (!Array.isArray(statuses) || !statuses.length) return '';
  const chips = statuses.map(({ key, text }) => {
    const cls = key ? ` unit-tooltip__status--${key}` : '';
    return `<span class="unit-tooltip__status${cls}">${escapeHtml(text ?? '')}</span>`;
  }).join('');
  return `
    <div class="unit-tooltip__section">
      <div class="unit-tooltip__section-title">Statuses</div>
      <div class="unit-tooltip__statuses">${chips}</div>
    </div>
  `;
}

export function buildUnitTooltipContent({ name, cost, activation, hp, atk, desc, statuses }) {
  const statsHtml = `
    <div class="unit-tooltip__stats">
      ${renderStat(ICONS.cost, 'Summon cost', cost)}
      ${renderStat(ICONS.activation, 'Activation cost', activation)}
      ${renderStat(ICONS.hp, 'Health', hp)}
      ${renderStat(ICONS.atk, 'Attack', atk)}
    </div>
  `;
  const headerHtml = `
    <div class="unit-tooltip__header">
      <div class="unit-tooltip__name">${escapeHtml(name ?? 'Creature')}</div>
    </div>
  `;
  return `
    ${headerHtml}
    ${statsHtml}
    ${renderDescription(desc)}
    ${renderStatuses(statuses)}
  `;
}

export default { buildUnitTooltipContent };
