# Отключение биржи v318

Биржа отключена в приложении, на сайте, в PocketBase, в отдельном сервисе на 8091 и в резервном sync-server. Обычный торговый терминал снаряжения продолжает работать. Рейды остаются отключёнными.

## Что изменено

- Нет вкладки «Акции», кнопки биржи в хабе, редактора портфеля и категории акций в World Config. У планет убран переключатель фондового рынка; у организаций убраны финансовые поля и биржевая строка новостей.
- Клиенты не опрашивают котировки. Старые переходы на биржу не открывают торговлю. Старые IPC-команды Electron завершаются без сетевых запросов.
- Старые API биржи в PocketBase отвечают HTTP 410. Глобальный middleware дополнительно запрещает покупку/продажу акций через старый общий маршрут торговли, включая акции с нестандартными ID. Проверка обычных товаров сохраняется.
- Оба серверных процесса биржи завершаются до открытия БД, сетевых запросов и таймеров даже при случайном запуске обновлённого файла. В sync-server остановлен таймер котировок/заявок и закрыты оба варианта биржевого API.
- Данные портфелей, денежных балансов, биржевой БД и заявок не удаляются и не ликвидируются. Пока службы остановлены, заявки не исполняются, комиссии и проценты не начисляются. Никаких автоматических возвратов денег или закрытия позиций нет. Возобновление потребует отдельной разработки с учётом времени простоя.

## После слияния PR: PowerShell из каталога проекта

Замените YOUR_SERVER адресом сервера. Сначала остановите службы биржи, чтобы они не продолжали изменять позиции во время обновления.

```powershell
git pull
$RaidServer = "root@YOUR_SERVER"

ssh $RaidServer "systemctl disable --now grpgi-market.service grpgi-stock-worker.service"
ssh $RaidServer "mkdir -p /opt/pocketbase/hook-backups-v318 /opt/grpgi-market-service /opt/grpgi-stock-worker && cp -a /opt/pocketbase/pb_hooks/. /opt/pocketbase/hook-backups-v318/"
ssh $RaidServer "systemctl stop pocketbase"

scp pocketbase/pb_hooks/grpgi_stocks_disabled_v318.js pocketbase/pb_hooks/grpgi_auth_v212.js pocketbase/pb_hooks/grpgi_stock_exchange_v148.js pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js "${RaidServer}:/opt/pocketbase/pb_hooks/"
scp market-service/server.js "${RaidServer}:/opt/grpgi-market-service/server.js"
scp stock-worker/worker.js "${RaidServer}:/opt/grpgi-stock-worker/worker.js"
scp stock-worker/grpgi-stock-worker.service "${RaidServer}:/etc/systemd/system/"

ssh $RaidServer "systemctl daemon-reload && systemctl start pocketbase"
ssh $RaidServer "systemctl status pocketbase --no-pager"
ssh $RaidServer "systemctl is-active grpgi-market.service grpgi-stock-worker.service"
```

Ожидаемый результат последней команды — `inactive` (она возвращает ненулевой код для остановленных служб). Если старый worker никогда не устанавливался, сообщение об отсутствии его unit не мешает остановке установленной службы биржи. При ошибке SCP запустите PocketBase обратно и повторите загрузку после устранения причины. Не удаляйте `/var/lib/grpgi-market`, `pb_data` и файлы окружения.

После обновления клиента перезапустите Electron, выполните **Deploy Web**, обновите страницу сайта. Это необходимо для удаления старых кнопок и опроса котировок из уже открытых клиентов.

Если установлен резервный sync-server, обновите также `sync-server/server.js` и `sync-server/market-engine.js` в его каталоге установки и перезапустите его обычным способом. Основной PocketBase от него не зависит.

## Проверка

- Обычные задания, новости, инвентарь и торговля снаряжением работают.
- Нет вкладки акций и биржевых элементов World Config.
- Обе службы биржи `inactive`, порт 8091 не обслуживает торговлю.
- Обращение к старому API напрямую на PocketBase даёт HTTP 410. Если reverse proxy всё ещё направляет биржевой путь на остановленный сервис 8091, внешний ответ может быть 502: торговля всё равно недоступна. При необходимости отдельное правило биржи можно убрать из конфигурации прокси, чтобы путь обслуживал блокирующий hook PocketBase; это не требуется для отключения.
- Старые портфели и денежные балансы сохранены. Для тестов используются `tests/stocks-disabled-v318.cjs`, проверки реального World Config и веб-навигации в общем `node tools/test-pr.cjs`. Старые тесты исполнения биржевых заявок исключены из обязательного прогона, поскольку этот интерфейс закрыт; вычислительные модули сохранены.
