// Модалка выбора колоды
// Показывает список колод и позволяет выбрать одну
import { DECKS, getDeckCoverCard } from '../core/decks.js';

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
  .deck-card{max-height:70vh;display:flex;flex-direction:column;}
  .deck-list{display:flex;flex-direction:column;gap:8px;overflow-y:auto;margin-bottom:12px;max-height:50vh;}
  .deck-option{display:flex;gap:12px;padding:8px;border-radius:8px;cursor:pointer;background:#1e293b;align-items:center;}
  .deck-option.selected{outline:2px solid #94a3b8;}
  .deck-img-wrap{width:80px;height:120px;position:relative;overflow:hidden;border-radius:6px;flex-shrink:0;}
  .deck-img-wrap img{width:100%;height:100%;object-fit:cover;display:block;}
  .deck-img-wrap::after{content:'';position:absolute;inset:0;background:linear-gradient(to right, rgba(15,23,42,0) 60%, #1e293b 100%);}
  .deck-name{font-weight:600;margin-bottom:4px;}
  .deck-desc{font-size:12px;color:#94a3b8;}
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
}

// Показать модалку выбора колоды; onConfirm вызывается с выбранной колодой
export function showDeckSelect(onConfirm, onCancel){
  injectStyle();
  const modal = document.createElement('div');
  modal.className = 'mp-modal';
  modal.innerHTML = `<div class="mp-card deck-card">
    <div class="deck-list"></div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;">
      <button id="deck-cancel" class="mp-btn">Отмена</button>
      <button id="deck-confirm" class="mp-btn" disabled>Подтвердить</button>
    </div>
  </div>`;
  document.body.appendChild(modal);

  const listEl = modal.querySelector('.deck-list');
  let selected = -1;

  function renderDeck(deck, index){
    const cover = getDeckCoverCard(deck);
    const imgSrc = `card images/${cover.id}.png`;
    const el = document.createElement('div');
    el.className = 'deck-option';
    el.innerHTML = `
      <div class="deck-img-wrap"><img src="${imgSrc}" alt="${deck.name}"></div>
      <div class="deck-info">
        <div class="deck-name">${deck.name}</div>
        <div class="deck-desc">${deck.description}</div>
      </div>`;
    el.addEventListener('click', ()=>{
      selected = index;
      for (const child of listEl.children) child.classList.remove('selected');
      el.classList.add('selected');
      confirmBtn.disabled = false;
    });
    listEl.appendChild(el);
  }
  DECKS.forEach(renderDeck);

  const confirmBtn = modal.querySelector('#deck-confirm');
  const cancelBtn = modal.querySelector('#deck-cancel');
  confirmBtn.addEventListener('click', ()=>{
    if (selected<0) return;
    const deck = DECKS[selected];
    modal.remove();
    onConfirm && onConfirm(deck);
  });
  cancelBtn.addEventListener('click', ()=>{
    modal.remove();
    onCancel && onCancel();
  });
}
