// Offline integration with the installed Harness runtime. No live sessions,
// model calls, QQ messages, or project files are read or changed.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {apply} from '../plugins/qq-agent-presets/harness-isolated.mjs';
const base=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai');
const load=name=>import(pathToFileURL(path.join(base,name,'lib/index.js')).href);
const [{Context},{default:SystemPrompt},{ToolRuntime,defineTool},{createScope,scopeTarget}]=await Promise.all([load('cordis'),load('dsh-system-prompt'),load('dsh-tools'),load('dsh-scope')]);
const ctx=new Context();
let preset,worker,other;
try{
 new SystemPrompt(ctx,{includeHarnessIdentity:false,includeRuntimeContext:false});
 new ToolRuntime(ctx,{mode:'native',maxParallelSubCalls:1});
 for(const name of ['pwsh','read','mcp__fixture'])ctx.tools.register(defineTool({name,description:'fixture only',parameters:{},output:{schema:{type:'string'},render:(_,v)=>[{type:'text',text:v}]},execute:async()=>{throw Error('No fixture body may run');}}));
 const parent={};preset=createScope(ctx,parent);await apply(preset.ctx);
 const agent={id:'fixture-worker',session:{id:'fixture-worker',header:{cwd:'fixture'}}};worker=createScope(ctx,agent,{parent});agent.ctx=worker.ctx;
 await ctx.serial(scopeTarget(agent,agent),'agent/created',{agent,source:'startup'});
 assert.deepEqual(ctx.tools.schemas(agent).map(x=>x.name),['harness_project']);
 assert(ctx.tools.guardReason({name:'pwsh',agent}));assert(ctx.tools.guardReason({name:'harness_project',agent}),'no capability means no execution');
 for(const name of ['pwsh','read','mcp__fixture'])assert.equal(ctx.tools.resolveExecution(name,agent,false),undefined);
 const otherKey={};other=createScope(ctx,otherKey);assert.equal(ctx.tools.get('harness_project',otherKey),undefined);assert(ctx.tools.get('pwsh',otherKey));
 console.log(JSON.stringify({nativeToolRegistryVerified:true,workerTools:['harness_project'],inheritedToolsHidden:true,otherScopesUnchanged:true,modelCalls:0,qqMessages:0}));
}finally{await other?.dispose();await worker?.dispose();await preset?.dispose();await ctx.stop?.();}
