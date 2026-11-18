import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../bili-standalone/node_modules/esbuild/lib/main.js';
const here=path.dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[path.join(here,'image-adapters.ts')],bundle:true,platform:'node',format:'esm',target:'node22',outfile:path.join(here,'dist/image-adapters.mjs'),legalComments:'eof',external:['../../../src/creative-provider-fetch.js'],plugins:[{name:'scoped-provider-network',setup(builder){builder.onLoad({filter:/image-gen-upstream[\\/]src[\\/](?:openai-compatible|google|dashscope|comfyui)\.ts$/},async({path:source})=>{let text=fs.readFileSync(source,'utf8');if(path.basename(source)==='openai-compatible.ts'){const marker='return downloadImage(image.url, provider, input)';if(text.split(marker).length!==2)throw Error('Upstream image receipt boundary changed');text=text.replace(marker,"await preserveImageResult(image.url, response.headers.get('x-siliconcloud-trace-id'), (payload as any)?.timings)\n  "+marker);}return {loader:'ts',contents:"import {creativeProviderFetch as fetch,preserveImageResult} from '../../../src/creative-provider-fetch.js';\n"+text};});}}]});
console.log('Upstream image provider adapters built.');
