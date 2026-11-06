"""Run against a disposable migrated PocketBase fixture, never a production database."""
import concurrent.futures
import json
import os
import sqlite3
import subprocess
import time
import tempfile
import shutil
import urllib.error
import urllib.request

base = os.environ.get("AUTH_TEST_URL", "http://127.0.0.1:40931")
pb = os.path.abspath(os.environ["POCKETBASE_BIN"])
fixture = tempfile.TemporaryDirectory(prefix="grpgi-auth-test-")
data_dir = os.path.join(fixture.name, "pb_data")
migrations = os.path.join(fixture.name, "pb_migrations")
test_hooks = os.path.join(fixture.name, "pb_hooks")
empty_hooks = os.path.join(fixture.name, "empty")
for folder in (data_dir, migrations, test_hooks, empty_hooks):
    os.makedirs(folder)
shutil.copy("tests/fixtures/player-auth-v212-seed.js", os.path.join(migrations, "1793923100_fixture.js"))
log = open(os.path.join(fixture.name, "auth-test.log"), "w")
def migrate(hooks):
    result = subprocess.run([pb, "migrate", "up", "--dir=" + data_dir,
        "--hooksDir=" + hooks, "--migrationsDir=" + migrations], stdout=log, stderr=subprocess.STDOUT)
    log.flush()
    if result.returncode or "Error: failed" in open(log.name).read():
        raise AssertionError("Fixture migration failed. Inspect " + log.name)
migrate(empty_hooks)
shutil.copy("pocketbase/pb_migrations/1793923200_player_auth_v212.js", migrations)
for name in ("grpgi_auth_v212.js", "grpgi_auth_v212.pb.js"):
    shutil.copy(os.path.join("pocketbase/pb_hooks", name), test_hooks)
migrate(test_hooks)
shutil.copy("tests/fixtures/player-auth-v212-routes.pb.js", test_hooks)
process = subprocess.Popen([pb, "serve", "--http=127.0.0.1:40931",
    "--dir=" + data_dir, "--hooksDir=" + test_hooks, "--migrationsDir=" + migrations],
    stdout=log, stderr=subprocess.STDOUT)

def call(action, body=None, token="", query=""):
    url = base + "/api/grpgi/auth-v212/" + action + query
    return request(url, body, token)

def request(url, body=None, token="", method=None):
    headers = {"Content-Type": "application/json", "X-GRPGI-Session": token}
    req = urllib.request.Request(url, None if body is None else json.dumps(body).encode(),
        headers, method=method or ("GET" if body is None else "POST"))
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

def login(player, password):
    status, response = call("login", {"campaignId": "main", "playerId": player, "password": password})
    assert status == 200, response
    return response["token"]

try:
    for _ in range(50):
        try:
            urllib.request.urlopen(base + "/api/health")
            break
        except (OSError, urllib.error.URLError):
            time.sleep(.1)
    dm = login("gm", "dm-secret-123")
    player = login("p", "1234")
    assert call("session", token=player)[0] == 200
    assert call("recovery/requests", query="?campaignId=main")[0] == 401
    assert call("recovery/requests", token=player, query="?campaignId=main")[0] == 403
    assert call("recovery/requests", token=dm, query="?campaignId=other")[0] == 403

    # A client cannot recover a DM password, or make a player into a DM.
    for who in ["missing", "gm", "p"]:
        status, response = call("recovery/request", {"campaignId": "main", "playerId": who})
        assert status == 200 and response["message"] == "Если персонаж существует, запрос передан ДМу"
    status, response = call("recovery/requests", token=dm, query="?campaignId=main")
    assert status == 200 and len(response["requests"]) == 1, response
    pending = response["requests"][0]
    assert pending["playerId"] == "p" and "tokenHash" not in pending
    payload = {"campaignId":"main", "requestId":pending["id"]}
    assert call("recovery/approve", payload, player)[0] == 403
    status, issued = call("recovery/approve", payload, dm)
    assert status == 200, issued
    token = issued["url"].split("#recover=")[1]
    assert len(token) == 48 and issued["expiresIn"] == 1800

    # Reissuance rotates the secret, and it is absent from the inbox response.
    status, issued = call("recovery/approve", payload, dm)
    fresh = issued["url"].split("#recover=")[1]
    assert fresh != token
    assert call("recovery/confirm", {"token":token, "password":"new-password-123"})[0] == 400
    inbox = call("recovery/requests", token=dm, query="?campaignId=main")[1]
    assert fresh not in json.dumps(inbox)
    assert call("recovery/confirm", {"token":fresh, "password":"short"})[0] == 400
    def reset():
        return call("recovery/confirm", {"token":fresh, "password":"new-password-123"})[0]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: reset(), range(2)))
    assert sorted(results) == [200, 400], results
    assert call("session", token=player)[0] == 401
    assert request(base + "/api/grpgi/players/mutate", {"campaignId":"main","playerId":"p"}, token=player)[0] == 401
    assert call("recovery/confirm", {"token":fresh, "password":"another-password"})[0] == 400
    assert call("login", {"campaignId":"main","playerId":"p","password":"1234"})[0] == 401
    player = login("p", "new-password-123")

    assert call("recovery/request", {"campaignId":"main", "playerId":"p"})[0] == 200
    pending = call("recovery/requests", token=dm, query="?campaignId=main")[1]["requests"][0]
    issued = call("recovery/approve", {"campaignId":"main","requestId":pending["id"]}, dm)[1]
    expired = issued["url"].split("#recover=")[1]
    with sqlite3.connect(os.path.join(data_dir, "data.db")) as db:
        db.execute("UPDATE grpgi_recovery_v212 SET expiresAt=1 WHERE id=?", (pending["id"],))
    assert call("recovery/confirm", {"token":expired,"password":"expired-password"})[0] == 400

    assert request(base + "/api/grpgi/players/mutate", {"campaignId":"main","playerId":"p"}, token=player)[0] == 200
    assert request(base + "/api/grpgi/players/mutate", {"campaignId":"main","playerId":"gm"}, token=player)[0] == 403
    assert request(base + "/api/grpgi/players/mutate", {"campaignId":"main","playerId":"p"})[0] == 401
    assert request(base + "/api/grpgi/players/mutate", {"campaignId":"main","playerId":"p"}, token=dm)[0] == 200
    assert request(base + "/api/batch", {"requests":[]})[0] == 403
    assert request(base + "/api/collections/campaign_snapshots/records", {"campaignId":"main"}, token=player)[0] == 403

    # Public records contain no credentials. A direct old-client update cannot reset the password.
    status, rows = request(base + "/api/collections/campaign_players/records")
    assert status == 200
    row = next(row for row in rows["items"] if row["playerId"] == "p")
    assert "pass" not in row["playerJson"]
    changed = {**row["playerJson"], "pass":"attacker-password", "role":"gm"}
    assert request(base + "/api/collections/campaign_players/records/" + row["id"],
        {"playerJson":changed}, token=player, method="PATCH")[0] == 200
    assert call("login", {"campaignId":"main","playerId":"p","password":"attacker-password"})[0] == 401
    login("p", "new-password-123")
    assert request(base + "/api/collections/grpgi_credentials_v212/records")[0] in (401, 403)
    snapshots = request(base + "/api/collections/campaign_snapshots/records")[1]
    assert "old-pass" not in json.dumps(snapshots)

    assert request(base + "/api/grpgi/character-applications/submit", {
        "campaignId":"main","playerId":"p","playerJson":{"id":"p","pass":"overwrite-123","role":"player"}})[0] == 400

    # Registration saves an independent bcrypt credential and returns only the clean player.
    status, created = request(base + "/api/grpgi/character-applications/submit", {
        "campaignId":"main","playerId":"new","playerJson":{"id":"new","role":"player","pass":"registered-123","approvalStatus":"pending"}})
    assert status == 200, created
    assert "pass" not in created["playerJson"]
    assert call("login", {"campaignId":"main","playerId":"new","password":"registered-123"})[0] == 401
    assert request(base + "/api/grpgi/character-applications/submit", {
        "campaignId":"main","playerId":"fakegm","playerJson":{"role":"gm","pass":"fake-password"}})[0] != 200

    assert request(base + "/api/grpgi/character-applications/submit", {
        "campaignId":"main","playerId":"failsave","playerJson":{"id":"failsave","role":"player","pass":"registered-123","failSave":True}})[0] != 200

    with sqlite3.connect(os.path.join(data_dir, "data.db")) as db:
        assert db.execute("SELECT count(*) FROM grpgi_credentials_v212 WHERE playerId='failsave'").fetchone()[0] == 0
        for (hashed,) in db.execute("SELECT password FROM grpgi_credentials_v212"):
            assert hashed.startswith("$2"), hashed
        all_json = list(db.execute("SELECT playerJson FROM campaign_players"))
        assert all('"pass"' not in row[0] for row in all_json)
    codes = [call("login", {"campaignId":"main","playerId":"ratelimit","password":"wrong"})[0] for _ in range(9)]
    assert codes[-1] == 429 and 200 not in codes

    print("PASS real PocketBase bcrypt migration, login, GM authorization, recovery rotation, concurrent single use, revoked sessions, clean records, protected passwords and registration")
finally:
    process.terminate()
    process.wait(timeout=10)
    log.close()
    fixture.cleanup()
