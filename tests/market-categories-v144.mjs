import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const target of ['renderer','deploy/site/app']){
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,target,'market-categories-v144.js'),'utf8'),context);
  const api=context.GRPGMarketCategoriesV144;
  const items=new Map([['w',{type:'weapon'}],['a',{type:'armor'}],['g',{type:'gear'}],['b',{type:'backpack'}]]);
  const result=api.categories([{itemId:'g'},{itemId:'a'},{itemId:'w'},{itemId:'a'},{itemId:'b'},{itemId:'gone'}],id=>items.get(id));
  assert.deepEqual(Array.from(result,row=>[row.label,row.count]),[['Оружие',1],['Броня',2],['Рюкзаки',1],['Снаряжение',1]]);
  assert.equal(api.category({type:'ammo'}),'Боеприпасы');
  assert.equal(api.category({type:'stock'}),'Снаряжение');
}
console.log('PASS market category labels, counts and ordering in both clients');
