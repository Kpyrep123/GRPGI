(function installStockExchangeV148(){
  'use strict';
  if(window.__stockExchangeV148||!window.electronAPI?.getStockExchange)return;
  window.__stockExchangeV148=true;
  let exchange=null,timeframe='1m',busy=false;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const credits=value=>Number(value||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:4});
  const selectedId=()=>document.querySelector('#market-items [data-market-v1074].selected')?.dataset.itemId||'';
  const quote=itemId=>exchange?.quotes?.find(row=>row.itemId===itemId)||null;

  if(typeof Configurator==='object'&&Configurator.renderEquipmentEditor&&Configurator.collectEntity){
    const renderEquipment=Configurator.renderEquipmentEditor.bind(Configurator);
    Configurator.renderEquipmentEditor=function(item){
      let html=renderEquipment(item);
      if(String(item?.type||'').toLowerCase()!=='stock')return html;
      html=html.replace('Минимальная цена акции','Стартовая цена');
      html=html.replace(/<div class="field"><label>Максимальная цена акции<\/label><input class="input" type="number" min="0" step="1" name="stockMaxPrice" value="[^"]*" \/><\/div>/,`<div class="field"><label>Волатильность</label><input class="input" type="number" min="0.05" max="8" step="0.05" name="stockVolatility" value="${Number(item.stockVolatility??1)}" /></div>`);
      return html.replace('Тикер и единый диапазон цены действуют на всех планетах. Акции хранятся в портфеле и продаются за 100% котировки.','Стартовая цена берётся из прежней нижней цены. Верхнего предела нет; волатильность регулирует амплитуду движения.');
    };
    const collectEntity=Configurator.collectEntity.bind(Configurator);
    Configurator.collectEntity=function(type,form,formData=new FormData(form)){
      if(type==='equipment'&&String(formData.get('type')||'').toLowerCase()==='stock'){
        formData.set('stockMaxPrice',formData.get('stockMinPrice')||'0');
      }
      const entity=collectEntity(type,form,formData);
      if(type==='equipment'&&String(entity?.type||'').toLowerCase()==='stock'){
        entity.stockMaxPrice=Number(entity.stockMinPrice||0);
        entity.stockVolatility=Math.max(.05,Math.min(8,Number(formData.get('stockVolatility')||1)));
      }
      return entity;
    };
  }

  function chart(itemId){
    const rows=(exchange?.candles?.[itemId]||[]).slice(-(timeframe==='1h'?60:timeframe==='5m'?30:20));
    if(rows.length<2)return'<div class="stock-chart-empty-v148">Сервер накапливает историю котировок…</div>';
    const values=rows.flatMap(row=>[Number(row.high),Number(row.low)]),min=Math.min(...values),max=Math.max(...values),span=Math.max(.01,max-min),width=640,height=180,pad=12,step=(width-pad*2)/rows.length,y=value=>height-pad-((Number(value)-min)/span)*(height-pad*2);
    const candles=rows.map((row,index)=>{const x=pad+step*(index+.5),up=Number(row.close)>=Number(row.open);return`<g class="${up?'up':'down'}"><line x1="${x}" y1="${y(row.high)}" x2="${x}" y2="${y(row.low)}"/><rect x="${x-Math.max(1,step*.25)}" y="${Math.min(y(row.open),y(row.close))}" width="${Math.max(2,step*.5)}" height="${Math.max(1,Math.abs(y(row.open)-y(row.close)))}"/></g>`;}).join('');
    const indicators=quote(itemId)?.indicators||{};
    return`<div class="stock-ta-v148"><div class="stock-timeframes-v148">${['1m','5m','1h'].map(value=>`<button type="button" class="secondary ${timeframe===value?'active':''}" data-stock-timeframe-v148="${value}">${value}</button>`).join('')}</div><svg viewBox="0 0 ${width} ${height}" aria-label="Свечной график">${candles}</svg><div class="stock-indicators-v148"><span>SMA 5 <b>${indicators.sma5==null?'—':credits(indicators.sma5)}</b></span><span>SMA 20 <b>${indicators.sma20==null?'—':credits(indicators.sma20)}</b></span><span>RSI 14 <b>${indicators.rsi14==null?'—':Number(indicators.rsi14).toFixed(1)}</b></span></div></div>`;
  }

  function orderPanel(itemId){
    const orders=(exchange?.orders||[]).filter(row=>row.itemId===itemId&&row.status==='pending');
    return`<div class="stock-orders-v148"><div class="stock-order-tabs-v148"><b>Заявка</b><span>Исполняется сервером, даже когда приложение закрыто</span></div><div class="stock-order-grid-v148"><label>Операция<select class="input" data-stock-order-intent-v148><option value="open_long">Открыть лонг</option><option value="close_long">Закрыть лонг</option><option value="open_short">Открыть шорт</option><option value="close_short">Закрыть шорт</option></select></label><label>Тип<select class="input" data-stock-order-type-v148><option value="market">Рыночная</option><option value="limit">Лимитная</option><option value="stop_loss">Стоп-лосс</option><option value="take_profit">Тейк-профит</option><option value="trailing_stop">Трейлинг-стоп</option></select></label><label>Количество<input class="input" type="number" min="1" max="10000" value="1" data-stock-order-quantity-v148></label><label>Цена активации<input class="input" type="number" min="0.01" step="0.01" data-stock-order-trigger-v148></label><label>Лимитная цена<input class="input" type="number" min="0.01" step="0.01" data-stock-order-limit-v148></label><label>Трейлинг, %<input class="input" type="number" min="0.1" max="50" step="0.1" value="1" data-stock-order-trailing-v148></label><label>Плечо<select class="input" data-stock-order-leverage-v148><option value="1">×1</option><option value="2">×2</option><option value="3">×3</option></select></label></div><button class="primary" type="button" data-stock-submit-v148="${escape(itemId)}">РАЗМЕСТИТЬ ЗАЯВКУ</button>${orders.length?`<div class="stock-open-orders-v148"><b>Активные заявки</b>${orders.map(order=>`<div><span>${escape(order.type)} · ${escape(order.intent)} · ${order.quantity} шт.</span><button class="secondary" type="button" data-stock-cancel-v148="${escape(order.id)}">Отменить</button></div>`).join('')}</div>`:''}</div>`;
  }

  function decorate(){
    if(!document.querySelector('#market-items [data-market-tab-v1074="stocks"].active'))return;
    for(const tile of document.querySelectorAll('#market-items [data-market-v1074][data-item-id]')){const live=quote(tile.dataset.itemId);if(!live)continue;const price=tile.querySelector('strong');if(price)price.textContent=credits(live.price);}
    const itemId=selectedId(),selection=document.querySelector('#market-items .stock-selection-v1074');if(!itemId||!selection)return;
    const live=quote(itemId),oldChart=selection.querySelector('.stock-chart-v1074, .stock-ta-v148, .stock-chart-empty-v148'),oldTrade=selection.querySelector('.market-quantity-v139, :scope > .primary');if(oldChart)oldChart.outerHTML=chart(itemId);else selection.querySelector('.stock-selection-head-v1074')?.insertAdjacentHTML('afterend',chart(itemId));if(oldTrade)oldTrade.remove();if(!selection.querySelector('.stock-orders-v148'))selection.insertAdjacentHTML('beforeend',orderPanel(itemId));selection.dataset.stockV148=itemId;
    if(live){const box=selection.querySelector('.stock-selection-quote-v1074');if(box)box.innerHTML=`<span>Серверная цена · ${escape(live.regime||'ожидание')}</span><b>${credits(live.price)}</b><small>Обновление каждую секунду</small><strong>${live.change>=0?'▲':'▼'} ${Math.abs(Number(live.changePercent||0)).toFixed(2)}%</strong>`;}
  }

  async function refresh(){
    if(busy||typeof App==='undefined'||!App.currentUser?.id)return;busy=true;
    try{const result=await window.electronAPI.getStockExchange({playerId:App.currentUser.id});if(result?.ok){exchange=result;if(result.player)Object.assign(App.currentUser,result.player);decorate();}}
    finally{busy=false;}
  }

  document.addEventListener('click',event=>{
    const timeframeButton=event.target.closest?.('[data-stock-timeframe-v148]');if(timeframeButton){timeframe=timeframeButton.dataset.stockTimeframeV148;const selection=document.querySelector('#market-items .stock-selection-v1074');if(selection){selection.dataset.stockV148='';decorate();}return;}
    const submit=event.target.closest?.('[data-stock-submit-v148]');if(submit){const panel=submit.closest('.stock-orders-v148'),payload={playerId:App.currentUser.id,itemId:submit.dataset.stockSubmitV148,intent:panel.querySelector('[data-stock-order-intent-v148]').value,type:panel.querySelector('[data-stock-order-type-v148]').value,quantity:Number(panel.querySelector('[data-stock-order-quantity-v148]').value),triggerPrice:Number(panel.querySelector('[data-stock-order-trigger-v148]').value),limitPrice:Number(panel.querySelector('[data-stock-order-limit-v148]').value),trailingPercent:Number(panel.querySelector('[data-stock-order-trailing-v148]').value),leverage:Number(panel.querySelector('[data-stock-order-leverage-v148]').value),operationId:crypto.randomUUID()};window.electronAPI.submitStockOrder(payload).then(result=>{if(!result?.ok)throw new Error(result?.message||'Заявка отклонена');Toast.show(result.status==='filled'?'Заявка исполнена':'Заявка размещена','ok');return refresh();}).catch(error=>Toast.show(error.message||String(error),'err'));return;}
    const cancel=event.target.closest?.('[data-stock-cancel-v148]');if(cancel)window.electronAPI.cancelStockOrder({playerId:App.currentUser.id,orderId:cancel.dataset.stockCancelV148}).then(refresh).catch(error=>Toast.show(error.message||String(error),'err'));
    if(event.target.closest?.('[data-market-tab-v1074="stocks"],[data-market-v1074]'))setTimeout(refresh,0);
  });
  setInterval(()=>{if(document.querySelector('#market-items [data-market-tab-v1074="stocks"].active'))refresh();},1000);
})();
