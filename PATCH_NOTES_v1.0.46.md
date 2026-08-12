# GRPGI 1.0.46 — Web deploy health-check fix

## Исправлено

- Автодеплой Web больше не проверяет сайт через публичный DNS/CDN с самого сервера.
- Health-check теперь обращается к локальному origin (`127.0.0.1`) через `curl --resolve`, сохраняя настоящий hostname и TLS SNI.
- Это исключает ложные HTTP 403 от CDN/WAF/anti-bot на серверных self-requests.
- Ответы 2xx и 3xx считаются исправным состоянием.
- 4xx/5xx и сетевые ошибки по-прежнему приводят к rollback.
- При реальной ошибке лог теперь содержит точный URL и HTTP-код в формате `GRPGI_HEALTH_FAIL ... HTTP_<code>`.
- Проверки наличия `/var/www/grpg-app/index.html` и `/var/www/grpg-app/app/index.html` перед переключением сохранены.

## Архитектура проверки

Вместо:

    server -> public DNS/CDN -> app.grpg-sync.ru -> origin

используется:

    server -> 127.0.0.1:443 (Host/SNI: app.grpg-sync.ru) -> local reverse proxy -> deployed site

## Версия

- package: 1.0.46
- buildVersion: 1.0.46.0
- web build-info: 1.0.46

## Проверки

- `node --check tools/devops-automation.cjs`
- JSON validation for package.json, package-lock.json, build-info.json
- local health-check test against HTTP 200 -> success
- local health-check test against HTTP 403 -> exit 43 + diagnostic
- npm install / npm ci were not run
