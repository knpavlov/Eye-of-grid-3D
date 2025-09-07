export const netState = {
  NET_ACTIVE: false,
  MY_SEAT: null,
  APPLYING: false,
  __endTurnInProgress: false,
  drawAnimationActive: false,
  splashActive: false,
  // Флаги анимации маны перенесены сюда из index.html
  manaGainActive: false,
  PENDING_MANA_ANIM: null,
  PENDING_MANA_BLOCK: [0, 0],
};

export const NET_ON = () => netState.NET_ACTIVE;
