"""Disposable real PocketBase + independent market test. Set POCKETBASE_BIN."""
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PB = os.path.abspath(os.environ['POCKETBASE_BIN'])
PB_URL = 'http://127.0.0.1:40931'
MARKET_URL = 'http://127.0.0.1:40932'
API = MARKET_URL + '/api/grpgi/stock-exchange-v148'


def request(url, body=None, token='', method=None, headers=None):
    req = urllib.request.Request(url, None if body is None else json.dumps(body).encode(),
        {'Content-Type': 'application/json', 'X-GRPGI-Session': token, **(headers or {})},
        method=method or ('GET' if body is None else 'POST'))
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else {}, response.headers


def wait(url, process):
    for _ in range(100):
        assert process.poll() is None, 'server exited; inspect test log'
        try:
            if request(url)[0] == 200:
                return
        except OSError:
            pass
        time.sleep(.1)
    raise AssertionError('server did not start')


with tempfile.TemporaryDirectory(prefix='grpgi-market-session-') as folder:
    tmp = Path(folder)
    for name in ['data', 'migrations', 'hooks', 'empty']:
        (tmp / name).mkdir()
    shutil.copy(ROOT / 'tests/fixtures/player-auth-v212-seed.js', tmp / 'migrations/1793923100_fixture.js')
    processes = []
    with (tmp / 'servers.log').open('w+') as log:
        try:
            def migrate(hooks):
                subprocess.run([PB, 'migrate', 'up', '--dir=' + str(tmp / 'data'),
                    '--migrationsDir=' + str(tmp / 'migrations'), '--hooksDir=' + str(tmp / hooks)],
                    check=True, stdout=log, stderr=subprocess.STDOUT)
            migrate('empty')
            shutil.copy(ROOT / 'pocketbase/pb_migrations/1793923200_player_auth_v212.js', tmp / 'migrations')
            for name in ['grpgi_auth_v212.js', 'grpgi_auth_v212.pb.js']:
                shutil.copy(ROOT / 'pocketbase/pb_hooks' / name, tmp / 'hooks')
            migrate('hooks')
            db_path = tmp / 'data/data.db'
            with sqlite3.connect(db_path) as db:
                db.execute('ALTER TABLE campaign_players ADD COLUMN updatedBy TEXT')
                db.execute('ALTER TABLE campaign_players ADD COLUMN clientUpdatedAt TEXT')
                db.execute('UPDATE campaign_snapshots SET worldJson=?', (json.dumps({
                    'equipment': {'alpha': {'id': 'alpha', 'type': 'stock', 'stockMinPrice': 100}}}),))
                db.execute('UPDATE campaign_players SET playerJson=? WHERE playerId=?',
                    (json.dumps({'id': 'p', 'role': 'player', 'credits': 10000}), 'p'))
            pb = subprocess.Popen([PB, 'serve', '--http=127.0.0.1:40931',
                '--dir=' + str(tmp / 'data'), '--hooksDir=' + str(tmp / 'hooks'),
                '--migrationsDir=' + str(tmp / 'migrations')], stdout=log, stderr=subprocess.STDOUT)
            processes.append(pb)
            wait(PB_URL + '/api/health', pb)
            env = {**os.environ, 'MARKET_PORT': '40932', 'MARKET_HOST': '127.0.0.1',
                'MARKET_DB': str(tmp / 'market.sqlite'), 'POCKETBASE_DB': str(db_path),
                'POCKETBASE_URL': PB_URL, 'GRPGI_STOCK_WORKER_TOKEN': 'fixture-worker-secret'}
            market = subprocess.Popen(['node', str(ROOT / 'market-service/server.js')],
                env=env, stdout=log, stderr=subprocess.STDOUT)
            processes.append(market)
            wait(MARKET_URL + '/health', market)

            def auth(action, body=None, token=''):
                return request(PB_URL + '/api/grpgi/auth-v212/' + action, body, token)
            def login(player, password):
                code, result, _ = auth('login', {'campaignId': 'main', 'playerId': player, 'password': password})
                assert code == 200, result
                return result['token']
            player = login('p', '1234')
            dm = login('gm', 'dm-secret-123')
            query = '?campaignId=main&playerId=p&itemId=alpha'
            order = {'campaignId': 'main', 'playerId': 'p', 'itemId': 'alpha',
                'intent': 'open_long', 'type': 'market', 'quantity': 2, 'operationId': 'buy-1'}
            for method, path in [('GET', ''), ('POST', '/order'), ('POST', '/cancel'), ('POST', '/impulse')]:
                code, _, headers = request(API + path, method='OPTIONS', headers={
                    'Origin': 'https://app.grpg-sync.ru', 'Access-Control-Request-Method': method,
                    'Access-Control-Request-Headers': 'content-type,x-grpgi-session'})
                assert code == 204
                assert 'x-grpgi-session' in headers['Access-Control-Allow-Headers'].lower()
                assert headers['Access-Control-Allow-Origin'] == '*'
            assert request(API + query)[0] == 401
            assert request(API + '/order', order)[0] == 401
            assert request(API + '/order', order, 'invalid')[0] == 401
            assert request(API + '/order', {**order, 'playerId': 'gm'}, player)[0] == 403
            assert request(API + '/order', {**order, 'campaignId': 'other'}, player)[0] == 403
            assert request(API + '?campaignId=main&playerId=gm', token=player)[0] == 403
            impulse = {'campaignId': 'main', 'playerId': 'p', 'itemId': 'alpha', 'targetPrice': 100}
            # A mutable public profile role does not grant private DM authority.
            with sqlite3.connect(db_path) as db:
                db.execute('UPDATE campaign_players SET playerJson=? WHERE playerId=?',
                    (json.dumps({'id': 'p', 'role': 'gm', 'credits': 10000}), 'p'))
            assert request(API + '/impulse', impulse, player)[0] == 403
            assert request(API + '/impulse', {**impulse, 'playerId': 'gm'}, dm)[0] == 200
            code, result, _ = request(API + '/order', order, player)
            assert code == 200, result
            assert result['player']['stockPortfolio']['positions']['alpha']['knownQty'] == 2
            assert result['player']['credits'] == 9800
            assert result['orders'][0]['status'] == 'filled'
            assert request(API + '/order', order, player)[1]['player']['credits'] == 9800
            pending = {**order, 'type': 'limit', 'limitPrice': .01, 'operationId': 'limit-1'}
            assert request(API + '/order', pending, player)[0] == 200
            cancel = {'campaignId': 'main', 'playerId': 'p', 'orderId': 'limit-1'}
            assert request(API + '/cancel', cancel)[0] == 401
            assert request(API + '/cancel', {**cancel, 'playerId': 'gm'}, player)[0] == 403
            assert request(API + '/cancel', cancel, player)[0] == 200
            assert request(API + '/tick', {'campaignId': 'main'})[0] == 401
            before = request(API + query, token=player)[1]
            for _ in range(120):
                after = request(API + query, token=player)[1]
                if after['lastTick'] > before['lastTick']:
                    break
                time.sleep(.1)
            assert after['lastTick'] > before['lastTick'], 'quote timer stopped'
            assert after['candles']['alpha'], 'no candle history'
            assert after['quotes'][0]['price'] != before['quotes'][0]['price'], 'quotes did not move'
            assert auth('recovery/request', {'campaignId': 'main', 'playerId': 'p'})[0] == 200
            pending = auth('recovery/requests?campaignId=main', token=dm)[1]['requests'][0]
            issued = auth('recovery/approve', {'campaignId': 'main', 'requestId': pending['id']}, dm)[1]
            secret = issued['url'].split('#recover=')[1]
            assert auth('recovery/confirm', {'token': secret, 'password': 'new-password-123'})[0] == 200
            assert request(API + query, token=player)[0] == 401
            assert request(API + '/order', {**order, 'operationId': 'revoked'}, player)[0] == 401
            assert request(API + query, token=login('p', 'new-password-123'))[0] == 200
            pb.terminate()
            pb.wait(timeout=10)
            assert request(API + query, token=dm)[0] == 503
            print('PASS browser CORS, real sessions, ownership, DM permissions, settlement, cancellation, moving quotes, candles, recovery revocation')
        except BaseException:
            log.flush()
            log.seek(0)
            print(log.read())
            raise
        finally:
            for process in reversed(processes):
                process.terminate()
                process.wait(timeout=10)
