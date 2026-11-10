# Lua-скрипты боевых сцен GRPGI — API v204

## v225 · Команды дронам и дополнительные события

В модификаторах снаряжения и навыков доступен показатель `drone_actions`.
Базовое значение равно нулю. Бонусы имплантов суммируются. Запас восстанавливается
в начале собственного хода оператора, расходы сохраняются при паузе и переносе карты.
Сложная команда сначала расходует один DroneAction. Когда запас исчерпан, команда
расходует собственное Действие оператора. Одно устройство получает одну сложную
команду за ход оператора. При бонусе +2 оператор может направить сложные команды
трём разным дронам, потратив два DroneActions и своё Действие.

`unit:GetDroneActions()`, `unit:DroneActions()` и `DroneActions(unit)` возвращают
остаток запаса. `unit:GetMaxDroneActions()` возвращает текущий максимум.
`unit:IsDroneShareVision()` и `IsDroneShareVision(unit)` проверяют, делится ли
дрон обзором с оператором с учётом доступности устройства и связи.
Разрешение обзора задаётся существующей галочкой «Даёт обзор игрокам».

| Событие | Параметры |
| --- | --- |
| `BeforeRoll`, `AfterRoll` | `params.rollType`, `params.rollingUnit`, после ввода также `params.roll` |
| `OnKnockedDown`, `OnStandUp` | Переход состояния prone. `params.unit`, `params.condition`, `params.enabled`, `params.reason` |
| `OnForcedMove` | Сдвиг Lua или ручное перемещение ДМом. `params.oldPosition`, `params.newPosition`, `params.movementKind` |

Типы бросков включают `attack`, `defense`, `damage`, `initiative`, `instinct`.
Для авторского `RequestRoll(name,label,spec)` тип задаётся через `spec.rollType`
с базовым значением `check`. `spec.unit` задаёт бросающего, по умолчанию используется
владелец скрипта. Обычный `RequestNumber` сохраняет поведение числового ввода.
Во всех случаях физический бросок вводит ДМ. Прежние `BeforeAttackRoll` и
`AfterAttackRoll` продолжают работать.

Переход prone генерирует событие один раз при изменении. Добровольное положение
помечено `params.reason == 'voluntary'`, безоружная натуральная 1 — `fumble`.
Перемещение через `SetAbsOrigin(Vector(...), {kind='forced'})` передаёт вид сдвига.
Существующие `OnConditionChanged`, `OnPositionChanged`, `OnMoveStart/Step/End`
сохраняются. Новые события доступны для `Can...` и реакций по общему механизму.

В боевом режиме туман открывается обзором игрока текущего хода и его дронов,
которые передают обзор. На ходе NPC обзор игроков закрыт. В обычном режиме
используется общий обзор игроков.

При входе редактор получает профили с сервера. Изменения участников сохраняются
в локальном архиве сцены и отправляются в профили при выходе. При ошибке отправки
редактор остаётся открыт для повторного выхода. Локальные черновики профилей
позволяют восстановить незавершённый сеанс после перезапуска. Одновременная внешняя
правка того же боевого поля требует разрешения конфликта, остальные поля объединяются.


Первая версия API позволяет назначать Lua 5.4-скрипты навыкам, оружию, броне, имплантам и другому снаряжению. Код исполняется только в локальной desktop-боевой сцене, которой управляет ДМ. Web-клиент не исполняет боевые скрипты.

## Общий API v204 (2026-11-01)

Этот раздел заменяет прежние ограничения v138–v203 там, где они расходятся. Конкретные навыки, включая «Каннский охват» и «Манёвр Фабия», не добавлены: API предоставляет общие механизмы. Нарративные навыки не требуют Lua. Исполнение по-прежнему находится в настольном клиенте ДМа; кубики остаются физическими.

### Стоимость и область подписки

```lua
function GetCostMode(self) return "scripted" end
function GetEventScope(self) return "scene" end
```

Оба getter должны возвращать статическую строку. `GetCostMode = scripted` отключает автоматический расход Действия при активном применении и Реакции при выборе реактивного навыка. Скрипт сам вызывает `SpendAction`, `SpendReaction`, `SpendMovement` или расход собственного ресурса. Активный навык можно применить после расхода Действия, если его собственная стоимость это допускает. Проверки дееспособности и текущего хода для обычного активного применения сохраняются. Вне своего хода следует использовать реактивный hook, а не кнопку активного применения.

Без getter действует `legacy`: прежнее автоматическое списание. `SpendAction` / `SpendReaction` старого скрипта не добавляют второй расход той же базовой возможности. В режиме `scripted` повторный расход недоступной возможности — ошибка. Расходы указываются в `OnAbilityExecuted` после выбора целей, а не в фазе подготовки.

`GetEventScope = owner` (по умолчанию) слушает события владельца. `scene` позволяет источнику наблюдать события других участников активной карты. В `params.unit` находится участник события, `self:GetCaster()` всегда возвращает владельца источника. Активные источники с явной scripted-стоимостью тоже могут иметь постоянные обработчики. Реактивные источники исполняются только после выбора ДМа. Необходимо фильтровать `Can<Hook>` / условия внутри hook, чтобы наблюдатель не реагировал на собственные последствия бесконечно.

### События

| Этап | Hooks |
| --- | --- |
| Действие через панель сцены | `OnActionDeclared`, `OnActionFinished` (только при применённом результате) |
| Атака | `OnAttackDeclared`, `BeforeAttackRoll`, `AfterAttackRoll`, прежний `BeforeAttackStart`, `OnAttackResolved`, `OnHit` или `OnMiss` |
| Урон и лечение | `BeforeDamage`, `OnDamageApplied`, `OnHealApplied`; прежний `OnTakeDamage` для обычных атак сохранён |
| Перемещение по маршруту | `OnMoveStart`, `OnPositionChanged`, `OnMoveStep` на каждом фактическом шаге, `OnMoveEnd` |
| Области | `OnUnitEnter`, `OnUnitLeave` в подписанных thinkers |
| Состояния и эффекты | `OnConditionChanged`, `OnModifierChanged` при Lua-изменении |
| Время | `OnTurnStart`, `OnTurnEnd`, `OnRoundStart`, `OnRoundEnd`, `OnBattleStart`, `OnSceneStart` |
| Жизнь области | прежние `OnThinkerInterval`, `OnThinkerDestroyed` |

Новые hooks дополняют прежние, не заменяя `BeforeAttackStart`: этот старый hook вызывается **после** ввода броска. Для изменения бонуса перед показом окна используется `BeforeAttackRoll`. Дельты бонусов из Before/AfterAttackRoll учитываются в обычной атаке, атаке по возможности и `StandardAttack`. Объявление гранаты использует прежний поток общего броска урона; hooks отдельного d20 к нему не относятся.

`params` дополнен `eventId`, `parentEventId`, `unit`, `action`, `movementKind`, `oldPosition`, `newPosition`, `hpLost`, `rawDamage`, `absorbed`, `reason`, `scene`. `parentEventId` связывает вложенные события, созданные общим диспетчером. `params.scene` содержит идентификаторы сцены/боя, номер раунда и собственного хода владельца. `OnDamageApplied` получает подтверждённую потерю HP после защиты и определения травмы; HP уже изменены. Лечение HP не лечит травму.

На одном событии ДМ может последовательно применить реакции нескольких участников. После каждой реакции условия остальных вычисляются заново. Один и тот же источник предлагается не больше одного раза на событие. «Отклонить остальные» завершает очередь. Внутри реакции можно запросить дополнительные варианты. Отмена запроса не применяет накопленные команды этого вызова; уже подтверждённые реакции и шаги сохраняются журналом операций.

`CancelEvent(reason)` / `params:Cancel(reason)` допустимы в `OnActionDeclared`, `OnAttackDeclared`, `BeforeAttackRoll`, `AfterAttackRoll`, `BeforeAttackStart`, `BeforeDamage`, `OnMoveStart`. Это прерывание ещё не подтверждённого выполнения; оно не отменяет ранее подтверждённые реакции. После применения урона вместо отмены используются явные команды изменения состояния.

Все `Can<Hook>` являются чистыми проверками: команды изменения боя и окна ДМа в них запрещены. Пространственные запросы разрешены. Вложенность событий/реакций ограничена 12, цепочки интерактивных запросов — 32 проходами, очередь реакций — 64 применениями.

### Типизированный урон

```lua
InflictDamage(self:GetCaster(), params.target, 3, {
  damageType = "electric",
  absorptionSource = "all"
})
```

Допустимы `kinetic`, `energy`, `electric`, `explosive`, `gas`. Категория попадания оружия задаётся отдельно. Существующие `penetration`, `ignoreAbsorption`, `ignorePercent` сохраняются. Отсутствие `damageType` использует контекст атаки/карточки, отсутствие `absorptionSource` сохраняет прежнее `none`. Тип сам по себе не создаёт неподтверждённых правил оглушения, газа, иммунитета или сопротивления. `caster` задаёт источник попадания и Инстинкта. `unit:InflictDamage(target, amount, spec)` использует ту же реализацию.

### Запросы ДМу

```lua
local variant = RequestChoice("variant", {
  title = "Выберите вариант",
  options = {{id="move", label="Переместиться"}, {id="hold", label="Остаться"}}
})
if variant == nil then return end
local point = RequestPoint("destination", {origin=self:GetCaster(), radius=2})
if point == nil then return end
self:GetCaster():SetAbsOrigin(point)
```

- `RequestChoice(key, {title,text,options})` возвращает строковый ID выбранной опции; строка в options также допустима.
- `RequestChecklist(key, {title,text,options,min,max})` возвращает список строковых ID. UI — поиск, чекбоксы справа и постоянные метки выбранного.
- `RequestConfirm(key, {title,text})` возвращает `true` при подтверждении. Отмена закрывает весь текущий вызов без применения его команд.
- `ShowReminder(key, text)` — подтверждаемое напоминание.
- `RequestPoint(key, {origin,radius,title})` возвращает Vector выбранной точки карты. Отмена — Escape/отмена выбора точки.
- Прежние `RequestTargets`, `RequestNumber`, `RequestRoll` сохранены.

Каждый ключ должен быть стабильным и уникальным внутри вызова hook. Пока ответа нет, новые запросы возвращают `nil`; нужно завершить текущий проход через `return`. После ответа hook повторяется с тем же ответом. Промежуточные команды не применяются; только финальный завершённый проход выполняется один раз. Последовательность окон соответствует порядку запросов в коде. Не используйте зависящие от времени ключи. Не расходуйте ресурсы в фазе подготовки: подготовка и применение — два отдельных вызова.

### Ресурсы и сохраняемые данные

```lua
self:DefineResource("charge", {max=2, initial=2, reset="battle"})
if not self:HasResource("charge", 1) then return end
self:SpendResource("charge", 1)
self:SetData("usedAgainst", params.target:GetId())
SpendReaction(self:GetCaster(), {future=true, amount=1})
```

`DefineResource`, `GetResource`, `GetResourceMax`, `HasResource`, `SpendResource`, `RestoreResource` доступны у Unit; глобальные функции изменения принимают Unit первым аргументом. У Source есть `DefineResource/GetResource/HasResource/SpendResource/RestoreResource`: ключ автоматически изолирован по виду и ID источника. У Unit ключ общий для этого участника; необязательный аргумент source задаёт пространство ключей.

`reset`: `turn` — следующий собственный ход, `round` — новый раунд, `battle` — кнопка нового боя, `scene` — новая игровая сцена, `manual` — только явное восстановление. Пауза боя, закрытие окна и переход на другую карту сохраняют ресурсы. Повторный DefineResource не пополняет ресурс; обновляет предел и настройки, ограничивая остаток новым максимумом. `RestoreResource` без amount восстанавливает максимум.

Зарезервированный общий ресурс Unit с ключом `reaction`, например `{max=2,reset="turn"}`, задаёт расширенный пул Реакций. `SpendReaction` и обычный выбор реакции используют этот пул. Будущий долг списывается в начале собственного хода из пула, а при его отсутствии блокирует базовую Реакцию на этот ход. Явный `RestoreReaction` восстанавливает текущую доступность; ещё не наступивший долг не стирает.

`self:GetData(key, fallback)` / `self:SetData(key, value)` сохраняют JSON-совместимые значения у участника и источника. `nil` удаляет ключ. Для thinker используются `params.thinker:GetData/SetData`. Ссылки на Unit в сохраняемых данных преобразуются в ID; восстанавливайте через `GetUnit(id)`. Нет сохранённых Lua-замыканий или Lua-глобальных переменных. Размер одного записываемого значения — до 32 КБ, ключа — до 160 символов. Ресурсы/данные входят в существующее сохранение и JSON боевой сцены.

### Проверки и объекты

Прежние проверки характеристик, навыков, состояний, предметов, слотов, боезапаса, прочности и зарядов сохранены. Добавлены:

| API | Результат |
| --- | --- |
| `GetUnit(id)`, `GetUnits()` | Unit или все участники активной карты |
| `GetObject(id)` | объект из assets карты: GetId/GetName/GetAbsOrigin/DistanceTo |
| `unit:HasItemTag(tag, minimum)`, `HasEquippedTag(tag, slot)` | наличие предметов по тегу; слот необязателен |
| `GetConditions`, `IsShaken`, `IsPanicked`, `CanAct` | состояния; CanAct проверяет дееспособность, отдельно от бюджета/очереди |
| `GetModifiers`, `GetModifier(id)`, `GetModifierStacks(id)`, `GetModifierRemaining(id)` | данные эффектов, стеки, оставшаяся длительность |
| `GetOperator()`, `GetReactionDebt()` | оператор устройства, долг будущих Реакций |
| `DistanceBetween(a,b,{mode="center"})`, `a:DistanceTo(b)` | расстояние в гексах между Unit/объектом/Vector; Unit↔Unit по умолчанию учитывает размер |
| `unit:HasLineOfSight(other)` | прямая видимость с препятствиями |
| `unit:HasLineOfFire(other)` | линия обзора и дальность текущего оружия |
| `unit:CanSee(other)` | линия обзора и личная дальность зрения |
| `unit:CanAttack(other)` | физическая возможность выстрела с текущим оружием/патронами, без расхода; не проверяет собственный ход |
| `unit:CanReach(other)` | путь до точки назначения с препятствиями, без лимита текущего движения; занятая конечная клетка может быть недоступна |
| `unit:IsAdjacent(other)` | расстояние не больше одного гекса |
| `FindUnits({position,shape,radius,width,height,length,rotation,angle})` | юниты, чьи центры лежат внутри фигуры; отношения проверяются через IsAlly/IsEnemy |

Запросы геометрии исполняются renderer и автоматически переигрывают чистый проход Lua до получения ответов. Проверки инвентаря различают общий инвентарь и реально снаряжённые слоты. Повреждение/заряды предмета и базовые расходуемые возможности проецируются внутри текущего прохода. Полный пересчёт производных характеристик после изменения модификаторов, перезарядка с подбором предметов и результаты вложенного StandardAttack читаются в следующем событии, на свежем снимке.

### Thinker, геометрия и перемещение

```lua
CreateThinker(self:GetCaster(), {
  id="watch_area", position=Vector(8,6),
  shape="cone", length=3, angle=60, rotation=90, color="#62b8ff",
  duration={scope="turn", count=2, phase="end", unitId=self:GetCaster()},
  events={"OnUnitEnter", "OnUnitLeave", "OnTurnStart", "OnPositionChanged"},
  data={participants={self:GetCaster():GetId()}},
  visibleToPlayers=true
})
```

Поддерживаются `circle`, `square`, `rectangle`, `cone`, `line`. Размеры — в гексах, позиция — в координатах карты, поворот — в градусах. Для circle задаётся radius; square/rectangle используют width/height; cone — length/angle; line — length/width. Поворот 0 направлен вправо, положительный — по часовой стрелке. Центр круга/прямоугольника — position; для конуса и полосы position — начало. Фигура и цвет одинаковы на карте ДМа и втором экране. `blockSight/allowVision` используют ту же геометрию.

`events` содержит подписки этой области, а не подписки всех остальных областей. `params.unit` — участник события, `params.thinker` — конкретная область с `runtimeId`, `geometry`, `position`, `data`. `params.thinker:GetUnits()` возвращает текущих подходящих участников внутри фигуры с учётом relation/players/npcs/units/alive/includeSelf. Вход/выход проверяется по центру перемещаемого токена; дополнительные условия события задаются скриптом. `visualOnly=true` оставляет визуализацию без триггеров входа/выхода. `params.thinker:Destroy()` удаляет конкретный экземпляр. Старые DestroyThinker(logicalId), followUnit и круговые области работают.

`duration={scope="turn"|"round"|"battle"|"scene"|"manual", count=1, phase="start"|"end", unitId=...}` поддерживается также ApplyModifier. turn отсчитывает указанные границы хода unitId (по умолчанию владелец/цель), round — границы раунда. Счёт начинается с ближайшей подходящей границы, включая конец текущего хода; нужен полный следующий ход — задайте соответствующий count/phase. battle/scene истекают при смене идентификатора, manual не истекает автоматически. Числовая прежняя длительность и durationRounds сохраняют прежний смысл. ApplyModifier дополнен stacks и data; одинаковый ID заменяет эффект, складывание стеков задаётся Lua явно.

`SetAbsOrigin(point, {kind="placement",checkCollision=true})` меняет позицию атомарно, без расхода движения, без проверки собственного хода и без промежуточных клеток. Другие значения kind можно использовать как метки `forced` / `teleport`. Границы карты и размер токена проверяются, collision можно явно отключить. Срабатывают OnPositionChanged и переходы между областями в конечной позиции. Это не обычное добровольное движение.

Обычный маршрут выполняется по шагам. На каждом шаге проверяются препятствия, бюджет, состояние участника и реакции. Вход в область срабатывает и **посреди** маршрута; оглушение, смерть, потеря управления, перенос токена или перекрытие пути останавливают оставшуюся часть. Уже подтверждённые шаги не откатываются при отмене последующего окна.

### Границы этой версии

- Снимок HP нельзя достоверно предсказать до применения защиты и реакций. Чтение GetHealth/IsAlive после собственной отложенной Damage/Heal-команды этого же вызова выдаёт понятную ошибку; подтверждённое значение читается в OnDamageApplied/OnHealApplied. Не строить продолжение на старом HP.
- Ручное изменение HP в панели ДМа не считается новой атакой; его самостоятельная автоматизация не добавлена. Новые события изменения состояний/модификаторов относятся к Lua-командам; автоматическое истечение не дублирует OnModifierChanged.
- Перенос самой следящей области не создаёт синтетические шаги неподвижных участников. Для таких правил используется её подписка на OnPositionChanged и GetUnits/FindUnits.
- Произвольное возобновление Lua с середины функции и асинхронные Lua-coroutine не добавлены. Используется повторяемый вызов с ключами запросов и сохраняемыми данными.
- Инерция транспорта, новые особые правила дронов/имплантов, смешанный тип одного пакета урона, универсальная таблица иммунитетов и автоматизация конкретных навыков не входят в v204.


## Историческая документация v138–v203

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
| `params.damageType` | Тип урона: `explosive`, `kinetic`, `energy`, `electric`, `gas` |
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
| `unit:HasAction()`, `unit:IsActionAvailable()` | Доступно ли обычное действие |
| `unit:GetMovementSpent()` | Уже потраченная дальность движения в текущем ходу |
| `unit:GetMovementRemaining()` | Оставшаяся дальность движения в текущем ходу |
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
| `unit:Heal(amount, source)` | Восстановить HP этого юнита; степень травмы сохраняется |
| `unit:GetInjuryDegree()` | Текущая степень травмы 0–5 |
| `unit:GetCheckPenalty()` | Величина штрафа к проверкам |
| `unit:HasCheckDisadvantage()` | Помеха на проверки от текущей травмы |
| `unit:IsHeavyWeaponRestricted()` | Запрет тяжёлого оружия от текущей травмы |
| `unit:HealInjury(degrees)` | Отдельно уменьшить травму |

Названия для `GetStat`: `strength`, `dexterity`, `endurance`, `intelligence`, `will`, `glory`, а также рассчитанные ключи Stats Engine, например `defense`, `armorClass`, `movement`, `vision`, `max_hp`.

## Травмы и отдельное лечение · v195

`InflictDamage` и стандартные атаки увеличивают отдельную степень травмы на **фактически снятые HP после защиты**, максимум до 5. `Heal` восстанавливает только HP. Например: потеря 4 HP → восстановление 4 HP → потеря 1 HP оставляет травму степени 5. Изменение максимума HP, стабилизация, новый бой/игровая сцена и смена карты её не снимают.

Применяется только текущая степень:

| Степень | Проверки | Скорость | Дополнительное ограничение |
|---|---|---|---|
| 1 | Без штрафа | −1 | — |
| 2 | −1 | −2 | — |
| 3 | −1 | Половина, вверх | Запрещено тяжёлое оружие |
| 4 | −2 | Половина, вниз до целого гекса | Недоступна реакция |
| 5 | −5 и помеха | 1 гекс | Только эффекты этой строки |

Штрафы предыдущих степеней не складываются и не наследуются. Заблокированное другими правилами перемещение не появляется из-за травмы. Дроны/турели используют HP и состояния техники; биологическая травма им автоматически не начисляется.

`unit:GetInjuryDegree()` возвращает 0–5. `unit:GetCheckPenalty()` возвращает суммарную величину действующих общих штрафов (травма и Потрясение); характеристики `GetStrength()` и подобные не изменяются. `unit:HasCheckDisadvantage()` сообщает о помехе, `unit:IsHeavyWeaponRestricted()` — о запрете тяжёлого оружия. `HasReaction()` учитывает доступность реакции по текущей травме отдельно от факта её расхода. Лечение травмы не возвращает уже потраченную реакцию.

Атака, активная защита и физическая инициатива редактора уже включают штраф травмы в показываемый бонус. В произвольном скриптовом запросе проверки автор учитывает `GetCheckPenalty()` явно; числа урона, лечения, расстояния и другие значения автоматически этим штрафом не уменьшаются. Помеха отображается напоминанием. Кубики бросаются и выбираются на столе; редактор принимает один выбранный натуральный d20.

```lua
function OnAbilityExecuted(self, params)
  local medic = self:GetCaster()
  local patient = params.target or medic
  HealInjury(patient, 1)
end
```

`HealInjury(unit, amount)` и `unit:HealInjury(amount)` создают одну команду `heal_injury`. `amount` — положительное целое число степеней; 5 снимает любую текущую травму полностью. Эта команда не восстанавливает HP, действие, движение или потраченную реакцию. Для способности, прямо разрешающей обе процедуры, можно отдельно вызвать `Heal(medic, patient, hp)` и `HealInjury(patient, degrees)`.

Методы читают контекст текущего вызова Lua; команды выполняет renderer по порядку после получения необходимых ответов ДМа. Как и после `Heal`, повторный getter внутри того же Lua-вызова не является чтением уже применённой команды. Начисление травмы от попадания происходит в одном пакете с потерей HP и доступно последующему `OnTakeDamage`. Журнал операций сохраняет этот пакет при подтверждённых реакциях, откатывает неподтверждённые изменения и повторяет запись результата без повторного начисления травмы.

В локальном сохранении используется `traumaV195`. Старые записи переводятся один раз: сохраняется наибольшая записанная степень, а при отсутствии старых записей — степень, которую прежний клиент показывал по недостающему HP. История уже вылеченного урона в старом формате отсутствует и не восстанавливается предположениями. После миграции обычное чтение/render не начисляет и не лечит травму. В профиле игрока сохраняется зеркало эффекта; действующий локальный участник остаётся источником состояния боя.

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
RestoreReaction(unit)
SpendAction(unit)
RestoreAction(unit)
SpendMovement(unit, amount)
RestoreMovement(unit, amount) -- без amount полностью восстанавливает движение
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

`StandardAttack` использует обычное окно ручного броска, дальность, линию видимости, магазин, `OnAttackDeclared`, `BeforeAttackStart`, `OnHit`, `BeforeDamage`, `OnTakeDamage`, поглощение и состояния цели. Вложенность ограничена четырьмя атаками, чтобы ошибочный скрипт не создал бесконечную рекурсию. Натуральная 1 даёт оружию 1 единицу износа (−1 прочность при заданном максимуме), без автоматического отказа; безоружная — падение и потерю доступной реакции. Отказавшее или сломанное оружие не атакует через `StandardAttack`. `consumeAction = false` не расходует обычное действие, но сохраняет расходы патронов и последствия броска; вызывающий навык отдельно оплачивает свою стоимость. Повторная атака отказавшим оружием прерывает неподтверждённую цепочку по правилам журнала v194, а не пропускает отказ. Это уточнение существующей команды, без добавления Lua API.

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

Натуральная `20` атаки автоматически попадает и добавляет `+1` урона. Натуральная `1` атаки автоматически промахивается: оружие получает 1 единицу износа, а оставшаяся скорострельная очередь отменяется. Автоматического отказа нет; при заданной максимальной прочности поломка наступает только при её достижении 0. Если предел не задан, износ сохраняется в `pendingWear197` и вычитается при последующем назначении предела в WC. Для безоружной атаки вместо износа юнит падает и теряет реакцию. Натуральная `1` защиты добавляет атаке `+1` урона; натуральная `20` защиты после брони и защитных реакций делит остаток урона пополам с округлением вниз.

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

### Уточнение очередей и прочности / v197

Обычная скорострельная атака хранит номер следующего выстрела, последнюю оплаченную цель и число смен целей. Штраф номера: 0, −1, −2…; дополнительно −1 за каждую смену цели в этой очереди. А → Б → А: 0, −2, −4. Отмена ввода и недоступная цель не добавляют смену цели и не расходуют патроны. Пауза и перенос того же боя сохраняют историю. Первый произведённый выстрел расходует действие; каждый выстрел отдельно расходует `ammoPerShot`. Натуральная 1 завершает очередь и добавляет износ в том же сохраняемом пакете, что и патроны.

Натуральная 1 использует одну модель износа для обычной атаки, атаки по возможности и существующего `StandardAttack`; параметры Lua не добавлены. Старые сохранённые отказы остаются отдельным состоянием и устраняются прежним действием; это не ремонт нулевой прочности. Безоружная натуральная 1 сохраняет падение и потерю реакции. Естественные атаки фауны не изнашивают вымышленное оружие.

Состояние предмета игрока изменяет актуальный профиль, а не временную нормализованную копию. NPC хранит состояние экземпляра отдельно от WC. Новый бой/сцена, восстановление HP, сохранение и чтение не ремонтируют предметы. Проектирование команд ремонта/уничтожения и нового Lua API отложено до отдельного согласования. Существующий контейнер состояния по-прежнему адресует предмет по ID вида: раздельная прочность двух экземпляров одного ID не вводилась этим пакетом.

### Движение, перегрузка и базовый Рывок / v198

Новых команд или событий Lua нет. Существующие `GetMovementSpent()`, `GetMovementRemaining()` и `GetStat("movement")` получают согласованный расчёт боевой сцены. `movement` — текущая скорость после травмы/перегрузки, остаток движения — запас хода с учётом Рывка минус уже пройденное. `GetStat("carryCapacity")` у игрока/NPC возвращает применённую боевую грузоподъёмность.

Боевая грузоподъёмность: база `5 + 2 × Сила`, с существующими явными модификаторами `carry_capacity`. Сила учитывает обычные модификаторы характеристики. Старое профильное поле `carryBase` не переписывается и не подменяет боевую базу 5. Учтены инвентарь, надетые предметы/импланты без повторного подсчёта и заряженные патроны фактически переносимого оружия; NPC использует инвентарь своего экземпляра. Число занятых ячеек не является весом.

Порядок: модифицированная скорость → текущая степень травмы с её округлением → множитель `max(0,min(1,2−W/C))` → округление скорости вниз до гексов → удвоение запаса Рывком. Уже потраченное движение не обнуляется. При 1,5C остаётся половина скорости, при 2C — 0; Рывок не обходит нулевую скорость. Пример: скорость 6, пройдено 2, Рывок → запас 12, осталось 10. Стоимость смены положения считается от скорости без удвоения Рывком.

Кнопка ДМа «РЫВОК» расходует обычное действие один раз за ход и не даёт бесплатного выстрела. Разрешения навыков атаковать после Рывка и проектирование новых событий/стоимостей будут согласованы отдельно; существующий возврат действия скриптом не превращает второй Рывок в ещё одно удвоение. Устройства не получают новую команду Рывка без оператора. В обычном режиме сохраняется прежнее свободное движение ДМа без бюджета инициативы.

Флаг Рывка и потраченное движение сохраняются при паузе, JSON и переносе того же боя, сбрасываются на границах хода/нового боя/сцены. Эти сбросы не лечат и не пополняют прочность, HP или боезапас. Повтор сохранения использует рассчитанный результат журнала, а не повторное действие.

### Инстинкт самосохранения, Потрясение и Паника / v199

Автоматическая проверка вызывается после фактической потери HP от попадания или взрыва в боевом режиме, когда потеря от одного пакета превышает Волю и пострадавший остаётся выше 0 HP. Сравнение с Волей использует модифицированную характеристику, без вычитания штрафов проверок. После травмы ДМ вводит один натуральный d20: Воля прибавляется, общие штрафы проверок (включая уже начисленную травму и прежнее Потрясение) вычитаются. DC = `10 + фактически потерянные HP`. Помеха остаётся физической подсказкой. Равенство — успех; провал на 5+ или натуральная 1 — Паника, меньший провал — Потрясение. Натуральная 20 не заменяет сравнение итогов отдельным автоматическим успехом.

Обычная атака, атака по возможности, существующий `StandardAttack`, взрывы и существующий внешний `InflictDamage` используют этот путь. Для взрыва сначала рассчитывается урон всех затронутых целей, затем идут отдельные проверки. Обычное редактирование HP, периодический урон и собственная потеря HP от скрипта не создают вымышленного внешнего попадания. Дроны/турели не выполняют биологическую проверку. Потерянные HP и травма определяются до последующего лечения `OnTakeDamage`; исторические старые повреждения при чтении не создают новые проверки.

Потрясение даёт один −1 к атакам/проверкам независимо от числа источников; ограничение добровольного приближения хранится отдельно для каждого источника. Доступная реакция расходуется в момент получения Потрясения: следующий собственный ход восстанавливает её обычным способом, даже если само состояние заканчивается в конце этого хода. Снятие состояния ДМом не возвращает уже потраченную реакцию. Паника в текущей реализации — альтернативный результат с обязательным безопасным манёвром под контролем ДМа; штраф и расход реакции из строки Потрясения ей автоматически не добавляются. Её инструкция требует использовать доступное перемещение для ухода из линии атаки, падения или разумного укрытия, избегая явно самоубийственных действий. Автоматического маршрута и новой стоимости действия не вводилось.

Оба состояния хранят источник и заканчиваются в конце следующего собственного хода. Если получены в свой ход, сохраняются через конец этого хода до конца следующего. Повторный провал от того же источника обновляет длительность и сохраняет более сильный результат. Успешная новая проверка прежнее состояние не лечит. Пауза/JSON/переход карты сохраняют их; обычное лечение HP и новый бой/сцена их не удаляют. Вне боя отсчёт ходов не идёт: ДМ может явно снять состояние кнопкой. Источник отслеживается по участнику, взрыв — по точке на своей карте. При отсутствии источника на другой карте геометрическое ограничение не применяется к координатам старой карты. Редакторские перестановки и императивные Lua-перемещения остаются под контролем ДМа; новые признаки добровольного/принудительного перемещения в API не вводились.

Перед окном d20 в локальном журнале подтверждаются урон, травма и ожидание проверки. «Отложить» сохраняет их и прерывает неподтверждённое продолжение действия; отдельная кнопка завершает проверку без выстрела, гранаты или повторного Lua. До её завершения следующая механическая операция не начинается. Подготовительная карта не позволяет завершать проверку неактивной копии. Ошибка записи результата повторяет запись, а не бросок. После подтверждения Инстинкта ошибка последующего `OnTakeDamage` сохраняет подтверждённый урон и показывает существующее предупреждение о частичном выполнении; произвольное продолжение повреждённого скрипта автоматически не воспроизводится.

Новых команд/событий/параметров Lua нет. Существующий `GetCheckPenalty()` учитывает Потрясение наряду с травмой; произвольный `RequestNumber` показывает напоминание, а автор проверки применяет штраф явно. Числа урона/лечения не уменьшаются автоматически. Новые имена состояний для `SetCondition`/`HasCondition`, способы иммунитетов/снятия/игнорирования, события проверок, ремонт/уничтожение и множественные реакции будут согласованы отдельно до расширения API.


### Базовые команды устройств / v200

Дрон или турель из инвентаря развёртываются Действием оператора в соседний свободный гекс; предмет списывается. Устройства не получают самостоятельной инициативы или собственной Реакции. Турель в этой модели неподвижна и управляется оператором; автономная стрельба не добавлена.

За интервал собственного хода оператора доступна одна простая команда движения бесплатно и одна сложная за Действие, разным устройствам. Сложная разрешает одну активную операцию и движение до или после неё, без разделения движения вокруг операции. Штатная скорострельная очередь — одна операция. Рывок устройства — сложная команда с двойным движением вместо операции. Восстановление Действия не создаёт новую сложную команду. Пауза, JSON и перенос карты сохраняют оплаченные команды; новый такт появляется в следующий собственный ход оператора.

Формула атаки устройства использует Интеллект оператора, явный бонус устройства и общий штраф проверок оператора; бросок физический. Расстояние, препятствия и укрытия считаются от устройства. `StandardAttack` сохраняется как существующая общая команда; сам по себе он не является новым API выдачи команд дрону. Перезарядка через интерфейс сложной команды занимает операцию и расходует совместимые боеприпасы оператора. Императивные Lua-команды движения/ресурсов остаются явными скриптовыми эффектами и не превращаются в обычную маршрутную команду устройства.

Нулевая HP/недееспособность оператора или устройства, заглушение и недоступная связь блокируют штатное управление. Безопасное поведение при потере связи — остановка. Автоматические атаки/возврат не добавлены. Существующая дальность связи — 30 гексов; её проверка полного перекрытия не даёт разрешения стрелять сквозь стену.

Старый `freeDroneControl` и угадывание исключений по именам имплантов больше не применяются. Данные старого поля сохраняются. Новых hooks/методов/команд Lua в v200 нет: правила каналов, цены/числа тактов, Подготовки, сканирования и исключений имплантов будут согласованы отдельно и затем подключены через общий API. Это не завершённая реализация нейроинтерфейса или Shepherd.


### Типы урона / v202

Тип урона `damageType` отделён от категории попадания `weaponCategory`. Поддерживаются `explosive` (взрывной), `kinetic` (кинетический), `energy` (энергетический), `electric` (электрический), `gas` (газ). Категория оружия по-прежнему определяет характеристику попадания и старые условия `incoming_weapon_category`/`weapon_category`; тип урона не заменяет эти категории.

В World Config поле «Тип урона» доступно в карточке снаряжения. Пустое значение означает прежнее поведение: энергетическая категория → `energy`, обычное оружие/устройства → `kinetic`, граната → `explosive`. Явный тип имеет приоритет. У патронов пустое значение наследует оружие, явный тип переопределяет его при выстреле. Тип не читается из описания/названия/тегов. Одна атака имеет один тип; смешанные пакеты этим обновлением не вводятся.

Существующее `params.damageType` передаёт фактический тип объявленной/выполняемой атаки. После реакций объявления учитывается актуальный тип заряженных патронов; тип конкретного выстрела фиксируется до физического броска и не меняется из-за последующей смены карточки/магазина. Следующий выстрел определяет свой тип заново. В `params.weapon.weaponCategory` доступна отдельная категория попадания, в `params.weapon.damageType` — базовый тип карточки оружия. В старом скрипте проверку `params.damageType == "heavy"` следует заменить проверкой `params.weapon.weaponCategory == "heavy"`; сравнение с `"energy"` теперь означает именно энергетический урон.

Обычная атака, атака по возможности, существующий `StandardAttack`, граната и контекст активного снаряжения используют общую классификацию. Энергетический тип применяет уже согласованное исключение обычной физической брони/щита; явная энергозащита и реальное укрытие сохраняются. Кинетический и взрывной сохраняют обычный порядок защиты. Электрический и газ пока только различаются как типы: автоматическое оглушение, ЭМИ, яд, удушье, газовое облако, игнорирование брони, иммунитет машин или особый урон дронам не назначаются без согласованных правил.

Новых Lua-команд, функций, hooks и аргументов команд нет. Существующее `InflictDamage` использует тип текущего контекста/карточки активного источника и сохраняет прежний `absorptionSource` (по умолчанию `none`). Отдельный тип в `spec`, смешанный урон, типовые сопротивления/иммунитеты и условия модификаторов требуют отдельного согласования. Формулы бросков, травмы, Инстинкт и расходы действий/реакций этим набором типов не меняются.


### Категория попадания и базовая характеристика / v203

| `weaponCategory` | Категория | Характеристика |
|---|---|---|
| `light` | Лёгкое оружие | Ловкость (`dexterity`) |
| `heavy` | Тяжёлое оружие | Выносливость (`endurance`) |
| `melee` | Ближний бой, включая безоружную атаку | Сила (`strength`) |
| `drone` | Дроны и управляемые устройства | Интеллект оператора (`intelligence`) |

Настольный Stats Engine и расчёт бонуса в веб-профиле используют одну таблицу. Для обычного оружия расчёт выполняет Stats Engine: базовая характеристика + явный бонус модели + подготовка/модификаторы. Явные `weapon_hit_stat`/`weapon_hit_extra_stat` сохраняют свои замены/добавления; новая база не начисляет характеристику второй раз. Одни правила действуют для игрока и NPC, обычной атаки, существующего `StandardAttack` и атаки по возможности. У дрона/управляемой турели боевые атаки продолжают использовать Интеллект назначенного оператора, бонус устройства и штраф проверок оператора, а не собственный Интеллект токена.

`energy` больше не отдельная категория попадания в World Config. Старая карточка оружия с этой категорией нормализуется в `light`, с сохранением `damageType = "energy"`, если не был явно выбран другой тип урона. Для тяжёлого энергетического оружия ДМ выбирает `heavy` отдельно. Повторная нормализация/JSON не возвращает старую категорию и не теряет тип урона. Уже заданные явно типы урона сохраняются.

Чтобы старые бонусы не исчезли, `scope="weapon_category", scopeValue="energy"` и `condition="incoming_weapon_category", conditionValue="energy"` остаются совместимыми обозначениями проверки энергетического **урона**. Новые категории `light/heavy/melee/drone` проверяют категорию попадания. Это совместимость старых данных, без добавления новых условий или Lua-команд. Старые Lua-сравнения `params.weapon.weaponCategory == "energy"` для энергетического урона следует заменить на `params.damageType == "energy"`; для характеристики попадания проверяется одна из четырёх категорий таблицы.

Новых функций/hooks/команд Lua в v203 нет. Следующий этап — согласование общих Lua-правил стоимости/числа команд дронам, Подготовки и механик навыков/имплантов, затем их реализация; нарративные навыки и «Слава» остаются без боевой автоматизации.

### Экземпляры снаряжения и ручной ремонт / v215

Оружие, броня, рюкзаки, дроны, турели, щиты и предметы с ресурсами сохраняют отдельные экземпляры в `inventory[].instancesV215`. ID шаблона остаётся в `itemId`. Запись экземпляра содержит свой ID, текущую прочность, заряды, редкость и список модификаторов. При загрузке старого профиля прежнее общее состояние переносится на экземпляр в указанном слоте, затем на первую экипированную или первую доступную копию. Редкость берётся из шаблона при создании. Для случайных модификаторов подготовлено поле хранения.

ДМ открывает World Config → персонаж → редактор инвентаря → «Прочность экземпляров», вводит число от 0 до предела шаблона и нажимает «Записать». Ноль оставляет предмет в инвентаре сломанным. Положительное значение восстанавливает его работу. Игрок видит прочность выбранного экземпляра в карточке предмета.

`unit:GetItemInstanceId(slot)` возвращает ID конкретной копии. `DamageItem` и `BreakItem` принимают этот ID или прежний аргумент слота/шаблона. Например:

```lua
local id = defender:GetItemInstanceId("armor")
if id ~= "" then DamageItem(defender, id, 1) end
```

Натуральная 20 в броске атаки противника по персонажу снимает 1 прочность с надетой брони, если у неё задан предел. Износ применяется до проверок попадания и не зависит от результата. При нуле бонусы брони к классу брони, поглощению и защите от энергии исключаются уже в этой атаке. Правила критического попадания остаются в существующем разрешении броска.
