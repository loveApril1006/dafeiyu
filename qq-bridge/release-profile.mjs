// Installed by the release; existing installations keep their own preferences.
import fs from 'node:fs';
import path from 'node:path';
import {applyPortableSettings} from './src/portable-settings.js';
import {upgradePortableSettings} from './src/portable-settings-upgrade.js';
export const PROFILE_VERSION=27;
export function migrateReleaseProfile(root,{fresh=false,addMissing=false}={}){
 if(!fresh&&!addMissing)return {changed:false,preservedExisting:true,profileVersion:PROFILE_VERSION};
 const settings=JSON.parse(fs.readFileSync(path.join(root,'qq-bridge/packaging/default-settings.json'),'utf8').replace(/^\uFEFF/,''));
 if(!fresh)return {...upgradePortableSettings(root,settings),profileVersion:PROFILE_VERSION};
 return {...applyPortableSettings(root,settings,{fresh:true}),profileVersion:PROFILE_VERSION};
}
