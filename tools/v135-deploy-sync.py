
import pathlib,sys,tarfile,json,hashlib,shutil,sqlite3,subprocess,tempfile,os,time,urllib.request,urllib.error
stage=pathlib.Path(sys.argv[1]);bundle=pathlib.Path(sys.argv[2])
assert stage.parent==pathlib.Path('/opt/grpgi-releases') and stage.name.startswith('1.0.135-')
assert (stage/'preflight-passed').is_file(),'Server integration gate missing'
release=stage/'release';release.mkdir(exist_ok=False)
with tarfile.open(bundle) as archive:archive.extractall(release,filter='data')
manifest=json.loads((release/'release-manifest.json').read_text())
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,expected in manifest.items():assert digest(release/name)==expected,'Release checksum mismatch: '+name
assert (release/'web/app/player-sync-core.js').read_bytes()==(stage/'pocketbase/pb_hooks/grpgi_player_sync_core.js').read_bytes()
site=pathlib.Path('/var/www/grpg-app');pb=pathlib.Path('/opt/pocketbase')
assert digest(pb/'pb_hooks/grpgi_market.js')=='2af92bb4be05f73547378a075ac4109923219c70e25ca888c19a664f897e6e1e','Live hook changed since review'
assert digest(site/'app/app.js')=='c42316a200657915a46d0f8b5f3ee09f8218e9beabc1b47b52a702bb2a4f10d8','Live website changed since review'
metadata=json.loads((release/'downloads/release.json').read_text());assert metadata['version']=='1.0.135'
assert 'version: 1.0.134' in (site/'downloads/latest.yml').read_text(),'Published version changed'
runtime_digest=digest(site/'app/runtime-config.js')
installer=next(p for p in (release/'downloads').iterdir() if p.suffix=='.exe')
entries=[(installer,site/'downloads'/installer.name),(release/'downloads'/(installer.name+'.blockmap'),site/'downloads'/(installer.name+'.blockmap'))]
entries += [(release/'web/app'/name,site/'app'/name) for name in ['player-sync-core.js','app.js','index.html']]
entries += [(stage/'pocketbase/pb_hooks'/name,pb/'pb_hooks'/name) for name in ['grpgi_player_sync_core.js','grpgi_player_sync.js','grpgi_player_sync.pb.js','grpgi_market.js']]
entries += [(installer,site/'downloads/GRPGI-Setup-latest.exe'),(release/'downloads/release.json',site/'downloads/release.json'),(release/'downloads/latest.yml',site/'downloads/latest.yml')]
assert shutil.disk_usage(stage).free>sum(p.stat().st_size for p,_ in entries)*2+500000000,'Insufficient disk space for backup and deployment'
backup=stage/'backup';backup.mkdir(mode=0o700)
saved=[]
for source,dest in entries:
    entry={'destination':str(dest),'existed':dest.exists()}
    if dest.exists():
        copy=backup/'files'/str(dest).lstrip('/');copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dest,copy)
        entry['backup']=str(copy);entry['sha256']=digest(copy)
    saved.append(entry)
(backup/'files.json').write_text(json.dumps(saved,indent=2))
shutil.copytree(pb/'pb_hooks',backup/'pb_hooks')
print('BACKUP: original hooks, website and update metadata saved',flush=True)
def atomic_copy(source,dest):
    dest.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix=dest.name+'.v135-',dir=dest.parent);os.close(fd)
    try:shutil.copy2(source,tmp);os.chmod(tmp,0o644);os.replace(tmp,dest)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def service(action):subprocess.run(['systemctl',action,'pocketbase.service'],check=True,stdin=subprocess.DEVNULL,timeout=30)
def health():
    for attempt in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8090/api/health',timeout=2) as response:
                if response.status==200:return
        except Exception:pass
        time.sleep(.25)
    raise RuntimeError('PocketBase health check failed')
try:
    service('stop')
    with sqlite3.connect('file:'+str(pb/'pb_data/data.db')+'?mode=ro',uri=True) as source,sqlite3.connect(backup/'data.db') as target:
        source.backup(target)
        assert target.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    os.chmod(backup/'data.db',0o600)
    print('BACKUP: consistent database snapshot verified',flush=True)
    for source,dest in entries:atomic_copy(source,dest)
    service('start');health()
    request=urllib.request.Request('http://127.0.0.1:8090/api/grpgi/players/mutate',data=b'{}',headers={'Content-Type':'application/json'})
    try:
        urllib.request.urlopen(request,timeout=5)
        raise RuntimeError('Transactional endpoint unexpectedly allowed unauthenticated access')
    except urllib.error.HTTPError as error:assert error.code==401,'Transactional route did not load'
    with sqlite3.connect('file:'+str(pb/'pb_data/data.db')+'?mode=ro',uri=True) as connection:
        connection.execute('SELECT COUNT(*) FROM grpgi_player_operations_v135').fetchone()
    assert digest(site/'app/runtime-config.js')==runtime_digest,'Runtime configuration changed'
    for source,dest in entries:assert digest(source)==digest(dest),'Installed file mismatch: '+str(dest)
    (stage/'deployment-passed').write_text('1.0.135 deployed; database, hooks and website backup: '+str(backup))
    print('DEPLOYMENT PASSED: PocketBase, website and desktop release 1.0.135',flush=True)
    print('BACKUP LOCATION: '+str(backup),flush=True)
except BaseException:
    print('DEPLOYMENT FAILED: restoring original application files',flush=True)
    try:service('stop')
    except Exception:pass
    for entry in saved:
        dest=pathlib.Path(entry['destination'])
        if entry['existed']:atomic_copy(pathlib.Path(entry['backup']),dest)
        elif dest.exists():dest.unlink()
    service('start');health()
    raise
