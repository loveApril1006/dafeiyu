// Separate live preset: no inherited tool schemas and no executable tools, including QQ/MCP.
export const name='xiaoge-live-text-only';
export const inject=['tools'];
export function apply(ctx){
  ctx.tools.restrict({allow:[]});
  ctx.tools.guard(()=> '直播回合仅生成文字，不允许调用任何工具');
}
