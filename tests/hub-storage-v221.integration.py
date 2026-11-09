"""Exercise hub routes on a disposable PocketBase database."""
import concurrent.futures
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

base = "http://127.0.0.1:40932"
root = Path(__file__).resolve().parents[1]
pb = os.path.abspath(os.environ["POCKETBASE_BIN"])


def request(path, data=None, token=""):
    req = urllib.request.Request(base + path, None if data is None else json.dumps(data).encode(),
                                 {"Content-Type": "application/json", "X-GRPGI-Session": token})
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


with tempfile.TemporaryDirectory(prefix="grpgi-hub-test-") as temporary:
    fixture = Path(temporary)
    migrations = fixture / "pb_migrations"
    hooks = fixture / "pb_hooks"
    migrations.mkdir()
    hooks.mkdir()
    shutil.copy(root / "tests/fixtures/player-auth-v212-seed.js", migrations / "1793923100_fixture.js")
    args = ["--dir=" + str(fixture / "pb_data"), "--hooksDir=" + str(hooks),
            "--migrationsDir=" + str(migrations)]
    seeded = subprocess.check_output([pb, "migrate", "up", *args], text=True, stderr=subprocess.STDOUT)
    assert "Error:" not in seeded, seeded[-3000:]
    db = fixture / "pb_data/data.db"
    with sqlite3.connect(db) as conn:
        conn.execute("INSERT INTO campaign_players (id,campaignId,playerId,playerJson,version) VALUES (?,?,?,?,1)",
                     ("secondplayer123", "main", "p2", json.dumps({"id":"p2","role":"player","pass":"player-two-123"})))
    for path in (root / "pocketbase/pb_migrations").glob("*.js"):
        shutil.copy(path, migrations)
    for name in ("grpgi_auth_v212.js", "grpgi_auth_v212.pb.js", "item-instances-v215.js",
                 "grpgi_hub_v221.js", "grpgi_hub_v221.pb.js", "hub-rules-v221.js"):
        shutil.copy(root / "pocketbase/pb_hooks" / name, hooks)
    migrated = subprocess.check_output([pb, "migrate", "up", *args], text=True, stderr=subprocess.STDOUT)
    assert "1793923300_hub_storage_v221.js" in migrated and "Error:" not in migrated, migrated[-5000:]
    flags = {"view": True, "take": True}
    map_ = {"id":"deck", "width":800, "height":600,
            "walls":[{"points":[{"x":180,"y":0},{"x":180,"y":300}],"blockSight":True,"blockMovement":True}],
            "objects":[
                {"id":"common","type":"storage","x":95,"y":85,"width":20,"height":20,"storageMode":"shared",
                 "storageCells":2,"storageCreditLimit":20,"storageViewFlag":"view","storageWithdrawFlag":"take"},
                {"id":"personal","type":"storage","x":95,"y":85,"width":20,"height":20}]}
    world = {"planets":{"PLANETS":{"hub":{"locationType":"hub","hub":{"maps":[map_]}}}},
             "equipment":{"EQUIPMENT":{"ammo":{"inventoryWidth":2,"inventoryHeight":1,"stackable":True,"stackLimit":10},
                                       "rifle":{"type":"weapon","inventoryWidth":2,"inventoryHeight":1,"durabilityMax":10}}}}
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE campaign_snapshots SET worldJson=?", (json.dumps(world),))
        for identifier in ("p", "gm", "p2"):
            profile = json.loads(conn.execute("SELECT playerJson FROM campaign_players WHERE playerId=?", (identifier,)).fetchone()[0])
            profile.update(currentPlanetId="hub", credits=40, hubState={"planetId":"hub","mapId":"deck","x":105 if identifier == "p" else 205,
                           "y":95,"flags":flags if identifier == "p" else {}},
                           inventory=[{"itemId":"ammo","qty":12},{"itemId":"rifle","qty":2,
                                       "instancesV215":[{"id":"rifle-original","durability":3,"durabilityMax":10},
                                                        {"id":"rifle-other","durability":9,"durabilityMax":10}]}])
            conn.execute("UPDATE campaign_players SET playerJson=? WHERE playerId=?", (json.dumps(profile), identifier))
    with open(fixture / "pocketbase.log", "w+") as log:
        process = subprocess.Popen([pb, "serve", "--http=127.0.0.1:40932", "--dev", *args], stdout=log, stderr=log)
        try:
            for _ in range(50):
                try:
                    if request("/api/health")[0] == 200:
                        break
                except OSError:
                    time.sleep(.1)
            def login(player, password):
                status, reply = request("/api/grpgi/auth-v212/login", {"campaignId":"main","playerId":player,"password":password})
                assert status == 200, reply
                return reply["token"]

            player, gm, other = login("p", "1234"), login("gm", "dm-secret-123"), login("p2", "player-two-123")
            def route(name, token=player, **values):
                return request("/api/grpgi/auth-v212/hub-v221/" + name, {"planetId":"hub","mapId":"deck",**values}, token)

            def storage(action="open", token=player, box="common", **values):
                return route("storage", token, action=action, objectId=box, **values)

            assert storage(token="")[0] == 401
            assert storage(token=gm)[0] == 403  # The wall blocks use.
            assert route("presence", player, x=105, y=95) == (200, {"peers":[]})
            assert route("presence", gm, x=205, y=95) == (200, {"peers":[]})
            assert route("presence", other, x=205, y=95) == (200, {"peers":[]})
            assert route("presence", player, x=105, y=95) == (200, {"peers":[]})
            # Move the other character through the persisted campaign state.
            with sqlite3.connect(db) as conn:
                conn.execute("UPDATE campaign_players SET playerJson=json_set(playerJson,'$.hubState.x',135) WHERE playerId IN ('gm','p2')")
            assert [peer["id"] for peer in route("presence", gm, x=135, y=95)[1]["peers"]] == ["p"]
            assert [peer["id"] for peer in route("presence", other, x=135, y=95)[1]["peers"]] == ["p"]
            assert [peer["id"] for peer in route("presence", player, x=125, y=95)[1]["peers"]] == ["p2"]
            with sqlite3.connect(db) as conn:
                assert conn.execute("SELECT version,json_extract(playerJson,'$.hubState.x') FROM campaign_players WHERE playerId='p'").fetchone() == (1,105)
            assert storage(token=gm)[1]["contents"] is None
            assert storage("withdraw", token=gm, amount=1, operationId="operation_forbidden")[0] == 403
            assert storage("deposit", token=gm, amount=10, operationId="operation_blind_deposit")[1]["contents"] is None
            assert storage("deposit", amount=11, operationId="operation_exceed_credits")[0] == 400
            action = dict(amount=5, operationId="operation_same_request")
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                replies = list(pool.map(lambda _: storage("deposit", **action), range(2)))
            assert all(status == 200 and reply["player"]["credits"] == 35 for status, reply in replies), replies
            assert storage()[1]["contents"]["credits"] == 15
            assert storage("deposit", itemId="ammo", amount=11, operationId="operation_no_cells")[0] == 400
            status, reply = storage("deposit", itemId="ammo", amount=10, operationId="operation_ammo_stack")
            assert status == 200 and reply["contents"]["cells"] == 2, reply
            selection = dict(itemId="rifle", amount=1, instanceIds=["rifle-original"], operationId="operation_store_rifle")
            status, reply = storage("deposit", box="personal", **selection)
            assert status == 200 and reply["contents"]["items"][0]["instancesV215"][0]["id"] == "rifle-original", reply
            assert storage("deposit", box="personal", **selection)[0] == 200
            assert storage("deposit", box="personal", **{**selection, "instanceIds":["rifle-other"]})[0] == 400
            assert not storage(token=gm, box="personal")[1]["contents"]["items"]
            status, reply = storage("withdraw", box="personal", itemId="rifle", amount=1,
                                    instanceIds=["rifle-original"], operationId="operation_take_rifle")
            rifle = next(row for row in reply["player"]["inventory"] if row["itemId"] == "rifle")
            assert status == 200 and {copy["id"]:copy["durability"] for copy in rifle["instancesV215"]} == {
                "rifle-original":3, "rifle-other":9}, reply
        except Exception:
            log.seek(0)
            print(log.read()[-12000:])
            raise
        finally:
            process.terminate()
            process.wait(timeout=5)

print("Hub storage, idempotent transfers, copies and transient visibility verified")
