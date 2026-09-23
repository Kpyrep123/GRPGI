# Lua-скрипты боевых сцен GRPGI 1.0.138

Первая версия API позволяет назначать Lua 5.4-скрипты навыкам, оружию, броне, имплантам и другому снаряжению. Код исполняется только в локальной desktop-боевой сцене, которой управляет ДМ. Web-клиент не исполняет боевые скрипты.

## Основные правила

- Все кубики бросаются физически. В Lua отключены `math.random` и `math.randomseed`; приложение не генерирует результаты бросков.
- Если скрипту нужен результат броска, он вызывает `RequestRoll(...)`. ДМ вводит итог в появившемся окне.
- Реакции никогда не применяются самостоятельно. Приложение собирает подходящие реакции и показывает ДМу одно окно выбора. Можно выбрать одну реакцию либо нажать «Отклонить».
- Каждый юнит имеет одну реакцию. Она восстанавливается в начале собственного хода юнита.
- Скрипт хранится внутри записи навыка или предмета и сохраняется обычным механизмом World Config.
- Состояние Lua между вызовами не сохраняется. Каждый hook получает актуальный снимок сцены и возвращает команды приложению.
- Названия функций и регистр важны: `OnHit` и `onhit` — разные имена.

## Безопасность

Lua запускается в отдельном worker-процессе. Один вызов ограничен 750 мс, проверка кода — 1200 мс. При зависании worker завершается, а боевая сцена продолжает работать.

Скрипту недоступны `os`, `io`, `debug`, `package`, `require`, `dofile`, `loadfile`, `load`, `collectgarbage`, файловая система, сеть, DOM, Node.js и Electron. Размер одного скрипта ограничен 80 000 символов, число команд за вызов — 128.

## Настройка в World Config

У предметов и навыков появилась секция «Lua-скрипт боевой сцены»:

1. Включите «Исполнять этот скрипт».
2. Вставьте код.
3. Для предмета выберите режим:
   - `Автоматически` — hook выполняется без вопроса, если его условие истинно;
   - `Реакция — выбор ДМа` — подходящий hook попадает в окно реакций.
   - Для ручного применения включите «Добавить действие в боевую сцену» и задайте название действия. Тогда предмет из инвентаря или экипированного слота вызывает `OnAbilityPhaseStart`, а после выбора целей — `OnAbilityExecuted`.
4. Для навыка режим определяется полем «Применение в бою». Тип `Реакция` всегда требует решения ДМа.
5. Нажмите «Проверить код». Проверка покажет найденные поддерживаемые hooks.
6. Сохраните сущность обычной кнопкой World Config.

Для активного навыка также задаётся `Behavior` — способ выбора точки или цели. Старые навыки используют вариант «Определяется Lua» и продолжают работать через `RequestTargets`.

## Behavior активного навыка

| Значение | Константа Lua | Действие приложения |
|---|---|---|
| `scripted` | `ABILITY_BEHAVIOR_SCRIPTED` | Цели полностью запрашиваются скриптом через `RequestTargets` |
| `no_target` | `ABILITY_BEHAVIOR_NO_TARGET` | Навык выполняется без цели |
| `self` | `ABILITY_BEHAVIOR_SELF` | Единственной целью становится владелец |
| `unit_target` | `ABILITY_BEHAVIOR_UNIT_TARGET` | ДМ выбирает ровно один подходящий юнит в заданной дальности |
| `point` | `ABILITY_BEHAVIOR_POINT` | ДМ выбирает точку на карте |
| `area` | `ABILITY_BEHAVIOR_AREA` | ДМ выбирает точку; все подходящие юниты в радиусе передаются в `params.targets` |
| `aura` | `ABILITY_BEHAVIOR_AURA` | Создаётся thinker, следующий за владельцем |
| `persistent_area` | `ABILITY_BEHAVIOR_PERSISTENT_AREA` | В выбранной точке создаётся неподвижный thinker |
| `toggle_aura` | `ABILITY_BEHAVIOR_TOGGLE_AURA` | Повторное применение включает или удаляет бессрочную ауру |

World Config задаёт дальность применения, радиус, длительность и интервал thinker, отношение к владельцу, допустимые типы целей и видимость области игрокам. Значение `0` у длительности означает, что thinker существует до вызова `DestroyThinker`.

Behavior и основные числовые параметры можно переопределить в самом скрипте:

```lua
function GetBehavior(self)
  return ABILITY_BEHAVIOR_AREA
end

function GetCastRange(self)
  return 6
end

function GetAOERadius(self)
  return 2
end
```

Поддерживаются также `GetThinkerDuration(self)` и `GetThinkerInterval(self)`. Эти функции только возвращают настройки и не должны изменять сцену.

Имплант является типом снаряжения, поэтому использует тот же редактор и API.

Для `BeforeAttackStart` и `OnHit` оружейный скрипт запускается только у оружия, которым выполняется текущая атака. Скрипты второго оружия или выбранной гранаты не примешиваются к выстрелу. Пассивные навыки и прочее экипированное снаряжение при этом остаются доступными источниками эффектов; защитные hooks брони, щита и имплантов работают у цели как обычно.

## Поддерживаемые hooks

| Hook | Когда вызывается | Типичное применение |
|---|---|---|
| `OnAttackDeclared(self, params)` | Враг и оружие уже выбраны, но окно ввода бросков ещё не открыто | Перезарядка реакцией, смена защиты, предупреждение об атаке |
| `BeforeAttackStart(self, params)` | После ручного ввода, но до сравнения итогов атаки и защиты | Разовый бонус попадания, перемещение, подготовка защиты |
| `OnHit(self, params)` | После определения попадания, до итогового урона | Дополнительный урон, эффект оружия |
| `BeforeDamage(self, params)` | Когда известен ожидаемый урон, до снятия HP | Щит, снижение/замена урона, перехват |
| `OnTakeDamage(self, params)` | После снятия HP | Лечение после удара, звук, визуальный эффект |
| `OnAbilityPhaseStart(self, params)` | При нажатии активного навыка | Показать область, запросить цели и ручные значения |
| `OnAbilityExecuted(self, params)` | После выбора целей и ввода значений | Нанести урон, вылечить или переместить выбранные цели |
| `GetBehavior(self)` | Перед выбором цели активного навыка | Переопределить Behavior из Lua |
| `GetCastRange(self)` | Перед выбором цели активного навыка | Переопределить дальность применения |
| `GetAOERadius(self)` | Перед выбором цели активного навыка | Переопределить радиус области или ауры |
| `GetThinkerDuration(self)` | Перед созданием thinker | Переопределить длительность в раундах |
| `GetThinkerInterval(self)` | Перед созданием thinker | Переопределить интервал между вызовами |
| `OnThinkerInterval(self, params)` | В начале подходящего раунда существования thinker | Применить периодический эффект к актуальным целям области |
| `OnThinkerDestroyed(self, params)` | При естественном завершении срока thinker | Выполнить завершающий эффект |
| `OnTurnStart(self, params)` | В начале собственного хода | Эффект начала хода |
| `OnTurnEnd(self, params)` | Перед переходом к следующему юниту | Эффект конца хода |

Для любого hook можно объявить условие с именем `Can` + имя hook:

```lua
function CanBeforeDamage(self, params)
  return params.target ~= nil and params.damage > 0
end

function BeforeDamage(self, params)
  ReduceDamage(2)
end
```

Если `CanBeforeDamage` возвращает `false`, реакция не появляется в списке. Для автоматического предмета сам `BeforeDamage` также не выполняется.

## Аргументы hook

### `self` — навык или предмет

| Метод | Результат |
|---|---|
| `self:GetId()` | ID предмета или навыка |
| `self:GetName()` | Название |
| `self:GetKind()` | `skill`, `equipment` или `implant` |
| `self:GetCaster()` | Юнит-владелец |
| `self:GetOwner()` | То же, что `GetCaster()` |
| `self:HasTag("tag")` | Есть ли у сущности точный тег |

### `params` — контекст события

| Поле/метод | Содержимое |
|---|---|
| `params.attacker` | Атакующий юнит или `nil` |
| `params.target` | Основная цель или `nil` |
| `params.targets` | Массив выбранных целей |
| `params.position`, `params.point` | Выбранная точка как `Vector(x, y)` или `nil` |
| `params.thinker` | Данные текущего thinker или `nil` |
| `params.toggled` | `true` при включении переключаемой ауры, `false` при выключении |
| `params.caster` | Владелец исполняемого скрипта |
| `params.damage` | Ожидаемый урон текущей транзакции |
| `params.damageType` | Категория/тип урона |
| `params.hit` | Было ли попадание |
| `params.critical` | Натуральная 20 в стандартной атаке |
| `params.attackRoll` | Введённый результат d20 атаки |
| `params.defenseRoll` | Введённый результат d20 защиты |
| `params.weapon` | Краткие данные оружия/предмета |
| `params.ability` | Краткие данные активного навыка |
| `params:GetInput("name", fallback)` | Значение, которое ДМ ввёл по `RequestRoll`/`RequestNumber` |
| `params:GetTargets("key")` | Цели, выбранные для именованного `RequestTargets` |

## API юнита

| Метод | Описание |
|---|---|
| `unit:GetId()`, `unit:GetName()` | ID и имя |
| `unit:IsPlayer()` | Юнит является персонажем игрока |
| `unit:IsNPC()` | Юнит является NPC |
| `unit:IsAlive()` | Текущее HP больше 0 |
| `unit:GetHealth()`, `unit:GetMaxHealth()` | Текущее и максимальное HP |
| `unit:GetStrength()` | Сила |
| `unit:GetDexterity()` | Ловкость |
| `unit:GetEndurance()` | Выносливость |
| `unit:GetIntelligence()` | Интеллект |
| `unit:GetWill()` | Воля |
| `unit:GetGlory()` | Слава |
| `unit:GetDefense()` | Снижение урона из Stats Engine |
| `unit:GetArmorClass()` | Класс брони из Stats Engine |
| `unit:GetBaseArmorClass()` | КБ без отдельного бонуса физического щита |
| `unit:GetShieldArmorClass()` | Только бонус КБ физического щита |
| `unit:GetAbsorption(source)` | Поглощение из источника `all`, `base`, `armor`, `shield` или `cover` |
| `unit:GetArmorAbsorption()`, `unit:GetShieldAbsorption()` | Отдельное поглощение брони и щита |
| `unit:GetStat("name")` | Любая характеристика по внутреннему имени |
| `unit:HasAbility("skill_id")` | Изучен ли навык; `HasSkill` — синоним |
| `unit:IsTrained("skill_id")` | Есть ли отдельная отметка обучения/уровень подготовки |
| `unit:GetInventory()` | Записи инвентаря: `itemId`, `name`, `type`, `qty`, `tags` |
| `unit:GetItemCount("item_id")` | Количество конкретного предмета в инвентаре |
| `unit:HasItem("item_id", minimum)` | Есть ли в инвентаре хотя бы указанное количество |
| `unit:HasItemType("grenade", minimum)` | Есть ли предметы указанного типа |
| `unit:GetEquippedItems()` | Экипированные записи с полем `slot` |
| `unit:HasEquippedItem("item_id")` | Экипирован ли конкретный предмет; синоним `IsItemEquipped` |
| `unit:HasEquippedType("armor")` | Экипирован ли предмет типа; синоним `IsItemTypeEquipped` |
| `unit:GetEquippedItem("primaryWeapon")` | ID предмета в указанном слоте или `nil` |
| `unit:HasReaction()`, `unit:IsReactionAvailable()` | Не потрачена ли реакция в текущем раунде |
| `unit:GetAmmo(slot)`, `unit:GetMagazineSize(slot)`, `unit:GetAmmoType(slot)` | Состояние магазина оружия |
| `unit:IsWeaponEmpty(slot)` | У оружия есть магазин и в нём 0 патронов |
| `unit:GetDurability(slot)`, `unit:GetMaxDurability(slot)` | Текущая и максимальная прочность предмета |
| `unit:IsItemBroken(slot)`, `unit:IsShieldDestroyed(slot)` | Сломан ли предмет/щит; 0 прочности считается поломкой автоматически |
| `unit:GetCharges(slot)`, `unit:GetMaxCharges(slot)`, `unit:HasCharges(slot, n)` | Заряды экипированного предмета или предмета по ID |
| `unit:HasCondition(name)` | Системное состояние по имени |
| `unit:IsDying()`, `unit:IsStabilized()`, `unit:IsProne()` | Умирает, стабилизирован, лежит |
| `unit:IsStunned()`, `unit:IsGrappled()`, `unit:IsUnconscious()` | Оглушён, захвачен, без сознания |
| `unit:AreHandsBusy()` | Наложено состояние занятых рук |
| `unit:GetMovementMode()` | `ground`, `flight`, `swim` или `climb` |
| `unit:IsFlying()`, `unit:IsSwimming()`, `unit:IsClimbing()` | Проверки специального режима движения |
| `unit:DistanceTo(other)` | Расстояние до другого юнита в гексах |
| `unit:IsAlly(other)`, `unit:IsEnemy(other)` | Проверка стороны |
| `unit:GetAbsOrigin()` | Позиция как `Vector(x, y)` |
| `unit:SetAbsOrigin(position)` | Запланировать перемещение к позиции |
| `unit:InflictDamage(target, amount)` | Синоним `InflictDamage(unit, target, amount)` |
| `unit:Heal(amount, source)` | Вылечить этот юнит |

Названия для `GetStat`: `strength`, `dexterity`, `endurance`, `intelligence`, `will`, `glory`, а также рассчитанные ключи Stats Engine, например `defense`, `armorClass`, `movement`, `vision`, `max_hp`.

## Команды изменения боя

```lua
InflictDamage(caster, target, amount)
Heal(caster, target, amount)
ReduceDamage(amount)
AddDamage(amount, spec)
SetDamage(amount)
SetArmorPenetration(amount, source)
IgnoreAbsorption(amountOrSpec, source)
SpendReaction(unit)
Reload(unit, slot)
StandardAttack(attacker, target, spec)
SetCondition(unit, name, enabled)
SetDying(unit, enabled)
SetStabilized(unit, enabled)
SetProne(unit, enabled)
SetStunned(unit, enabled)
SetGrappled(unit, enabled)
SetUnconscious(unit, enabled)
SetHandsBusy(unit, enabled)
SetMovementMode(unit, mode)
SpendCharges(unit, slotOrItemId, amount)
DamageItem(unit, slotOrItemId, amount)
BreakItem(unit, slotOrItemId)
AddCredits(unit, amount, operationId)
MoveTo(unit, Vector(x, y))
MoveBetween(caster, attacker, target, distanceInHexes)
FindUnitInLine(startUnitOrVector, endUnitOrVector, spec)
FindUnitsInLine(startUnitOrVector, endUnitOrVector, spec)
CreateThinker(caster, spec)
DestroyThinker(thinkerId)
Log("Текст для журнала")
```

`ReduceDamage`, `AddDamage` и `SetDamage` изменяют ожидаемый урон текущей транзакции. Для защиты их следует вызывать в `BeforeDamage`. `InflictDamage` и `Heal` создают отдельное изменение HP немедленно. Команды из одного вызова Lua применяются по порядку.

У NPC отдельного инвентаря может не быть. В этом случае `HasItem`, `GetItemCount` и `HasItemType` проверяют его экипировку/loadout; один элемент loadout считается одним предметом. Для игрока эти методы по-прежнему используют настоящий инвентарь и не удваивают экипированный экземпляр.

### Поглощение, броня и щит

Класс брони используется только при проверке попадания. Поглощение уменьшает уже определённый урон. Источники поглощения считаются отдельно: `base`, `armor`, `shield`, `cover`. Значение `all` означает их сумму.

```lua
function OnHit(self, params)
  -- Дополнительный урон проверяется только против поглощения щита,
  -- игнорирует 50% оставшегося значения и пробивает ещё 1 пункт.
  AddDamage(4, {
    absorptionSource = "shield",
    penetration = 1,
    ignorePercent = 50
  })
end

function BeforeDamage(self, params)
  -- Следующий итоговый урон частично игнорирует броню.
  SetArmorPenetration(2, "armor")
  IgnoreAbsorption({ source = "armor", flat = 1, percent = 25 })
end
```

Для отдельного урона используется тот же `spec`:

```lua
InflictDamage(caster, target, 8, {
  absorptionSource = "armor",
  penetration = 3
})
```

Без `spec` команда `InflictDamage` сохраняет прежнее поведение и снимает HP напрямую, не применяя поглощение. Чтобы явно обойти поглощение в новом коде, можно также указать `absorptionSource = "none"`.

Если щит получает `DamageItem` и его прочность падает до нуля, он сразу считается сломанным. Последующий расчёт той же атаки повторно читает защиту цели, поэтому КБ и поглощение разрушенного щита больше не применяются.

### Реакция на объявление атаки и перезарядка

`OnAttackDeclared` выполняется до окна физических бросков. Это единственный hook, предназначенный для реакции «враг объявил атаку». `Reload` не генерирует боеприпасы игроку: патроны списываются из совместимого запаса. NPC без инвентаря перезаряжает оружие из своего абстрактного loadout.

```lua
function CanOnAttackDeclared(self, params)
  local owner = self:GetCaster()
  return owner:HasReaction()
    and params.attacker ~= nil
    and owner:IsEnemy(params.attacker)
    and owner:IsWeaponEmpty("primaryWeapon")
end

function OnAttackDeclared(self, params)
  local owner = self:GetCaster()
  Reload(owner, "primaryWeapon")
  SpendReaction(owner)
  Log(owner:GetName() .. " перезаряжает оружие реакцией")
end
```

Выбранная через системное окно реакция расходуется автоматически после успешного выполнения. `SpendReaction` нужен для скриптов, которые запускаются не как системная реакция, но тоже должны потратить её.

### Стандартная атака из Lua

`StandardAttack` использует обычное окно ручного броска, дальность, линию видимости, магазин, `OnAttackDeclared`, `BeforeAttackStart`, `OnHit`, `BeforeDamage`, `OnTakeDamage`, поглощение и состояния цели. Вложенность ограничена четырьмя атаками, чтобы ошибочный скрипт не создал бесконечную рекурсию.

```lua
function OnAbilityExecuted(self, params)
  local caster = self:GetCaster()
  local target = params.target
  if target == nil then return end

  StandardAttack(caster, target, { slot = "primaryWeapon", consumeAction = false })
  StandardAttack(caster, target, { slot = "primaryWeapon", consumeAction = false })
end
```

Если хотя бы одна атака должна расходовать обычное действие, передайте `consumeAction = true`.

### Состояния, режим движения, прочность и заряды

Поддерживаемые системные имена для `SetCondition`: `dying`, `stabilized`, `prone`, `stunned`, `grappled`, `unconscious`, `handsBusy`. При снижении HP до нуля автоматически включаются `dying`, `unconscious` и `prone`; лечение выше нуля снимает `dying` и `unconscious`. Оглушённый, умирающий или бессознательный юнит не может выполнять обычные боевые действия.

Максимальная прочность и число зарядов задаются у предмета в World Config. Значение `0` отключает соответствующую механику. Текущее состояние хранится у персонажа и попадает в синхронизацию боевого профиля.

```lua
if defender:GetDurability("secondaryWeapon") > 0 then
  DamageItem(defender, "secondaryWeapon", 1)
end

if medic:HasCharges("medkit", 1) then
  SpendCharges(medic, "medkit", 1)
end

if runner:GetMovementMode() == "ground" then
  -- бонус Бега не применяется при полёте, плавании или лазании
end
```

`AddCredits` разрешён только для персонажа игрока. Локально и на PocketBase операция идемпотентна; для повторяемого сценария передавайте устойчивый `operationId`, не меняя сумму.

## Thinker, ауры и постоянные области

Thinker — сохранённый в runtime сцены источник периодического эффекта. Он имеет позицию, радиус, срок и интервал. Thinker не является юнитом, не входит в инициативу и не блокирует движение.

Для `aura`, `persistent_area` и `toggle_aura` приложение создаёт thinker автоматически. `OnAbilityExecuted` выполняет начальный эффект, а `OnThinkerInterval` — последующие эффекты. Список `params.targets` при каждом интервале вычисляется заново по актуальным позициям юнитов.

```lua
function GetBehavior(self)
  return ABILITY_BEHAVIOR_AURA
end

function GetAOERadius(self)
  return 2
end

function GetThinkerDuration(self)
  return 3
end

local function HealAura(self, params)
  for _, target in ipairs(params.targets) do
    target:Heal(1, self:GetCaster())
  end
end

function OnAbilityExecuted(self, params)
  HealAura(self, params)
end

function OnThinkerInterval(self, params)
  HealAura(self, params)
end
```

Thinker можно создать из любого исполняемого hook вручную:

```lua
CreateThinker(self:GetCaster(), {
  id = "toxic_cloud",
  name = "Токсичное облако",
  position = params.position,
  radius = 2,
  durationRounds = 4,
  intervalRounds = 1,
  relation = "enemy",
  players = true,
  npcs = true,
  units = false,
  alive = true,
  includeSelf = false,
  visibleToPlayers = true,
  color = "#78ff8c"
})
```

`followUnit = self:GetCaster()` превращает ручной thinker в движущуюся ауру. Явный `id` обновляет существующий thinker с тем же ID и владельцем. `DestroyThinker("toxic_cloud")` удаляет его немедленно. `OnThinkerDestroyed` вызывается при естественном окончании срока; прямое удаление не вызывает этот hook.

Для дыма и других областей, закрывающих обзор, используйте `CreateVisionZone`. Это thinker с включённым `blockSight`:

```lua
CreateVisionZone(self:GetCaster(), {
  id = "smoke_grenade",
  name = "Дым",
  position = params.position,
  radius = 3,
  durationRounds = 3,
  visibleToPlayers = true,
  color = "#aeb8bd"
})

SetVisionThroughZone("smoke_grenade", true)  -- разрешить обзор
SetVisionThroughZone("smoke_grenade", false) -- снова закрыть обзор
RemoveVisionZone("smoke_grenade")            -- удалить область
```

## Цели, области и ручной ввод

`OnAbilityPhaseStart` может показать область и запросить только подходящие цели:

```lua
function OnAbilityPhaseStart(self, params)
  local caster = self:GetCaster()

  ShowArea(caster, {
    shape = "circle", -- circle, cone или measure
    radius = 3,
    color = "#7df9ff"
  })

  RequestTargets({
    key = "pulse_targets",
    title = "Цели импульса",
    origin = caster,
    radius = 3,
    min = 1,
    max = 4,
    relation = "enemy", -- any, ally, enemy или self
    players = true,
    npcs = true,
    alive = true,
    includeSelf = false
  })

  RequestRoll("damage", "Итог броска урона", {
    min = 0,
    required = true
  })
end
```

В окно выбора не попадают юниты за пределами радиуса, неподходящая сторона или запрещённый тип. После выбора вызывается `OnAbilityExecuted`:

```lua
function OnAbilityExecuted(self, params)
  local caster = self:GetCaster()
  local rolledDamage = params:GetInput("damage", 0)

  for _, target in ipairs(params.targets) do
    if target:IsNPC() then
      InflictDamage(caster, target, rolledDamage + caster:GetIntelligence())
    end
  end
end
```

`RequestNumber` работает так же, как `RequestRoll`, но лучше передаёт смысл значения, не связанного с кубиком.

`RequestTargets` и `RequestRoll` можно вызывать непосредственно внутри `OnHit`, `BeforeDamage` и других исполняемых hooks. Приложение сначала собирает запросы, показывает окна ДМу, затем безопасно повторяет тот же hook с готовыми ответами. Команды первого прохода не применяются, поэтому урон, заряды и эффекты не дублируются.

У каждого интерактивного запроса должен быть устойчивый ключ. Для целей это `key` в `RequestTargets`; для числа — первый аргумент `RequestRoll`/`RequestNumber`. На повторном проходе функции сразу возвращают выбранные юниты или число:

```lua
function OnHit(self, params)
  local targets = RequestTargets({
    key = "shield_combo_target",
    origin = params.attacker,
    relation = "enemy",
    min = 1,
    max = 1
  })
  local roll = RequestRoll("shield_combo_roll", "Бросок комбо", { min = 1, max = 20 })

  if #targets == 1 and roll >= 12 then
    SetStunned(targets[1], true)
  end
end
```

## Поиск юнита на линии

`FindUnitInLine` возвращает ближайшего к началу подходящего юнита или `nil`. `FindUnitsInLine` возвращает все совпадения по порядку. Началом и концом могут быть юниты либо `Vector`.

```lua
local hit = FindUnitInLine(self:GetCaster(), params.point, {
  width = 0.55,
  origin = self:GetCaster(),
  relation = "enemy",
  players = true,
  npcs = true,
  units = true,
  alive = true,
  includeStart = false,
  includeEnd = true,
  ignore = { self:GetCaster() }
})

if hit then
  InflictDamage(self:GetCaster(), hit, 2)
end
```

## Частицы и звук

```lua
CreateParticle("shield", {
  unit = params.target,
  color = "#78d7ff",
  duration = 800
})

EmitSound("sound_id_from_combat_library", {
  volume = 0.8
})
```

Встроенные стили частиц первой версии: `pulse`, `impact`, `heal`, `shield`. Неизвестный ID показывается как универсальное цветное кольцо. `EmitSound` принимает ID звука из локальной аудиобиблиотеки боевых сцен.

## Векторы

```lua
local caster = self:GetCaster()
local targetPosition = params.target:GetAbsOrigin()
local attackerPosition = params.attacker:GetAbsOrigin()
local direction = (attackerPosition - targetPosition):Normalized()

caster:SetAbsOrigin(targetPosition + direction * 1)
```

Доступны `Vector(x, y)`, сложение, вычитание, умножение на число, `vector:Length2D()` и `vector:Normalized()`. Для обычного перехвата безопаснее использовать `MoveBetween`, поскольку приложение само привязывает результат к ближайшему гексу.

## Пример реакции щита

Предмету или импланту задайте режим «Реакция — выбор ДМа»:

```lua
function CanBeforeDamage(self, params)
  local caster = self:GetCaster()

  return params.attacker ~= nil
    and params.target ~= nil
    and params.target:IsAlly(caster)
    and caster:DistanceTo(params.target) <= 2
    and params.damage > 0
end

function BeforeDamage(self, params)
  local caster = self:GetCaster()

  MoveBetween(caster, params.attacker, params.target, 1)
  ReduceDamage(2)
  CreateParticle("shield", { unit = params.target })
  EmitSound("shield")
end
```

Когда условие выполнено, ДМ увидит владельца, атакующего, цель, ожидаемый урон и название реакции. До подтверждения никакая команда не применяется.

## Один навык улучшает другой

```lua
function OnAbilityExecuted(self, params)
  local caster = self:GetCaster()
  local damage = caster:GetDexterity()

  if caster:HasAbility("sample") then
    damage = damage + caster:GetIntelligence()
  end

  for _, target in ipairs(params.targets) do
    InflictDamage(caster, target, damage)
  end
end
```

## Урон из произвольной формулы

```lua
function OnHit(self, params)
  local caster = self:GetCaster()
  local target = params.target
  local damage = math.max(0, caster:GetHealth() - target:GetHealth())

  InflictDamage(caster, target, damage)
end
```

Lua выполняет обычную арифметику. Дробные итоговые изменения HP округляются приложением до целого, отрицательный урон ограничивается нулём.

## Порядок стандартной атаки

1. ДМ выбирает атакующего, оружие и цель.
2. Приложение проверяет дальность, линию огня и магазин.
3. Вызывается `OnAttackDeclared`; подходящую реакцию можно выбрать до любого броска. После неё магазин проверяется повторно.
4. ДМ вводит результаты физических бросков атаки, защиты и урона.
5. Списывается стоимость выстрела из магазина, затем вызывается `BeforeAttackStart`; здесь можно изменить бонус именно этой атаки.
6. Приложение сравнивает введённые d20 с бонусами активной защиты и рассчитывает сырой урон до поглощения.
7. При попадании вызывается `OnHit`, включая интерактивные запросы целей и бросков.
8. Вызывается `BeforeDamage`; здесь ДМ может выбрать одну доступную реакцию и изменить ожидаемый урон.
9. Защита цели читается повторно, отдельно применяются поглощение базы, брони, щита и укрытия с учётом пробития. Затем снимается итоговое HP.
10. Вызывается `OnTakeDamage`.
11. Новый HP, магазин, прочность, заряды и журнал сохраняются в локальной сцене; изменённый профиль отправляется в облако отдельным контрольным сохранением.

Натуральная `20` атаки автоматически попадает и добавляет `+1` урона. Натуральная `1` атаки автоматически промахивается: оружие получает отказ, а оставшаяся скорострельная очередь отменяется. Для безоружной атаки вместо отказа юнит падает и теряет реакцию. Натуральная `1` защиты добавляет атаке `+1` урона; натуральная `20` защиты после брони и защитных реакций делит остаток урона пополам с округлением вниз.

## Разовые и временные модификаторы 1.0.122

Для изменения только текущей атаки используйте команды внутри `BeforeAttackStart`:

```lua
function BeforeAttackStart(self, params)
  if params.caster:HasAbility("steady_aim") then
    AddAttackBonus(2)
  end
end
```

`AddAttackBonus(value)` меняет бонус текущей атаки, `AddDefenseBonus(value)` — текущую активную защиту. Эти команды не остаются на следующих атаках.

Для эффекта на несколько собственных ходов цели используется `ApplyModifier`:

```lua
function OnAbilityExecuted(self, params)
  local caster = self:GetCaster()
  local target = params.targets[1]

  ApplyModifier(caster, target, {
    id = "agility_boost",
    name = "Усиленная ловкость",
    duration = 2,
    effects = DeclareFunctions(
      ModifierEffect(MODIFIER_PROPERTY_DEXTERITY_BONUS, 2)
    )
  })
end
```

Продолжительность уменьшается в конце собственного хода носителя. Повторное наложение того же `id` обновляет эффект и срок, а не создаёт дубликат. `unit:HasModifier("agility_boost")` проверяет наличие; `RemoveModifier(unit, "agility_boost")` снимает его.

Доступные свойства:

| Константа | Показатель |
|---|---|
| `MODIFIER_PROPERTY_STRENGTH_BONUS` | Сила |
| `MODIFIER_PROPERTY_DEXTERITY_BONUS` | Ловкость |
| `MODIFIER_PROPERTY_ENDURANCE_BONUS` | Выносливость |
| `MODIFIER_PROPERTY_INTELLIGENCE_BONUS` | Интеллект |
| `MODIFIER_PROPERTY_WILL_BONUS` | Воля |
| `MODIFIER_PROPERTY_GLORY_BONUS` | Слава |
| `MODIFIER_PROPERTY_MAX_HEALTH_BONUS` | Максимальное HP |
| `MODIFIER_PROPERTY_ARMOR_CLASS_BONUS` | Бонус активной защиты |
| `MODIFIER_PROPERTY_DAMAGE_REDUCTION_BONUS` | Снижение урона |
| `MODIFIER_PROPERTY_INITIATIVE_BONUS` | Инициатива |
| `MODIFIER_PROPERTY_MOVEMENT_BONUS` | Движение |
| `MODIFIER_PROPERTY_VISION_BONUS` | Обзор |
| `MODIFIER_PROPERTY_ATTACK_BONUS` | Попадание |
| `MODIFIER_PROPERTY_DAMAGE_BONUS` | Урон |

Пример горения на три хода:

```lua
ApplyModifier(self:GetCaster(), params.target, {
  id = "burning",
  name = "Горение",
  duration = 3,
  onTurnStartDamage = 2
})
```

Аналогично `onTurnStartHeal` выполняет периодическое лечение. Периодические изменения HP происходят в начале хода, записываются в журнал и немедленно сохраняются вместе со сценой.

Для гранаты ДМ один раз вводит урон, после чего шаги защиты и реакций выполняются отдельно для каждой цели в области. Это позволяет одной цели использовать щит, другой — свою реакцию, а третьей получить полный урон.

Боевой результат не откатывается из-за временной недоступности PocketBase. Сцена сохраняется локально немедленно, а неудачная отправка профиля повторяется при следующем боевом контрольном сохранении.

## Диагностика

- `Код корректен, но поддерживаемые hooks не найдены` означает, что синтаксис Lua верен, но имена функций не входят в список этой версии.
- `Lua-скрипт остановлен: превышен лимит` обычно означает бесконечный цикл или слишком тяжёлое вычисление.
- Ошибка с названием сущности в начале, например `Плазменный щит: ...`, показывает, в каком предмете или навыке возникла проблема.
- Для отладки используйте `Log(...)`; текст появится в журнале боевой сцены.
