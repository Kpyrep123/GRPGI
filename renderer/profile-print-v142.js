'use strict';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const plain = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const text = value => escapeHtml(plain(value)).slice(0, 12000);
const list = (values, formatter) => (Array.isArray(values) ? values.slice(0, 150) : []).map(formatter).join('') || '<p class="empty">Нет данных</p>';
function renderProfilePdfV142(raw = {}) {
  const profile = raw && typeof raw === 'object' ? raw : {};
  const stats = profile.stats || {};
  const abilities = profile.abilities || {};
  const inventory = profile.inventory || [];
  const equip = profile.equipment || [];
  const cards = rows => Object.entries(rows).slice(0, 40).map(([label, value]) => `<div class="cell"><small>${text(label)}</small><strong>${text(value)}</strong></div>`).join('');
  const item = row => `<div class="line"><span>${text(row?.name || row?.itemId || 'Предмет')}</span><b>${text(row?.detail || (row?.qty ? `×${row.qty}` : ''))}</b></div>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Scattered World · ${text(profile.name)}</title><style>
  @page{size:A4;margin:17mm 16mm 18mm}*{box-sizing:border-box}body{margin:0;color:#201b16;background:#fff;font:10pt/1.42 Arial,'DejaVu Sans',sans-serif}header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #8e713e;padding:0 0 15px;margin-bottom:18px}.sigil{position:relative;width:56px;height:56px;flex:none;border:2px solid #8e713e;border-radius:50%;display:grid;place-items:center;color:#8e713e;font:26px Georgia,serif}.sigil:before,.sigil:after{content:'';position:absolute;width:75px;height:1px;background:#8e713e;transform:rotate(35deg)}.sigil:after{transform:rotate(-35deg)}.brand{font:700 12pt Georgia,serif;letter-spacing:.2em;color:#745a30}.serial{font:8pt Arial,sans-serif;letter-spacing:.13em;color:#796b58;margin-top:4px}h1{font:700 22pt Georgia,serif;margin:7px 0 0}h2{font:700 11pt Arial,sans-serif;text-transform:uppercase;letter-spacing:.1em;color:#684e2a;border-bottom:1px solid #ccb995;padding-bottom:5px;margin:20px 0 10px;break-after:avoid}section{break-inside:avoid}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.cell{border:1px solid #d7c9ad;background:#f8f5ee;padding:8px;min-height:47px}.cell small{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.05em;color:#6b604e}.cell strong{font-size:11pt;overflow-wrap:anywhere}.line{display:flex;justify-content:space-between;gap:15px;padding:6px 2px;border-bottom:1px solid #e3dac8;break-inside:avoid}.line span{overflow-wrap:anywhere}.line b{font-weight:600;color:#684e2a;text-align:right}.empty{color:#766e60}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}footer{border-top:1px solid #ccb995;margin-top:22px;padding-top:7px;color:#746750;font:8pt Arial,sans-serif;letter-spacing:.1em}
  </style></head><body><header><div class="sigil" aria-hidden="true">✧</div><div><div class="brand">SCATTERED WORLD</div><div class="serial">АРХИВ ПЕРСОНАЖА · ${text(profile.id || '—')}</div><h1>${text(profile.name || 'Без имени')}</h1><div>${text(profile.rank || '')} ${profile.location ? '· ' + text(profile.location) : ''}</div></div></header>
  <section><h2>Состояние</h2><div class="grid">${cards({'Здоровье':`${stats.hpCurrent ?? 0} / ${stats.hpMax ?? 0}`,'Щит':`${stats.shieldCurrent ?? 0} / ${stats.shieldMax ?? 0}`,'Энергия':`${stats.energyCurrent ?? 0} / ${stats.energyMax ?? 0}`,'Кредиты':profile.credits ?? 0,'Класс брони':stats.armorClass ?? '—','Защита':stats.defense ?? '—','Обзор':profile.vision ?? '—','Движение':profile.movement ?? '—','Ячейки инвентаря':profile.inventorySize ?? '—','Переносимый вес':profile.carryWeightMax ?? '—'})}</div></section>
  <section><h2>Характеристики</h2><div class="grid">${cards(abilities)}</div></section>
  <section><h2>Экипировка</h2>${list(equip,item)}</section><section><h2>Инвентарь</h2>${list(inventory,item)}</section>
  <section><h2>Импланты</h2>${list(profile.implants,item)}</section><section><h2>Репутация</h2>${list(profile.reputation,item)}</section>
  <section><h2>Личность</h2><div class="two"><div><b>Черта характера</b><p>${text(profile.personalityTrait || '—')}</p><b>Идеал</b><p>${text(profile.ideal || '—')}</p></div><div><b>Слабость</b><p>${text(profile.weakness || '—')}</p></div></div></section>
  <section><h2>История</h2><p>${text(profile.lore || '—')}</p></section><section><h2>Связанные NPC</h2>${list(profile.npcs,item)}</section>
  <footer>SCATTERED WORLD · ПЕЧАТНАЯ КОПИЯ ДОСЬЕ</footer></body></html>`;
}
if (typeof module === 'object' && module.exports) module.exports = { renderProfilePdfV142 };
if (typeof window !== 'undefined') window.GRPGProfilePrintV142 = Object.freeze({ renderProfilePdfV142 });
