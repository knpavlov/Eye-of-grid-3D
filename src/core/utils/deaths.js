// Утилита формирования записей о погибших существах для дальнейшей обработки
export function buildDeathRecord(state, r, c, unit, opts = {}) {
  if (!unit) {
    const empty = [];
    empty.primary = null;
    empty.owner = null;
    empty.element = null;
    return empty;
  }
  const element = state?.board?.[r]?.[c]?.element ?? null;
  const owner = Number.isInteger(unit.owner) ? unit.owner : null;
  const record = {
    r,
    c,
    owner,
    tplId: unit.tplId ?? null,
    uid: unit.uid ?? null,
    element,
  };
  if (opts?.cause) {
    record.cause = opts.cause;
  }
  if (opts?.killer) {
    record.killer = opts.killer;
  }
  const records = [record];
  records.primary = record;
  records.owner = owner;
  records.element = element;
  records.before = {
    mana: Number.isFinite(state?.players?.[owner]?.mana)
      ? Math.max(0, Number(state.players[owner].mana))
      : 0,
  };
  return records;
}

export default { buildDeathRecord };
