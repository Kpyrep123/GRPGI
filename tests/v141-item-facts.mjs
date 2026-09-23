import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const facts=require('../renderer/item-facts-v141.js');

const rifle={id:'r',type:'weapon',name:'Винтовка',mass:2.5,inventoryWidth:2,inventoryHeight:1,
  damage:'2d6',rapidFireShots:6,magazineSize:30,ammoPerShot:3,ammoFamily:'6.5',
  durabilityMax:7,chargesMax:3,modifiers:[
    {target:'carry_capacity',op:'add',value:5,enabled:true},
    {target:'inventory_slots',op:'set',value:0,enabled:true},
    {target:'movement',op:'add_stat',statRef:'dexterity',condition:'has_skill',conditionValue:'<skill>',enabled:true},
    {target:'attack_bonus',op:'add',value:999,enabled:false}
  ]};
const text=facts.pills(rifle);
for(const term of ['6 выстр./действие','30','3','6.5','7','Максимум зарядов','Переносимый вес','+5','установить 0','при наличии навыка','&lt;skill&gt;'])
  assert.ok(text.includes(term),term);
assert.ok(!text.includes('999'));
assert.ok(!text.includes('<skill>'));
assert.match(facts.table({type:'armor',armorClass:0,modifiers:[{target:'armor_class',op:'add',value:3}]}),/Класс брони/);
assert.ok(!facts.table({type:'armor',armorClass:0,modifiers:[{target:'armor_class',op:'add',value:3}]}).includes('Базовый класс брони'));
assert.match(facts.pills({type:'armor',armorClass:8,modifiers:[{target:'armor_class',op:'add',value:3}]},{excludeLabels:['Класс брони: 8']}),/Класс брони:<\/b> \+3/);
assert.equal(facts.facts({type:'gear',modifiers:[{target:'carry_capacity',op:'add',value:0,enabled:true}]}).at(-1).value,'+0');
console.log('PASS item facts: full firearm fields, weight modifiers, zero and conditional values, escaping and disabled modifiers');
