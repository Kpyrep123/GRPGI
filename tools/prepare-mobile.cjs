// Android uses the maintained web client, not the historical mobile/www snapshot.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'mobile/generated-www');
fs.rmSync(destination, {recursive:true,force:true});
fs.cpSync(path.join(root,'deploy/site/app'), destination, {recursive:true,filter:src=>path.basename(src)!=='runtime-config.js'});
fs.writeFileSync(path.join(destination,'runtime-config.js'), 'window.GRPG_WEB_RUNTIME = {};\n');
const index=path.join(destination,'index.html');
fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('data-client="web"','data-client="android"').replace('data-cloud-only="true"','data-cloud-only="false"').replace('data-hide-combat="true"','data-hide-combat="false"'));
console.log('Android web assets prepared from deploy/site/app');
