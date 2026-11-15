window.GRPGAberrationCatalog = [
  {
    "id": "weapon-1",
    "category": "weapon",
    "name": "Попадание",
    "scope": "Любое",
    "rule": "Каждый бросок атаки",
    "variants": [
      {
        "id": "weapon-1-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "weapon-1-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "weapon-1-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "weapon-1-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "weapon-1-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "weapon-1-6",
        "value": "+3",
        "cost": 7
      }
    ]
  },
  {
    "id": "weapon-2",
    "category": "weapon",
    "name": "Базовый урон",
    "scope": "Любое",
    "rule": "На первой попытке атаки за действие. Для очереди влияет только на первый выстрел. При промахе на следующий выстрел не переносится",
    "variants": [
      {
        "id": "weapon-2-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "weapon-2-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "weapon-2-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "weapon-2-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "weapon-2-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "weapon-2-6",
        "value": "+3",
        "cost": 7
      }
    ]
  },
  {
    "id": "weapon-3",
    "category": "weapon",
    "name": "Диапазон крита",
    "scope": "Любое",
    "rule": "Проверяется на первой попытке атаки за действие и только при попадании. Порог суперкрита сохраняется",
    "variants": [
      {
        "id": "weapon-3-1",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "weapon-3-2",
        "value": "+1",
        "cost": 2
      },
      {
        "id": "weapon-3-3",
        "value": "+2 грани d20",
        "cost": 6
      }
    ]
  },
  {
    "id": "weapon-4",
    "category": "weapon",
    "name": "Критический урон",
    "scope": "Любое",
    "rule": "Первый крит или суперкрит за действие. Штраф уменьшает критическую прибавку до 0",
    "variants": [
      {
        "id": "weapon-4-1",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "weapon-4-2",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "weapon-4-3",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "weapon-4-4",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "weapon-4-5",
        "value": "+3",
        "cost": 7
      }
    ]
  },
  {
    "id": "weapon-5",
    "category": "weapon",
    "name": "Кость дополнительного урона",
    "scope": "Любое",
    "rule": "Первое попадание за действие. Кость бросается один раз, включая крит и суперкрит",
    "variants": [
      {
        "id": "weapon-5-1",
        "value": "1d4",
        "cost": 4
      },
      {
        "id": "weapon-5-2",
        "value": "1d6",
        "cost": 6
      },
      {
        "id": "weapon-5-3",
        "value": "1d8 выбранного типа",
        "cost": 8
      }
    ]
  },
  {
    "id": "weapon-6",
    "category": "weapon",
    "name": "Смена типа базового урона",
    "scope": "Любое",
    "rule": "На всех попаданиях. Цена определяется для пары типов, если переход существенно меняет действие брони или сопротивлений",
    "variants": [
      {
        "id": "weapon-6-1",
        "value": "Заменяет тип урона на заданный",
        "cost": 3
      }
    ]
  },
  {
    "id": "weapon-7",
    "category": "weapon",
    "name": "Масса",
    "scope": "Любое",
    "rule": "Постоянно, от базовой массы оружия",
    "variants": [
      {
        "id": "weapon-7-1",
        "value": "+30%",
        "cost": -3
      },
      {
        "id": "weapon-7-2",
        "value": "+20%",
        "cost": -2
      },
      {
        "id": "weapon-7-3",
        "value": "+10%",
        "cost": -1
      },
      {
        "id": "weapon-7-4",
        "value": "−10%",
        "cost": 1
      },
      {
        "id": "weapon-7-5",
        "value": "−20%",
        "cost": 3
      },
      {
        "id": "weapon-7-6",
        "value": "−30%",
        "cost": 7
      }
    ]
  },
  {
    "id": "weapon-8",
    "category": "weapon",
    "name": "Ёмкость",
    "scope": "Оружие с ёмкостью",
    "rule": "Постоянно. +1 превращает ёмкость двустволки из 2 в 3",
    "variants": [
      {
        "id": "weapon-8-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "weapon-8-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "weapon-8-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "weapon-8-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "weapon-8-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "weapon-8-6",
        "value": "+3 патрона",
        "cost": 7
      }
    ]
  },
  {
    "id": "weapon-9",
    "category": "weapon",
    "name": "Дальность",
    "scope": "Дальнее",
    "rule": "Постоянно, к базовой дальности",
    "variants": [
      {
        "id": "weapon-9-1",
        "value": "−6",
        "cost": -3
      },
      {
        "id": "weapon-9-2",
        "value": "−4",
        "cost": -2
      },
      {
        "id": "weapon-9-3",
        "value": "−2",
        "cost": -1
      },
      {
        "id": "weapon-9-4",
        "value": "+2",
        "cost": 1
      },
      {
        "id": "weapon-9-5",
        "value": "+4",
        "cost": 3
      },
      {
        "id": "weapon-9-6",
        "value": "+6 гексов",
        "cost": 7
      }
    ]
  },
  {
    "id": "weapon-10",
    "category": "weapon",
    "name": "Досягаемость",
    "scope": "Ближнее",
    "rule": "Постоянно, к дистанции выбора цели",
    "variants": [
      {
        "id": "weapon-10-1",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "weapon-10-2",
        "value": "+1",
        "cost": 2
      },
      {
        "id": "weapon-10-3",
        "value": "+2 гекса",
        "cost": 6
      }
    ]
  },
  {
    "id": "weapon-11",
    "category": "weapon",
    "name": "Рикошет",
    "scope": "Дальнее",
    "rule": "После первого попадания за действие. Если есть допустимая вторая цель, атакующий выбирает её. Рикошет не запускает эффекты попадания",
    "variants": [
      {
        "id": "weapon-11-1",
        "value": "1 урона второй цели в пределах 2 гексов от первой",
        "cost": 4
      }
    ]
  },
  {
    "id": "weapon-12",
    "category": "weapon",
    "name": "Толчок",
    "scope": "Ближнее",
    "rule": "Первое попадание за действие. Использует правила принудительного перемещения",
    "variants": [
      {
        "id": "weapon-12-1",
        "value": "1 гекс",
        "cost": 2
      },
      {
        "id": "weapon-12-2",
        "value": "2 гекса",
        "cost": 6
      }
    ]
  },
  {
    "id": "weapon-13",
    "category": "weapon",
    "name": "Добивание",
    "scope": "Ближнее",
    "rule": "Первое попадание по подходящей цели за действие. HP проверяется перед нанесением урона",
    "variants": [
      {
        "id": "weapon-13-1",
        "value": "+2 урона цели с HP не выше 25% от максимума",
        "cost": 3
      }
    ]
  },
  {
    "id": "weapon-14",
    "category": "weapon",
    "name": "Отложенный удар",
    "scope": "Ближнее",
    "rule": "Первое попадание за раунд назначает урон на начало следующего хода цели. Без крита и повторного запуска эффектов попадания",
    "variants": [
      {
        "id": "weapon-14-1",
        "value": "1 × базовый урон оружия в начале следующего хода цели",
        "cost": 6
      }
    ]
  },
  {
    "id": "weapon-15",
    "category": "weapon",
    "name": "Заклинивание",
    "scope": "Дальнее, с перезарядкой",
    "rule": "Первый суперкрит за раунд. Текущий выстрел завершается, оставшиеся выстрелы очереди отменяются. Боезапас сохраняется",
    "variants": [
      {
        "id": "weapon-15-1",
        "value": "1 · после суперкрита требуется перезарядка",
        "cost": -2
      }
    ]
  },
  {
    "id": "weapon-16",
    "category": "weapon",
    "name": "Отдача при промахе",
    "scope": "Дальнее",
    "rule": "Первый промах за раунд. Штраф действует до конца следующего хода стрелка",
    "variants": [
      {
        "id": "weapon-16-1",
        "value": "−1 к доступному движению",
        "cost": -2
      }
    ]
  },
  {
    "id": "weapon-17",
    "category": "weapon",
    "name": "Провал удара",
    "scope": "Ближнее",
    "rule": "Первый промах за раунд. Эффект расходуется на один бросок противника или истекает в начале следующего хода владельца",
    "variants": [
      {
        "id": "weapon-17-1",
        "value": "+1 к попаданию для следующей атаки по владельцу",
        "cost": -2
      }
    ]
  },
  {
    "id": "armor-18",
    "category": "armor",
    "name": "Класс брони",
    "scope": "",
    "rule": "При каждом броске атаки против владельца, где учитывается класс брони",
    "variants": [
      {
        "id": "armor-18-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "armor-18-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "armor-18-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "armor-18-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "armor-18-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "armor-18-6",
        "value": "+3",
        "cost": 7
      }
    ]
  },
  {
    "id": "armor-19",
    "category": "armor",
    "name": "Фиксированное поглощение",
    "scope": "",
    "rule": "При каждом подходящем попадании. Может добавить поглощение лёгкой броне с базовым значением 0. Правила обхода поглощения сохраняются",
    "variants": [
      {
        "id": "armor-19-1",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "armor-19-2",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "armor-19-3",
        "value": "+1",
        "cost": 3
      },
      {
        "id": "armor-19-4",
        "value": "+2",
        "cost": 8
      }
    ]
  },
  {
    "id": "armor-20",
    "category": "armor",
    "name": "Сопротивление или уязвимость к типу урона",
    "scope": "",
    "rule": "На каждом попадании с положительным входящим уроном этого типа. Складывается со штатным поглощением там, где оно действует",
    "variants": [
      {
        "id": "armor-20-1",
        "value": "+2",
        "cost": -3
      },
      {
        "id": "armor-20-2",
        "value": "+1",
        "cost": -2
      },
      {
        "id": "armor-20-3",
        "value": "−1",
        "cost": 2
      },
      {
        "id": "armor-20-4",
        "value": "−2 получаемого урона выбранного типа",
        "cost": 6
      }
    ]
  },
  {
    "id": "armor-21",
    "category": "armor",
    "name": "Максимальная прочность",
    "scope": "",
    "rule": "От базового максимума, округление вверх до целой единицы. Текущая прочность ограничивается новым максимумом",
    "variants": [
      {
        "id": "armor-21-1",
        "value": "−30%",
        "cost": -3
      },
      {
        "id": "armor-21-2",
        "value": "−20%",
        "cost": -2
      },
      {
        "id": "armor-21-3",
        "value": "−10%",
        "cost": -1
      },
      {
        "id": "armor-21-4",
        "value": "+10%",
        "cost": 1
      },
      {
        "id": "armor-21-5",
        "value": "+20%",
        "cost": 3
      },
      {
        "id": "armor-21-6",
        "value": "+30%",
        "cost": 7
      }
    ]
  },
  {
    "id": "armor-22",
    "category": "armor",
    "name": "Масса",
    "scope": "",
    "rule": "Постоянно, от базовой массы брони",
    "variants": [
      {
        "id": "armor-22-1",
        "value": "+30%",
        "cost": -3
      },
      {
        "id": "armor-22-2",
        "value": "+20%",
        "cost": -2
      },
      {
        "id": "armor-22-3",
        "value": "+10%",
        "cost": -1
      },
      {
        "id": "armor-22-4",
        "value": "−10%",
        "cost": 1
      },
      {
        "id": "armor-22-5",
        "value": "−20%",
        "cost": 3
      },
      {
        "id": "armor-22-6",
        "value": "−30%",
        "cost": 7
      }
    ]
  },
  {
    "id": "armor-23",
    "category": "armor",
    "name": "Переносимый вес",
    "scope": "",
    "rule": "Изменяет общий лимит владельца, пока броня надета",
    "variants": [
      {
        "id": "armor-23-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "armor-23-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "armor-23-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "armor-23-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "armor-23-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "armor-23-6",
        "value": "+3 кг",
        "cost": 7
      }
    ]
  },
  {
    "id": "armor-24",
    "category": "armor",
    "name": "Движение",
    "scope": "",
    "rule": "Пока броня надета. Бонус может увеличить движение сверх базового значения",
    "variants": [
      {
        "id": "armor-24-1",
        "value": "−2",
        "cost": -3
      },
      {
        "id": "armor-24-2",
        "value": "−1",
        "cost": -2
      },
      {
        "id": "armor-24-3",
        "value": "+1",
        "cost": 2
      },
      {
        "id": "armor-24-4",
        "value": "+2 гекса",
        "cost": 6
      }
    ]
  },
  {
    "id": "armor-25",
    "category": "armor",
    "name": "Отражение",
    "scope": "",
    "rule": "Первое полученное попадание в ближнем бою за раунд. Отражённый урон не запускает встречное отражение",
    "variants": [
      {
        "id": "armor-25-1",
        "value": "1",
        "cost": 2
      },
      {
        "id": "armor-25-2",
        "value": "2 урона атакующему",
        "cost": 6
      }
    ]
  },
  {
    "id": "armor-26",
    "category": "armor",
    "name": "Хрупкость",
    "scope": "",
    "rule": "Первый полученный крит или суперкрит за бой",
    "variants": [
      {
        "id": "armor-26-1",
        "value": "1 прочность",
        "cost": -2
      },
      {
        "id": "armor-26-2",
        "value": "2 прочности",
        "cost": -3
      }
    ]
  },
  {
    "id": "armor-27",
    "category": "armor",
    "name": "Невосприимчивость к типу урона",
    "scope": "",
    "rule": "Постоянно. При смешанном уроне обнуляется только выбранный тип",
    "variants": [
      {
        "id": "armor-27-1",
        "value": "Полностью обнуляет выбранный тип урона",
        "cost": 8
      }
    ]
  },
  {
    "id": "armor-28",
    "category": "armor",
    "name": "Невосприимчивость к атаке",
    "scope": "",
    "rule": "Один раз за бой, при первом подходящем попадании. Отменяет это попадание и остальные выстрелы по владельцу в том же действии вместе с их эффектами. Каталог задаёт условие: ближняя, дальняя или любая атака",
    "variants": [
      {
        "id": "armor-28-1",
        "value": "Полностью отменяет действие атаки против владельца",
        "cost": 8
      }
    ]
  },
  {
    "id": "shield-29",
    "category": "shield",
    "name": "Максимальная ёмкость",
    "scope": "",
    "rule": "Постоянно. Текущий запас ограничен максимумом",
    "variants": [
      {
        "id": "shield-29-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "shield-29-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "shield-29-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "shield-29-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "shield-29-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "shield-29-6",
        "value": "+3",
        "cost": 7
      }
    ]
  },
  {
    "id": "shield-30",
    "category": "shield",
    "name": "Восстановление",
    "scope": "",
    "rule": "При первом штатном восстановлении щита за раунд. Восстановление может упасть до 0",
    "variants": [
      {
        "id": "shield-30-1",
        "value": "−2",
        "cost": -3
      },
      {
        "id": "shield-30-2",
        "value": "−1",
        "cost": -2
      },
      {
        "id": "shield-30-3",
        "value": "+1",
        "cost": 2
      },
      {
        "id": "shield-30-4",
        "value": "+2 единицы щита",
        "cost": 6
      }
    ]
  },
  {
    "id": "shield-31",
    "category": "shield",
    "name": "Масса",
    "scope": "",
    "rule": "Постоянно, от базовой массы щита",
    "variants": [
      {
        "id": "shield-31-1",
        "value": "+30%",
        "cost": -3
      },
      {
        "id": "shield-31-2",
        "value": "+20%",
        "cost": -2
      },
      {
        "id": "shield-31-3",
        "value": "+10%",
        "cost": -1
      },
      {
        "id": "shield-31-4",
        "value": "−10%",
        "cost": 1
      },
      {
        "id": "shield-31-5",
        "value": "−20%",
        "cost": 3
      },
      {
        "id": "shield-31-6",
        "value": "−30%",
        "cost": 7
      }
    ]
  },
  {
    "id": "shield-32",
    "category": "shield",
    "name": "Движение",
    "scope": "",
    "rule": "Пока щит экипирован",
    "variants": [
      {
        "id": "shield-32-1",
        "value": "−2",
        "cost": -3
      },
      {
        "id": "shield-32-2",
        "value": "−1",
        "cost": -2
      },
      {
        "id": "shield-32-3",
        "value": "+1",
        "cost": 2
      },
      {
        "id": "shield-32-4",
        "value": "+2 гекса",
        "cost": 6
      }
    ]
  },
  {
    "id": "shield-33",
    "category": "shield",
    "name": "Эффективность против типа урона",
    "scope": "",
    "rule": "Первое попадание выбранного типа, которое расходует щит, за действие атаки. При экономии щит поглощает ту же часть урона за меньший расход, вплоть до 0",
    "variants": [
      {
        "id": "shield-33-1",
        "value": "+2",
        "cost": -3
      },
      {
        "id": "shield-33-2",
        "value": "+1",
        "cost": -2
      },
      {
        "id": "shield-33-3",
        "value": "−1",
        "cost": 2
      },
      {
        "id": "shield-33-4",
        "value": "−2 к расходу щита",
        "cost": 6
      }
    ]
  },
  {
    "id": "shield-34",
    "category": "shield",
    "name": "Резерв",
    "scope": "",
    "rule": "Первый раз за бой, когда щит падает до 0. Срабатывает после завершения попадания",
    "variants": [
      {
        "id": "shield-34-1",
        "value": "Восстанавливает 1",
        "cost": 2
      },
      {
        "id": "shield-34-2",
        "value": "2 единицы щита",
        "cost": 6
      }
    ]
  },
  {
    "id": "shield-35",
    "category": "shield",
    "name": "Обратный импульс",
    "scope": "",
    "rule": "Первое попадание за раунд, из-за которого щит потерял заряд",
    "variants": [
      {
        "id": "shield-35-1",
        "value": "Атакующий получает 1",
        "cost": 3
      },
      {
        "id": "shield-35-2",
        "value": "2 урона заданного типа",
        "cost": 7
      }
    ]
  },
  {
    "id": "shield-36",
    "category": "shield",
    "name": "Утечка",
    "scope": "",
    "rule": "После первого за раунд попадания, которое уже израсходовало часть щита. Дополнительная потеря не переходит в HP",
    "variants": [
      {
        "id": "shield-36-1",
        "value": "Теряет 1",
        "cost": -2
      },
      {
        "id": "shield-36-2",
        "value": "2 единицы щита",
        "cost": -3
      }
    ]
  },
  {
    "id": "shield-37",
    "category": "shield",
    "name": "Отсечение пробития",
    "scope": "",
    "rule": "Один раз за бой, при первом попадании, которое исчерпало щит и пробило его. Эффекты попадания сохраняются",
    "variants": [
      {
        "id": "shield-37-1",
        "value": "Полностью отменяет остаток урона, который прошёл бы в HP",
        "cost": 8
      }
    ]
  },
  {
    "id": "backpack-38",
    "category": "backpack",
    "name": "Ячейки",
    "scope": "",
    "rule": "Пока рюкзак надет. При уменьшении вместимости вещи сохраняются, но нельзя добавить новые до освобождения места",
    "variants": [
      {
        "id": "backpack-38-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "backpack-38-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "backpack-38-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "backpack-38-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "backpack-38-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "backpack-38-6",
        "value": "+3",
        "cost": 7
      }
    ]
  },
  {
    "id": "backpack-39",
    "category": "backpack",
    "name": "Переносимый вес",
    "scope": "",
    "rule": "Изменяет общий лимит владельца",
    "variants": [
      {
        "id": "backpack-39-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "backpack-39-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "backpack-39-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "backpack-39-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "backpack-39-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "backpack-39-6",
        "value": "+3 кг",
        "cost": 7
      }
    ]
  },
  {
    "id": "backpack-40",
    "category": "backpack",
    "name": "Масса рюкзака",
    "scope": "",
    "rule": "От базовой массы самого рюкзака",
    "variants": [
      {
        "id": "backpack-40-1",
        "value": "+30%",
        "cost": -3
      },
      {
        "id": "backpack-40-2",
        "value": "+20%",
        "cost": -2
      },
      {
        "id": "backpack-40-3",
        "value": "+10%",
        "cost": -1
      },
      {
        "id": "backpack-40-4",
        "value": "−10%",
        "cost": 1
      },
      {
        "id": "backpack-40-5",
        "value": "−20%",
        "cost": 3
      },
      {
        "id": "backpack-40-6",
        "value": "−30%",
        "cost": 7
      }
    ]
  },
  {
    "id": "backpack-41",
    "category": "backpack",
    "name": "Масса содержимого",
    "scope": "",
    "rule": "Меняет вклад вещей внутри рюкзака в общий переносимый вес. Масса самих экземпляров сохраняется",
    "variants": [
      {
        "id": "backpack-41-1",
        "value": "+20%",
        "cost": -3
      },
      {
        "id": "backpack-41-2",
        "value": "+10%",
        "cost": -1
      },
      {
        "id": "backpack-41-3",
        "value": "−10%",
        "cost": 2
      },
      {
        "id": "backpack-41-4",
        "value": "−20%",
        "cost": 5
      },
      {
        "id": "backpack-41-5",
        "value": "−30%",
        "cost": 8
      }
    ]
  },
  {
    "id": "backpack-42",
    "category": "backpack",
    "name": "Движение",
    "scope": "",
    "rule": "Пока рюкзак надет",
    "variants": [
      {
        "id": "backpack-42-1",
        "value": "−2",
        "cost": -3
      },
      {
        "id": "backpack-42-2",
        "value": "−1",
        "cost": -2
      },
      {
        "id": "backpack-42-3",
        "value": "+1",
        "cost": 2
      },
      {
        "id": "backpack-42-4",
        "value": "+2 гекса",
        "cost": 6
      }
    ]
  },
  {
    "id": "backpack-43",
    "category": "backpack",
    "name": "Быстрый доступ",
    "scope": "",
    "rule": "Один раз за бой по выбору владельца. Действие на применение предмета оплачивается по его правилам",
    "variants": [
      {
        "id": "backpack-43-1",
        "value": "Достать один предмет без расхода действия",
        "cost": 4
      }
    ]
  },
  {
    "id": "backpack-44",
    "category": "backpack",
    "name": "Заедание",
    "scope": "",
    "rule": "Первое извлечение из рюкзака в бою. Если движение уже потрачено, штраф переносится на следующий ход",
    "variants": [
      {
        "id": "backpack-44-1",
        "value": "Требует потратить 1 доступный гекс движения при извлечении предмета",
        "cost": -2
      }
    ]
  },
  {
    "id": "backpack-45",
    "category": "backpack",
    "name": "Карман вне пространства",
    "scope": "",
    "rule": "Пока предмет находится в специальной ячейке рюкзака. Ячейка вмещает один экземпляр. Другой контейнер нельзя положить в неё",
    "variants": [
      {
        "id": "backpack-45-1",
        "value": "Один выбранный предмет занимает 0 ячеек и даёт 0 нагрузки",
        "cost": 8
      }
    ]
  },
  {
    "id": "implant-46",
    "category": "implant",
    "name": "Характеристика",
    "scope": "",
    "rule": "Пока имплант установлен. Производные показатели пересчитываются по обычным правилам",
    "variants": [
      {
        "id": "implant-46-1",
        "value": "−2",
        "cost": -3
      },
      {
        "id": "implant-46-2",
        "value": "−1",
        "cost": -2
      },
      {
        "id": "implant-46-3",
        "value": "+1",
        "cost": 3
      },
      {
        "id": "implant-46-4",
        "value": "+2 к выбранной характеристике",
        "cost": 8
      }
    ]
  },
  {
    "id": "implant-47",
    "category": "implant",
    "name": "Максимальное здоровье",
    "scope": "",
    "rule": "Пока имплант установлен. Рост максимума не восстанавливает текущие HP",
    "variants": [
      {
        "id": "implant-47-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "implant-47-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "implant-47-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "implant-47-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "implant-47-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "implant-47-6",
        "value": "+3 HP",
        "cost": 7
      }
    ]
  },
  {
    "id": "implant-48",
    "category": "implant",
    "name": "Максимальная энергия",
    "scope": "",
    "rule": "Пока имплант установлен. Рост максимума не пополняет текущую энергию",
    "variants": [
      {
        "id": "implant-48-1",
        "value": "−3",
        "cost": -3
      },
      {
        "id": "implant-48-2",
        "value": "−2",
        "cost": -2
      },
      {
        "id": "implant-48-3",
        "value": "−1",
        "cost": -1
      },
      {
        "id": "implant-48-4",
        "value": "+1",
        "cost": 1
      },
      {
        "id": "implant-48-5",
        "value": "+2",
        "cost": 3
      },
      {
        "id": "implant-48-6",
        "value": "+3",
        "cost": 7
      }
    ]
  },
  {
    "id": "implant-49",
    "category": "implant",
    "name": "Расход энергии",
    "scope": "",
    "rule": "При первой активации этого импланта за раунд. Стоимость может упасть до 0",
    "variants": [
      {
        "id": "implant-49-1",
        "value": "+2",
        "cost": -3
      },
      {
        "id": "implant-49-2",
        "value": "+1",
        "cost": -2
      },
      {
        "id": "implant-49-3",
        "value": "−1",
        "cost": 2
      },
      {
        "id": "implant-49-4",
        "value": "−2",
        "cost": 6
      }
    ]
  },
  {
    "id": "implant-50",
    "category": "implant",
    "name": "Дальность обзора",
    "scope": "",
    "rule": "Пока имплант установлен. Препятствия и правила видимости сохраняются",
    "variants": [
      {
        "id": "implant-50-1",
        "value": "−4",
        "cost": -3
      },
      {
        "id": "implant-50-2",
        "value": "−2",
        "cost": -1
      },
      {
        "id": "implant-50-3",
        "value": "+2",
        "cost": 1
      },
      {
        "id": "implant-50-4",
        "value": "+4 гекса",
        "cost": 3
      }
    ]
  },
  {
    "id": "implant-51",
    "category": "implant",
    "name": "Движение",
    "scope": "",
    "rule": "Пока имплант установлен",
    "variants": [
      {
        "id": "implant-51-1",
        "value": "−2",
        "cost": -3
      },
      {
        "id": "implant-51-2",
        "value": "−1",
        "cost": -2
      },
      {
        "id": "implant-51-3",
        "value": "+1",
        "cost": 2
      },
      {
        "id": "implant-51-4",
        "value": "+2 гекса",
        "cost": 6
      }
    ]
  },
  {
    "id": "implant-52",
    "category": "implant",
    "name": "Управление дронами",
    "scope": "",
    "rule": "Пока имплант установлен. Итоговый показатель от 0. Применяются действующие правила команд дронам",
    "variants": [
      {
        "id": "implant-52-1",
        "value": "−1",
        "cost": -2
      },
      {
        "id": "implant-52-2",
        "value": "+1",
        "cost": 4
      },
      {
        "id": "implant-52-3",
        "value": "+2 к DroneActions",
        "cost": 8
      }
    ]
  },
  {
    "id": "implant-53",
    "category": "implant",
    "name": "Блокировка штрафов ранений",
    "scope": "",
    "rule": "Один раз за бой по выбору владельца при получении штрафа. Ранение сохраняется",
    "variants": [
      {
        "id": "implant-53-1",
        "value": "Игнорирует штрафы ранений до начала следующего хода владельца",
        "cost": 4
      }
    ]
  },
  {
    "id": "implant-54",
    "category": "implant",
    "name": "Сенсорный сбой",
    "scope": "",
    "rule": "Первое полученное попадание с положительным энергетическим уроном за бой",
    "variants": [
      {
        "id": "implant-54-1",
        "value": "−2 гекса обзора до конца следующего хода",
        "cost": -2
      }
    ]
  },
  {
    "id": "implant-55",
    "category": "implant",
    "name": "Аварийный резерв",
    "scope": "",
    "rule": "Один раз за бой, когда входящий урон впервые опустил бы положительные HP до 0. Прочие последствия попадания сохраняются",
    "variants": [
      {
        "id": "implant-55-1",
        "value": "Персонаж остаётся на 1 HP",
        "cost": 8
      }
    ]
  }
];
