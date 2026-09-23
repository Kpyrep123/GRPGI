const { parentPort } = require('worker_threads');
const { LuaFactory } = require('wasmoon');

const SUPPORTED_HOOKS = Object.freeze([
  'OnAttackDeclared',
  'BeforeAttackStart',
  'OnHit',
  'BeforeDamage',
  'OnTakeDamage',
  'OnAbilityPhaseStart',
  'OnAbilityExecuted',
  'GetBehavior',
  'GetCastRange',
  'GetAOERadius',
  'GetThinkerDuration',
  'GetThinkerInterval',
  'OnThinkerInterval',
  'OnThinkerDestroyed',
  'OnTurnStart',
  'OnTurnEnd'
]);

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toLuaLiteral(value, depth = 0) {
  if (depth > 24) return 'nil';
  if (value == null) return 'nil';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(finiteNumber(value, 0));
  if (typeof value === 'string') return JSON.stringify(value).replace(/\u2028|\u2029/g, ' ');
  if (Array.isArray(value)) return `{${value.map(item => toLuaLiteral(item, depth + 1)).join(',')}}`;
  if (typeof value === 'object') {
    const rows = [];
    for (const [key, item] of Object.entries(value)) {
      rows.push(`[${toLuaLiteral(String(key), depth + 1)}]=${toLuaLiteral(item, depth + 1)}`);
    }
    return `{${rows.join(',')}}`;
  }
  return 'nil';
}

const PRELUDE = String.raw`
local __input = __INPUT_PLACEHOLDER__
local __commands = {}
local __commandLimit = 128

local function __num(value, fallback)
  local parsed = tonumber(value)
  if parsed == nil or parsed ~= parsed or parsed == math.huge or parsed == -math.huge then return fallback or 0 end
  return parsed
end
local function __id(value)
  if type(value) == 'table' and value.__unitId then return tostring(value.__unitId) end
  return tostring(value or '')
end
local function __push(row)
  if #__commands >= __commandLimit then error('Превышен лимит команд Lua (' .. __commandLimit .. ')') end
  __commands[#__commands + 1] = row
  return row
end
local function __contains(rows, wanted)
  wanted = tostring(wanted or '')
  for _, value in ipairs(rows or {}) do if tostring(value) == wanted then return true end end
  return false
end

local VectorMeta = {}
VectorMeta.__index = VectorMeta
function Vector(x, y) return setmetatable({ x = __num(x), y = __num(y) }, VectorMeta) end
function VectorMeta.__add(a, b) return Vector(__num(a.x) + __num(b.x), __num(a.y) + __num(b.y)) end
function VectorMeta.__sub(a, b) return Vector(__num(a.x) - __num(b.x), __num(a.y) - __num(b.y)) end
function VectorMeta.__mul(a, b)
  if type(a) == 'number' then return Vector(a * __num(b.x), a * __num(b.y)) end
  if type(b) == 'number' then return Vector(__num(a.x) * b, __num(a.y) * b) end
  return __num(a.x) * __num(b.x) + __num(a.y) * __num(b.y)
end
function VectorMeta:Length2D() return math.sqrt(__num(self.x) ^ 2 + __num(self.y) ^ 2) end
function VectorMeta:Normalized()
  local length = self:Length2D()
  if length <= 0 then return Vector(0, 0) end
  return Vector(self.x / length, self.y / length)
end

local Unit = {}
Unit.__index = Unit
local __units = {}
local __unitOrder = {}
for _, row in ipairs(__input.units or {}) do
  local id = tostring(row.id or '')
  __units[id] = setmetatable({ __unitId = id, __data = row }, Unit)
  __unitOrder[#__unitOrder + 1] = __units[id]
end
local function __unit(value) return __units[__id(value)] end

function Unit:GetId() return self.__unitId end
function Unit:GetName() return tostring(self.__data.name or self.__unitId) end
function Unit:IsPlayer() return tostring(self.__data.kind or '') == 'player' end
function Unit:IsNPC() return tostring(self.__data.kind or '') == 'npc' end
function Unit:IsAlive() return self:GetHealth() > 0 end
function Unit:GetHealth() return __num(self.__data.hpCurrent) end
function Unit:GetMaxHealth() return __num(self.__data.hpMax) end
function Unit:GetStat(name) return __num((self.__data.stats or {})[tostring(name or '')]) end
function Unit:GetStrength() return self:GetStat('strength') end
function Unit:GetDexterity() return self:GetStat('dexterity') end
function Unit:GetEndurance() return self:GetStat('endurance') end
function Unit:GetIntelligence() return self:GetStat('intelligence') end
function Unit:GetWill() return self:GetStat('will') end
function Unit:GetGlory() return self:GetStat('glory') end
function Unit:GetDefense() return self:GetStat('defense') end
function Unit:GetArmorClass() return self:GetStat('armorClass') end
function Unit:GetBaseArmorClass() return self:GetStat('baseArmorClass') end
function Unit:GetShieldArmorClass() return self:GetStat('shieldArmorClass') end
function Unit:GetAbsorption(source)
  source = string.lower(tostring(source or 'all'))
  if source == 'base' then return self:GetStat('baseAbsorption') end
  if source == 'armor' then return self:GetStat('armorAbsorption') end
  if source == 'shield' then return self:GetStat('shieldAbsorption') end
  if source == 'cover' then return self:GetStat('coverAbsorption') end
  return self:GetStat('absorption')
end
function Unit:GetDamageAbsorption(source) return self:GetAbsorption(source) end
function Unit:GetArmorAbsorption() return self:GetAbsorption('armor') end
function Unit:GetShieldAbsorption() return self:GetAbsorption('shield') end
function Unit:GetAbsOrigin() return Vector(self.__data.x, self.__data.y) end
function Unit:SetAbsOrigin(position)
  if type(position) ~= 'table' then error('SetAbsOrigin ожидает Vector(x, y)') end
  return __push({ kind = 'move_to', unitId = self:GetId(), x = __num(position.x), y = __num(position.y) })
end
function Unit:DistanceTo(other)
  local distances = self.__data.distances or {}
  return __num(distances[__id(other)], 999999)
end
function Unit:IsAlly(other)
  other = __unit(other)
  return other ~= nil and tostring(self.__data.teamId or '') ~= '' and tostring(self.__data.teamId) == tostring(other.__data.teamId or '')
end
function Unit:IsEnemy(other) return __unit(other) ~= nil and not self:IsAlly(other) and self:GetId() ~= __id(other) end
function Unit:HasAbility(id) return __contains(self.__data.abilities, id) end
function Unit:HasSkill(id) return self:HasAbility(id) end
function Unit:IsTrained(id) return __contains(self.__data.trained, id) end
function Unit:GetInventory() return self.__data.inventory or {} end
function Unit:GetEquippedItems() return self.__data.equipped or {} end
function Unit:GetItemCount(id)
  id = tostring(id or '')
  local count = 0
  for _, row in ipairs(self:GetInventory()) do if tostring(row.itemId or row.id or '') == id then count = count + math.max(0, math.floor(__num(row.qty))) end end
  -- NPCs usually expose a loadout, not a player inventory. Treat each loadout
  -- entry as one owned item so HasItem works for scripted NPC abilities.
  if count == 0 and self:IsNPC() then
    for _, row in ipairs(self:GetEquippedItems()) do if tostring(row.itemId or row.id or '') == id then count = count + math.max(1, math.floor(__num(row.qty, 1))) end end
  end
  return count
end
function Unit:HasItem(id, minimum)
  local required = math.max(1, math.floor(__num(minimum, 1)))
  return self:GetItemCount(id) >= required or (required == 1 and self:HasEquippedItem(id))
end
function Unit:HasItemType(itemType, minimum)
  itemType = string.lower(tostring(itemType or ''))
  local count = 0
  for _, row in ipairs(self:GetInventory()) do if string.lower(tostring(row.type or '')) == itemType then count = count + math.max(0, math.floor(__num(row.qty))) end end
  if count == 0 and self:IsNPC() then
    for _, row in ipairs(self:GetEquippedItems()) do if string.lower(tostring(row.type or '')) == itemType then count = count + math.max(1, math.floor(__num(row.qty, 1))) end end
  end
  return count >= math.max(1, math.floor(__num(minimum, 1)))
end
function Unit:HasEquippedItem(id)
  id = tostring(id or '')
  for _, row in ipairs(self:GetEquippedItems()) do if tostring(row.itemId or row.id or '') == id then return true end end
  return false
end
function Unit:IsItemEquipped(id) return self:HasEquippedItem(id) end
function Unit:HasEquippedType(itemType)
  itemType = string.lower(tostring(itemType or ''))
  for _, row in ipairs(self:GetEquippedItems()) do if string.lower(tostring(row.type or '')) == itemType then return true end end
  return false
end
function Unit:IsItemTypeEquipped(itemType) return self:HasEquippedType(itemType) end
function Unit:GetEquippedItem(slot)
  slot = tostring(slot or '')
  for _, row in ipairs(self:GetEquippedItems()) do if tostring(row.slot or '') == slot then return tostring(row.itemId or row.id or '') end end
  return nil
end
function Unit:GetEquippedItemData(slot)
  slot = tostring(slot or '')
  for _, row in ipairs(self:GetEquippedItems()) do
    if tostring(row.slot or '') == slot or tostring(row.itemId or row.id or '') == slot then return row end
  end
  for _, row in ipairs(self:GetInventory()) do
    if tostring(row.itemId or row.id or '') == slot then return row end
  end
  return nil
end
function Unit:HasReaction() return self.__data.reactionAvailable == true end
function Unit:IsReactionAvailable() return self:HasReaction() end
function Unit:GetMovementMode() return tostring(self.__data.movementMode or 'ground') end
function Unit:IsFlying() return self:GetMovementMode() == 'flight' end
function Unit:IsSwimming() return self:GetMovementMode() == 'swim' end
function Unit:IsClimbing() return self:GetMovementMode() == 'climb' end
function Unit:HasCondition(name) return (self.__data.conditions or {})[tostring(name or '')] == true end
function Unit:IsDying() return self:HasCondition('dying') end
function Unit:IsStabilized() return self:HasCondition('stabilized') end
function Unit:IsProne() return self:HasCondition('prone') end
function Unit:IsStunned() return self:HasCondition('stunned') end
function Unit:IsGrappled() return self:HasCondition('grappled') end
function Unit:IsUnconscious() return self:HasCondition('unconscious') end
function Unit:AreHandsBusy() return self:HasCondition('handsBusy') end
function Unit:GetAmmo(slot)
  local row = self:GetEquippedItemData(slot)
  return row and math.max(0, math.floor(__num(row.ammo))) or 0
end
function Unit:GetMagazineSize(slot)
  local row = self:GetEquippedItemData(slot)
  return row and math.max(0, math.floor(__num(row.magazineSize))) or 0
end
function Unit:GetAmmoType(slot)
  local row = self:GetEquippedItemData(slot)
  return row and tostring(row.ammoTypeId or '') or ''
end
function Unit:IsWeaponEmpty(slot) return self:GetMagazineSize(slot) > 0 and self:GetAmmo(slot) <= 0 end
function Unit:GetDurability(slot)
  local row = self:GetEquippedItemData(slot)
  return row and math.max(0, __num(row.durability)) or 0
end
function Unit:GetMaxDurability(slot)
  local row = self:GetEquippedItemData(slot)
  return row and math.max(0, __num(row.durabilityMax)) or 0
end
function Unit:IsItemBroken(slot)
  local row = self:GetEquippedItemData(slot)
  return row ~= nil and (row.broken == true or (__num(row.durabilityMax) > 0 and __num(row.durability) <= 0))
end
function Unit:IsShieldDestroyed(slot) return self:IsItemBroken(slot or 'secondaryWeapon') end
function Unit:GetCharges(slot)
  local row = self:GetEquippedItemData(slot)
  return row and math.max(0, math.floor(__num(row.charges))) or 0
end
function Unit:GetMaxCharges(slot)
  local row = self:GetEquippedItemData(slot)
  return row and math.max(0, math.floor(__num(row.chargesMax))) or 0
end
function Unit:HasCharges(slot, minimum) return self:GetCharges(slot) >= math.max(1, math.floor(__num(minimum, 1))) end
function Unit:HasModifier(id) return __contains(self.__data.modifiers, id) end
function Unit:Heal(amount, source) return Heal(source or self, self, amount) end
function Unit:InflictDamage(target, amount) return InflictDamage(self, target, amount) end

local Source = {}
Source.__index = Source
local __source = setmetatable({ __data = __input.source or {} }, Source)
function Source:GetId() return tostring(self.__data.id or '') end
function Source:GetName() return tostring(self.__data.name or self:GetId()) end
function Source:GetKind() return tostring(self.__data.kind or '') end
function Source:GetCaster() return __unit(self.__data.ownerId) end
function Source:GetOwner() return self:GetCaster() end
function Source:HasTag(tag) return __contains(self.__data.tags, tag) end
function Source:GetBehavior() return tostring(self.__data.behavior or 'scripted') end
function Source:GetCastRange() return __num(self.__data.castRange) end
function Source:GetAOERadius() return __num(self.__data.areaRadius) end
function Source:GetThinkerDuration() return __num(self.__data.thinkerDuration) end
function Source:GetThinkerInterval() return __num(self.__data.thinkerInterval, 1) end

ABILITY_BEHAVIOR_SCRIPTED = 'scripted'
ABILITY_BEHAVIOR_NO_TARGET = 'no_target'
ABILITY_BEHAVIOR_SELF = 'self'
ABILITY_BEHAVIOR_UNIT_TARGET = 'unit_target'
ABILITY_BEHAVIOR_POINT = 'point'
ABILITY_BEHAVIOR_AREA = 'area'
ABILITY_BEHAVIOR_AURA = 'aura'
ABILITY_BEHAVIOR_PERSISTENT_AREA = 'persistent_area'
ABILITY_BEHAVIOR_TOGGLE_AURA = 'toggle_aura'

local function __damageSpec(spec, defaultSource)
  spec = type(spec) == 'table' and spec or {}
  return {
    absorptionSource = tostring(spec.absorptionSource or spec.source or defaultSource or 'all'),
    penetration = math.max(0, __num(spec.penetration)),
    ignoreAbsorption = math.max(0, __num(spec.ignoreAbsorption or spec.ignore)),
    ignorePercent = math.max(0, math.min(100, __num(spec.ignorePercent)))
  }
end
function InflictDamage(caster, target, damage, spec)
  if __unit(target) == nil then error('InflictDamage: цель не найдена') end
  local row = __damageSpec(spec, 'none')
  row.kind = 'damage'; row.casterId = __id(caster); row.targetId = __id(target); row.amount = __num(damage)
  return __push(row)
end
function Heal(caster, target, amount)
  if __unit(target) == nil then error('Heal: цель не найдена') end
  return __push({ kind = 'heal', casterId = __id(caster), targetId = __id(target), amount = __num(amount) })
end
function ReduceDamage(amount) return __push({ kind = 'reduce_damage', amount = __num(amount) }) end
function AddDamage(amount, spec)
  local row = __damageSpec(spec, 'all'); row.kind = 'add_damage'; row.amount = __num(amount); return __push(row)
end
function SetDamage(amount) return __push({ kind = 'set_damage', amount = __num(amount) }) end
function AddAttackBonus(amount) return __push({ kind = 'add_attack_bonus', amount = __num(amount) }) end
function AddDefenseBonus(amount) return __push({ kind = 'add_defense_bonus', amount = __num(amount) }) end
function SetArmorPenetration(amount, source) return __push({ kind = 'set_armor_penetration', amount = math.max(0, __num(amount)), absorptionSource = tostring(source or 'all') }) end
function IgnoreAbsorption(amount, source)
  if type(amount) == 'table' then
    return __push({ kind = 'ignore_absorption', amount = math.max(0, __num(amount.amount or amount.flat)), percent = math.max(0, math.min(100, __num(amount.percent))), absorptionSource = tostring(amount.source or amount.absorptionSource or 'all') })
  end
  return __push({ kind = 'ignore_absorption', amount = math.max(0, __num(amount)), percent = 0, absorptionSource = tostring(source or 'all') })
end
function SpendReaction(unit) return __push({ kind = 'spend_reaction', unitId = __id(unit) }) end
function SetCondition(unit, name, enabled) return __push({ kind = 'set_condition', unitId = __id(unit), name = tostring(name or ''), enabled = enabled ~= false }) end
function SetDying(unit, enabled) return SetCondition(unit, 'dying', enabled) end
function SetStabilized(unit, enabled) return SetCondition(unit, 'stabilized', enabled) end
function SetProne(unit, enabled) return SetCondition(unit, 'prone', enabled) end
function SetStunned(unit, enabled) return SetCondition(unit, 'stunned', enabled) end
function SetGrappled(unit, enabled) return SetCondition(unit, 'grappled', enabled) end
function SetUnconscious(unit, enabled) return SetCondition(unit, 'unconscious', enabled) end
function SetHandsBusy(unit, enabled) return SetCondition(unit, 'handsBusy', enabled) end
function SetMovementMode(unit, mode) return __push({ kind = 'set_movement_mode', unitId = __id(unit), mode = tostring(mode or 'ground') }) end
function Reload(unit, slot) return __push({ kind = 'reload', unitId = __id(unit), slot = tostring(slot or 'primaryWeapon') }) end
function SpendCharges(unit, slot, amount) return __push({ kind = 'spend_charges', unitId = __id(unit), slot = tostring(slot or ''), amount = math.max(1, math.floor(__num(amount, 1))) }) end
function UseCharges(unit, slot, amount) return SpendCharges(unit, slot, amount) end
function DamageItem(unit, slot, amount) return __push({ kind = 'damage_item', unitId = __id(unit), slot = tostring(slot or ''), amount = math.max(0, __num(amount, 1)) }) end
function WearItem(unit, slot, amount) return DamageItem(unit, slot, amount) end
function BreakItem(unit, slot) return __push({ kind = 'break_item', unitId = __id(unit), slot = tostring(slot or '') }) end
function StandardAttack(attacker, target, spec)
  spec = type(spec) == 'table' and spec or {}
  return __push({ kind = 'standard_attack', attackerId = __id(attacker), targetId = __id(target), slot = tostring(spec.slot or spec.weaponSlot or ''), weaponId = tostring(spec.weaponId or ''), consumeAction = spec.consumeAction ~= false })
end
function AddCredits(unit, amount, operationId) return __push({ kind = 'add_credits', unitId = __id(unit), amount = math.floor(__num(amount)), operationId = tostring(operationId or '') }) end

MODIFIER_PROPERTY_STRENGTH_BONUS = 'strength'
MODIFIER_PROPERTY_DEXTERITY_BONUS = 'dexterity'
MODIFIER_PROPERTY_ENDURANCE_BONUS = 'endurance'
MODIFIER_PROPERTY_INTELLIGENCE_BONUS = 'intelligence'
MODIFIER_PROPERTY_WILL_BONUS = 'will'
MODIFIER_PROPERTY_GLORY_BONUS = 'glory'
MODIFIER_PROPERTY_MAX_HEALTH_BONUS = 'max_hp'
MODIFIER_PROPERTY_ARMOR_CLASS_BONUS = 'armor_class'
MODIFIER_PROPERTY_DAMAGE_REDUCTION_BONUS = 'defense'
MODIFIER_PROPERTY_INITIATIVE_BONUS = 'initiative_bonus'
MODIFIER_PROPERTY_MOVEMENT_BONUS = 'movement'
MODIFIER_PROPERTY_VISION_BONUS = 'vision'
MODIFIER_PROPERTY_ATTACK_BONUS = 'attack_bonus'
MODIFIER_PROPERTY_DAMAGE_BONUS = 'damage_bonus'

function ModifierEffect(property, value, operation, statRef)
  return { property = tostring(property or ''), value = __num(value), operation = tostring(operation or 'add'), statRef = tostring(statRef or '') }
end
function DeclareFunctions(...) return {...} end
function ApplyModifier(caster, target, spec)
  spec = type(spec) == 'table' and spec or {}
  target = __unit(target)
  if target == nil then error('ApplyModifier: цель не найдена') end
  local effects = {}
  for _, effect in ipairs(spec.effects or spec.functions or {}) do
    if type(effect) == 'table' and tostring(effect.property or effect.target or '') ~= '' then
      effects[#effects + 1] = { property = tostring(effect.property or effect.target), value = __num(effect.value), operation = tostring(effect.operation or effect.op or 'add'), statRef = tostring(effect.statRef or '') }
    end
  end
  if tostring(spec.property or '') ~= '' then effects[#effects + 1] = ModifierEffect(spec.property, spec.value, spec.operation, spec.statRef) end
  return __push({ kind = 'apply_modifier', sourceId = __id(caster), targetId = target:GetId(), modifierId = tostring(spec.id or spec.name or ''), name = tostring(spec.name or spec.id or 'Lua-модификатор'), duration = math.max(1, math.floor(__num(spec.duration, 1))), effects = effects, onTurnStartDamage = math.max(0, __num(spec.onTurnStartDamage)), onTurnStartHeal = math.max(0, __num(spec.onTurnStartHeal)) })
end
function RemoveModifier(target, modifierId)
  target = __unit(target)
  if target == nil then error('RemoveModifier: цель не найдена') end
  return __push({ kind = 'remove_modifier', targetId = target:GetId(), modifierId = tostring(modifierId or '') })
end
function MoveTo(unit, position)
  unit = __unit(unit)
  if unit == nil or type(position) ~= 'table' then error('MoveTo ожидает юнита и Vector(x, y)') end
  return unit:SetAbsOrigin(position)
end
function MoveBetween(caster, attacker, target, distance)
  return __push({ kind = 'move_between', casterId = __id(caster), attackerId = __id(attacker), targetId = __id(target), distance = __num(distance, 1) })
end
local function __linePoint(value)
  local unit = __unit(value)
  if unit then return unit:GetAbsOrigin() end
  if type(value) == 'table' then return Vector(value.x, value.y) end
  return nil
end
local function __lineAllowed(unit, spec, origin)
  if spec.alive ~= false and not unit:IsAlive() then return false end
  if unit:IsPlayer() and spec.players == false then return false end
  if unit:IsNPC() and spec.npcs == false then return false end
  if not unit:IsPlayer() and not unit:IsNPC() and spec.units ~= true then return false end
  for _, ignored in ipairs(spec.ignore or {}) do if unit:GetId() == __id(ignored) then return false end end
  local relation = tostring(spec.relation or 'any')
  if relation == 'ally' and (origin == nil or not origin:IsAlly(unit)) then return false end
  if relation == 'enemy' and (origin == nil or not origin:IsEnemy(unit)) then return false end
  if relation == 'self' and (origin == nil or origin:GetId() ~= unit:GetId()) then return false end
  return true
end
function FindUnitsInLine(startValue, endValue, spec)
  spec = type(spec) == 'table' and spec or {}
  local a, b = __linePoint(startValue), __linePoint(endValue)
  if a == nil or b == nil then error('FindUnitsInLine ожидает начальную и конечную точку или юнита') end
  local dx, dy = b.x - a.x, b.y - a.y
  local lengthSquared = dx * dx + dy * dy
  if lengthSquared <= 0 then return {} end
  local width = math.max(0, __num(spec.width, 0.55))
  local origin = __unit(spec.origin) or __source:GetCaster()
  local found = {}
  for _, unit in ipairs(__unitOrder) do
    if __lineAllowed(unit, spec, origin) then
      local p = unit:GetAbsOrigin()
      local projection = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared
      local inStart = projection > 0
      local inEnd = projection <= 1
      if spec.includeStart == true then inStart = projection >= 0 end
      if spec.includeEnd == false then inEnd = projection < 1 end
      if inStart and inEnd then
        local closestX, closestY = a.x + projection * dx, a.y + projection * dy
        local distance = math.sqrt((p.x - closestX) ^ 2 + (p.y - closestY) ^ 2)
        if distance <= width then found[#found + 1] = { unit = unit, projection = projection, distance = distance } end
      end
    end
  end
  table.sort(found, function(left, right) if left.projection == right.projection then return left.unit:GetId() < right.unit:GetId() end return left.projection < right.projection end)
  local result = {}
  for _, row in ipairs(found) do result[#result + 1] = row.unit end
  return result
end
function FindUnitInLine(startValue, endValue, spec)
  local rows = FindUnitsInLine(startValue, endValue, spec)
  return rows[1]
end
function ShowArea(caster, spec)
  spec = type(spec) == 'table' and spec or {}
  return __push({ kind = 'show_area', casterId = __id(caster), shape = tostring(spec.shape or 'circle'), radius = __num(spec.radius, 1), length = __num(spec.length, spec.radius or 1), width = __num(spec.width, 1), color = tostring(spec.color or '#7df9ff'), centerId = __id(spec.center or caster) })
end
function RequestTargets(spec)
  spec = type(spec) == 'table' and spec or {}
  __requestTargetIndex = (__requestTargetIndex or 0) + 1
  local key = tostring(spec.key or spec.name or ('targets_' .. __requestTargetIndex))
  local supplied = (__input.params or {}).targetRequests or {}
  if type(supplied[key]) == 'table' then
    local result = {}
    for _, id in ipairs(supplied[key]) do local unit = __unit(id); if unit then result[#result + 1] = unit end end
    return result
  end
  __push({ kind = 'request_targets', key = key, originId = __id(spec.origin), radius = __num(spec.radius, 999999), max = math.max(1, math.floor(__num(spec.max, 1))), min = math.max(0, math.floor(__num(spec.min, 1))), relation = tostring(spec.relation or 'any'), players = spec.players ~= false, npcs = spec.npcs ~= false, units = spec.units == true, alive = spec.alive ~= false, includeSelf = spec.includeSelf == true, title = tostring(spec.title or 'Выберите цели') })
  return {}
end
function CreateThinker(caster, spec)
  spec = type(spec) == 'table' and spec or {}
  caster = __unit(caster)
  if caster == nil then error('CreateThinker: создатель не найден') end
  local position = type(spec.position) == 'table' and spec.position or caster:GetAbsOrigin()
  return __push({
    kind = 'create_thinker',
    thinkerId = tostring(spec.id or spec.name or ''),
    name = tostring(spec.name or spec.id or 'Thinker'),
    casterId = caster:GetId(),
    followUnitId = __id(spec.followUnit or spec.follow),
    x = __num(position.x),
    y = __num(position.y),
    radius = math.max(0, __num(spec.radius, 1)),
    durationRounds = math.max(0, math.floor(__num(spec.durationRounds or spec.duration, 1))),
    intervalRounds = math.max(1, math.floor(__num(spec.intervalRounds or spec.interval, 1))),
    relation = tostring(spec.relation or 'any'),
    players = spec.players ~= false,
    npcs = spec.npcs ~= false,
    units = spec.units == true,
    alive = spec.alive ~= false,
    includeSelf = spec.includeSelf == true,
    visibleToPlayers = spec.visibleToPlayers ~= false,
    blockSight = spec.blockSight == true,
    allowVision = spec.allowVision == true,
    color = tostring(spec.color or '#7df9ff')
  })
end
function DestroyThinker(thinkerId)
  return __push({ kind = 'destroy_thinker', thinkerId = tostring(thinkerId or ''), casterId = __id(__source:GetCaster()) })
end
function CreateVisionZone(caster, spec)
  spec = type(spec) == 'table' and spec or {}
  spec.blockSight = spec.blockSight ~= false
  return CreateThinker(caster, spec)
end
function SetVisionThroughZone(thinkerId, allowed)
  return __push({ kind = 'set_thinker_vision', thinkerId = tostring(thinkerId or ''), allowVision = allowed ~= false })
end
function RemoveVisionZone(thinkerId) return DestroyThinker(thinkerId) end
function RequestNumber(name, label, spec)
  spec = type(spec) == 'table' and spec or {}
  local key = tostring(name or spec.key or 'value')
  local inputs = (__input.params or {}).inputs or {}
  if inputs[key] ~= nil then return __num(inputs[key]) end
  __push({ kind = 'request_number', name = key, key = key, label = tostring(label or name or 'Значение'), min = spec.min and __num(spec.min) or nil, max = spec.max and __num(spec.max) or nil, default = spec.default and __num(spec.default) or nil, required = spec.required ~= false })
  return spec.default and __num(spec.default) or 0
end
function RequestRoll(name, label, spec) return RequestNumber(name, label, spec) end
function CreateParticle(effectId, spec)
  spec = type(spec) == 'table' and spec or {}
  return __push({ kind = 'particle', effectId = tostring(effectId or 'pulse'), unitId = __id(spec.unit), x = spec.x and __num(spec.x) or nil, y = spec.y and __num(spec.y) or nil, color = tostring(spec.color or '#7df9ff'), duration = math.max(100, __num(spec.duration, 700)) })
end
function EmitSound(soundId, spec)
  spec = type(spec) == 'table' and spec or {}
  return __push({ kind = 'sound', soundId = tostring(soundId or ''), volume = math.max(0, math.min(1, __num(spec.volume, 1))) })
end
function Log(text) return __push({ kind = 'log', text = tostring(text or '') }) end
print = function(...) local rows = {}; for index = 1, select('#', ...) do rows[#rows + 1] = tostring(select(index, ...)) end; Log(table.concat(rows, ' ')) end

local rawParams = __input.params or {}
local params = {
  event = tostring(rawParams.event or ''),
  attacker = __unit(rawParams.attackerId),
  target = __unit(rawParams.targetId),
  caster = __unit(rawParams.casterId or (__input.source or {}).ownerId),
  targets = {},
  damage = __num(rawParams.damage),
  damageType = tostring(rawParams.damageType or ''),
  attackBonus = __num(rawParams.attackBonus),
  defenseBonus = __num(rawParams.defenseBonus),
  attackRoll = rawParams.attackRoll and __num(rawParams.attackRoll) or nil,
  defenseRoll = rawParams.defenseRoll and __num(rawParams.defenseRoll) or nil,
  hit = rawParams.hit == true,
  critical = rawParams.critical == true,
  position = type(rawParams.position) == 'table' and Vector(rawParams.position.x, rawParams.position.y) or nil,
  point = type(rawParams.position) == 'table' and Vector(rawParams.position.x, rawParams.position.y) or nil,
  toggled = rawParams.toggled == true,
  thinker = rawParams.thinker or nil,
  weapon = rawParams.weapon or {},
  ability = rawParams.ability or {}
}
params.inputs = rawParams.inputs or {}
params.targetRequests = rawParams.targetRequests or {}
if type(params.thinker) == 'table' and type(params.thinker.position) == 'table' then
  params.thinker.position = Vector(params.thinker.position.x, params.thinker.position.y)
end
function params:GetInput(name, fallback)
  local value = self.inputs[tostring(name or '')]
  if value == nil then return fallback end
  return __num(value, fallback or 0)
end
function params:GetTargets(name)
  local result = {}
  for _, id in ipairs(self.targetRequests[tostring(name or '')] or {}) do local value = __unit(id); if value then result[#result + 1] = value end end
  return result
end
for _, id in ipairs(rawParams.targetIds or {}) do local value = __unit(id); if value then params.targets[#params.targets + 1] = value end end
__SCRIPT_SOURCE = __source
__SCRIPT_PARAMS = params
function __resetCommands() __commands = {} end
function __getCommands() return __commands end

-- User scripts have no operating-system, filesystem, module-loader or debugger access.
os = nil
io = nil
debug = nil
package = nil
require = nil
dofile = nil
loadfile = nil
load = nil
collectgarbage = nil
math.random = nil
math.randomseed = nil
`;

async function run(payload = {}) {
  const script = String(payload.script || '');
  const hook = String(payload.hook || '');
  const mode = ['validate', 'check', 'execute', 'metadata'].includes(payload.mode) ? payload.mode : 'execute';
  if (script.length > 80000) throw new Error('Lua-скрипт превышает лимит 80 000 символов');
  if (hook && !SUPPORTED_HOOKS.includes(hook)) throw new Error(`Неподдерживаемый hook: ${hook}`);

  const factory = new LuaFactory();
  const lua = await factory.createEngine();
  try {
    const prelude = PRELUDE.replace('__INPUT_PLACEHOLDER__', toLuaLiteral(payload.input || {}));
    await lua.doString(prelude);
    await lua.doString(script || '-- empty');
    lua.global.set('__hookName', hook);
    lua.global.set('__mode', mode);
    lua.global.set('__supportedHooks', SUPPORTED_HOOKS);
    await lua.doString(String.raw`
      local hookNames = {}
      for _, name in ipairs(__supportedHooks) do
        if type(_G[name]) == 'function' then hookNames[#hookNames + 1] = name end
      end
      local hasHook = __hookName ~= '' and type(_G[__hookName]) == 'function'
      local eligible = hasHook
      local returnValue = nil
      local metadata = {}
      __resetCommands()
      if __mode == 'metadata' then
        local getters = { 'GetBehavior', 'GetCastRange', 'GetAOERadius', 'GetThinkerDuration', 'GetThinkerInterval' }
        for _, getterName in ipairs(getters) do
          if type(_G[getterName]) == 'function' then metadata[getterName] = _G[getterName](__SCRIPT_SOURCE, __SCRIPT_PARAMS) end
        end
      end
      if (__mode == 'check' or __mode == 'execute') and hasHook then
        local canName = 'Can' .. __hookName
        if type(_G[canName]) == 'function' then eligible = _G[canName](__SCRIPT_SOURCE, __SCRIPT_PARAMS) ~= false end
      end
      if __mode == 'execute' and hasHook and eligible then returnValue = _G[__hookName](__SCRIPT_SOURCE, __SCRIPT_PARAMS) end
      __RESULT = { ok = true, hasHook = hasHook, eligible = eligible, hooks = hookNames, commands = __getCommands(), returnValue = returnValue, metadata = metadata }
    `);
    const result = lua.global.get('__RESULT') || { ok: true };
    result.hooks = Array.isArray(result.hooks) ? result.hooks : [];
    result.commands = Array.isArray(result.commands) ? result.commands : [];
    return result;
  } finally {
    lua.global.close();
  }
}

parentPort.on('message', payload => {
  run(payload).then(result => parentPort.postMessage({ ok: true, result })).catch(error => {
    parentPort.postMessage({ ok: false, message: String(error?.message || error), stack: String(error?.stack || '') });
  });
});
