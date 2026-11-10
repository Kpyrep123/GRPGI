'use strict';
const StockMotion = require('./stock-motion-v165.js');
const round=n=>Math.round(n*1e4)/1e4;
function rate(value,fallback){const n=Number(value??fallback);if(!Number.isFinite(n)||n<0||n>1)throw Error('Invalid market fee rate');return n;}
function rates(env=process.env){return {tradeRate:rate(env.MARKET_TRADE_FEE_RATE,.001),borrowDailyRate:rate(env.MARKET_BORROW_DAILY_RATE,.0003),custodyDailyRate:rate(env.MARKET_CUSTODY_DAILY_RATE,.0001)};}
function accrue(profile,prices,tick,fees){
 const book=profile.stockPortfolio;if(!book)return false;let changed=false,borrow=0,custody=0;
 for(const [side,positions] of [['long',book.positions],['short',book.shortPositions]])for(const [id,p] of Object.entries(positions||{})){
  const qty=Number(side==='long'?p.knownQty:p.quantity)||0;if(qty<=0)continue;
  const prior=Number(p.lastFeeAt)||tick;if(tick<prior)continue;
  const days=(tick-prior)/86400,price=Number(prices.get(id));
  // Do not charge unknown prices or a period before this feature was installed.
  if(!Number.isFinite(price)||price<=0)continue;
  const loan=Math.max(0,Number(p.costBasis||0)-Number(p.margin??p.costBasis??0));
  borrow+=loan*fees.borrowDailyRate*days;custody+=qty*price*fees.custodyDailyRate*days;
  if(p.lastFeeAt!==tick){p.lastFeeAt=tick;changed=true;}
 }
 const carry=Number(book.feeRemainderV213)||0,total=round(borrow+custody+carry);
 book.feeRemainderV213=borrow+custody+carry-total;
 if(total){profile.credits=round((Number(profile.credits)||0)-total);const id='fees-v213-'+Math.floor(tick/86400);book.ledger=book.ledger||[];let entry=book.ledger.find(x=>x.id===id);if(!entry){entry={id,type:'fees',borrowFee:0,custodyFee:0,total:0,cashFlow:0};book.ledger.push(entry);}entry.borrowFee=round(entry.borrowFee+borrow);entry.custodyFee=round(entry.custodyFee+custody);entry.total=round(entry.total+total);entry.cashFlow=-entry.total;entry.createdAt=new Date(tick*1000).toISOString();changed=true;}
 if(book.ledger?.length>500)book.ledger.splice(0,book.ledger.length-500);
 return changed;
}
function protection(body,entry){
 const opening=['open_long','open_short'].includes(body.intent),sl=Number(body.stopLoss||0),tp=Number(body.takeProfit||0);
 if(![sl,tp].every(n=>Number.isFinite(n)&&n>=0))throw Error('Укажите положительные цены защиты');
 if((sl||tp)&&!opening)throw Error('Защита задаётся для открытия позиции');
 const long=body.intent==='open_long';
 if(sl&&(long?sl>=entry:sl<=entry))throw Error('Стоп-лосс должен находиться со стороны убытка от цены входа');
 if(tp&&(long?tp<=entry:tp>=entry))throw Error('Тейк-профит должен находиться со стороны прибыли от цены входа');
 return {stopLoss:sl,takeProfit:tp};
}
function editPosition(profile,body,_price,tick){
 const book=profile.stockPortfolio||(profile.stockPortfolio={positions:{},shortPositions:{},ledger:[]});
 const side=body.side,fromSide=body.fromSide||side,id=String(body.itemId||'');
 if(!['long','short'].includes(side)||!['long','short'].includes(fromSide))throw Error('Укажите лонг или шорт');
 const source=fromSide==='long'?book.positions:book.shortPositions,target=side==='long'?book.positions:book.shortPositions;
 const old=source[id],qtyOld=(fromSide==='long'?(Number(old?.knownQty)||0)+(Number(old?.unpricedQty)||0):Number(old?.quantity))||0;
 if(body.action!=='add'){
  if(!old)throw Error('Позиция уже удалена');
  const expected=body.expected;
  if(!expected||Number(expected.quantity)!==qtyOld||Number(expected.costBasis)!==Number(old.costBasis)||Number(expected.margin)!==Number(old.margin??old.costBasis))throw Error('Позиция изменилась. Обновите список акций');
 }
 if(body.action==='delete'){delete source[id];return;}
 const qty=Number(body.quantity),lev=Number(body.leverage),entry=Number(body.entryPrice);
 if(!Number.isSafeInteger(qty)||qty<1||qty>1e6||!Number.isFinite(lev)||lev<1||lev>3||!Number.isFinite(entry)||entry<=0)throw Error('Укажите количество 1–1000000, цену входа и плечо ×1–×3');
 if(side!==fromSide&&target[id])throw Error('Позиция этого направления уже существует');
 const existing=body.action==='add'?target[id]:null;
 const oldQty=Number(side==='long'?existing?.knownQty:existing?.quantity)||0;
 if(oldQty+qty>1e6)throw Error('Превышен предел количества акций');
 const basis=round((Number(existing?.costBasis)||0)+qty*entry),margin=round(Number(existing?.margin??existing?.costBasis??0)+qty*entry/lev);
 if(!Number.isFinite(basis)||basis>Number.MAX_SAFE_INTEGER||!Number.isFinite(margin)||margin<=0)throw Error('Стоимость позиции или обеспечение недопустимы');
 if(body.action!=='add')delete source[id];
 target[id]={itemId:id,[side==='long'?'knownQty':'quantity']:oldQty+qty,unpricedQty:Number(existing?.unpricedQty)||0,costBasis:basis,margin,leverage:basis/margin,lastFeeAt:tick};
}

const NEWS_INTERVAL_SECONDS = 3600;
const PROFIT_THRESHOLD = .003;
const FULL_PRESSURE_AT = .02;
const MAX_LOG_MOVE_PER_SECOND = .000025;

function openExposure(profiles) {
 const result = new Map();
 for (const profile of profiles) {
  const book = profile?.stockPortfolio;
  if (!book || profile.__deleted || String(profile.role || '').toLowerCase() === 'gm' ||
      ['pending', 'rejected'].includes(profile.approvalStatus)) continue;
  for (const [side, positions, quantityField] of [
   ['long', book.positions, 'knownQty'], ['short', book.shortPositions, 'quantity']
  ]) {
   for (const [id, position] of Object.entries(positions || {})) {
    const quantity = Number(position?.[quantityField]), basis = Number(position?.costBasis);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(basis) || basis <= 0) continue;
    const row = result.get(id) || {longQty:0, shortQty:0, longBasis:0, shortBasis:0};
    row[side + 'Qty'] += quantity;
    row[side + 'Basis'] += basis;
    result.set(id, row);
   }
  }
 }
 return result;
}

function pressure(price, exposure) {
 if (!exposure) return 0;
 const {longQty, shortQty, longBasis, shortBasis} = exposure;
 const net = longQty - shortQty;
 const basis = longBasis + shortBasis;
 if (!net || !Number.isFinite(basis) || basis <= 0) return 0;
 const pnl = price * net + shortBasis - longBasis;
 const strength = Math.max(0, Math.min(1, (pnl / basis - PROFIT_THRESHOLD) / (FULL_PRESSURE_AT - PROFIT_THRESHOLD)));
 return strength ? -net / (longQty + shortQty) * strength : 0;
}

function nextQuote(options, exposure) {
 const motion = StockMotion.next({...options, newsIntervalSeconds:NEWS_INTERVAL_SECONDS,randomWalk:true});
 const delta = pressure(options.price, exposure) * MAX_LOG_MOVE_PER_SECOND * options.stepSeconds;
 if (!delta) return motion;
 const factor = Math.exp(delta);
 return {...motion, price:Math.max(StockMotion.MIN_PRICE, Math.round(motion.price * factor * 10000) / 10000),
  anchor:Math.max(StockMotion.MIN_PRICE, motion.anchor * factor)};
}

module.exports={rates,accrue,protection,editPosition,round,marketRisk:{openExposure,pressure,next:nextQuote}};
