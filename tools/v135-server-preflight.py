
import pathlib,tarfile,urllib.request,hashlib,platform,subprocess,os,sys
stage=pathlib.Path(sys.argv[1]);stage.mkdir(parents=True,exist_ok=False)
with tarfile.open('/tmp/grpgi-v135-tests.tgz') as archive:
    archive.extractall(stage,filter='data')
assert platform.machine()=='x86_64'
version='v24.16.0';name='node-'+version+'-linux-x64.tar.xz'
url='https://nodejs.org/dist/'+version+'/'
checks=urllib.request.urlopen(url+'SHASUMS256.txt',timeout=30).read().decode()
expected=next(line.split()[0] for line in checks.splitlines() if line.split()[-1]==name)
binary=stage/name
with urllib.request.urlopen(url+name,timeout=30) as response,open(binary,'wb') as out:
    import shutil
    shutil.copyfileobj(response,out)
assert hashlib.sha256(binary.read_bytes()).hexdigest()==expected,'Node checksum mismatch'
with tarfile.open(binary) as archive:
    archive.extractall(stage,filter='data')
node=stage/('node-'+version+'-linux-x64')/'bin/node'
env=os.environ.copy();env['POCKETBASE_EXE']='/opt/pocketbase/pocketbase'
print('Running isolated tests with live PocketBase binary',flush=True)
result=subprocess.run([str(node),str(stage/'tests/v135-player-sync.integration.mjs')],cwd=stage,env=env,stdin=subprocess.DEVNULL)
if result.returncode==0:(stage/'preflight-passed').write_text('PocketBase 0.39.4 integration passed\n')
sys.exit(result.returncode)
