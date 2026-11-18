// Install the requested optional bundles through the running engine, initially disabled.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {NodeApiClient,unwrap} from '../src/dsh-client.js';
import {getDshConnection} from '../../desktop-pet/dsh-connection.mjs';
const packages=[['dsh-mnemon','0.5.34'],['dsh-context','0.76.0'],['dsh-vision-router','3.1.0'],['@liustack/modsearch','5.10.10']];
const {baseUrl}=await getDshConnection();
const api=new NodeApiClient(baseUrl,240000,{});
const profile=path.join(process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),'profiles/desktop');
const backup=path.resolve('state/optional-plugin-backups',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(backup,{recursive:true});
for(const file of ['package.json','cordis.patch.yml','pnpm-lock.yaml'])if(fs.existsSync(path.join(profile,file)))fs.copyFileSync(path.join(profile,file),path.join(backup,file));
for(const [name,version] of packages){
 const rows=unwrap(await api.callUnary('pluginManager.listBundles',{}),'pluginManager/listBundles');
 const installed=rows.find(row=>row.name===name&&['profile','installation'].includes(row.availability));
 if(installed){console.log(JSON.stringify({name,installed:true,version:installed.version,enabled:installed.enabled}));continue;}
 console.log('Installing '+name+'@'+version+' (disabled)');
 const result=unwrap(await api.callUnary('pluginManager.installBundle',{spec:name+'@'+version,options:{enabled:false,saveExact:true,requestId:'xiaoge-optional-'+name.replace(/[^a-z0-9]/g,'-')}}),'pluginManager/installBundle');
 fs.writeFileSync(path.join(backup,name.replace(/[^a-z0-9]/g,'-')+'-result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({name,changed:result.changed,application:result.application,error:result.error,version:result.version,pendingBuilds:result.pendingBuilds,exitCode:result.packageResult?.exitCode}));
 if(result.error||result.packageResult?.exitCode)process.exit(1);
}
