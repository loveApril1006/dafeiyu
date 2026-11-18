// Safe launcher-facing read/probe. Credentials are never printed.
import path from 'node:path';
import {readOfficialSettings,officialPublicSettings} from './qq-bridge/src/official-qq-settings.js';
import {probeOfficialCredentials} from './qq-bridge/src/official-qq-client.js';
const [action,root]=process.argv.slice(2),bridgeRoot=path.join(path.resolve(root),'qq-bridge');
try{const settings=readOfficialSettings(bridgeRoot);if(action==='read')console.log(JSON.stringify(officialPublicSettings(settings)));else if(action==='probe'){if(!settings.enabled)throw Error('官方QQ模式尚未启用');console.log(JSON.stringify(await probeOfficialCredentials(bridgeRoot,settings)));}else throw Error('未知官方QQ操作');}
catch(error){console.log(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
