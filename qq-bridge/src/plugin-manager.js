// Console administration only; use the engine's persistent management API.
import {OPTIONAL_DSH_FEATURES} from './optional-dsh-features.js';
const fail = (message, statusCode = 400) => { const error = new Error(message); error.statusCode = statusCode; throw error; };
const localized = (value, fallback = '') => typeof value === 'string' ? value : value?.zh || value?.en || fallback;
const featureEntry = {'dsh-mnemon':'mnemon','dsh-context':'dsh-context','dsh-vision-router':'vision-router','@liustack/modsearch':'modsearch'};
export async function listDshPlugins(rpc) {
  const [bundles, plugins] = await Promise.all([rpc('pluginManager.listBundles', {}), rpc('pluginManager.listPlugins', {})]);
  return { ok:true,
    bundles:bundles.filter(row => row.availability === 'installation' || row.availability === 'profile').map(row => ({
      id:row.name, title:localized(row.meta?.title, row.name), description:localized(row.meta?.description, row.description),
      version:row.version || '', enabled:row.enabled === true, readOnlyReason:row.readOnlyReason || '',
      problem:row.error?.code || '', source:row.availability,
      ...(OPTIONAL_DSH_FEATURES[row.name] ? {feature:OPTIONAL_DSH_FEATURES[row.name],title:OPTIONAL_DSH_FEATURES[row.name].title,description:OPTIONAL_DSH_FEATURES[row.name].description,
        phase:plugins.find(plugin => plugin.entryId?.replace(/^include:/,'') === featureEntry[row.name])?.fiberPhase || ''} : {})
    })),
    plugins:plugins.map(row => ({id:row.entryId, moduleName:row.moduleName, title:localized(row.meta?.title, row.moduleName),
      description:localized(row.meta?.description), enabled:row.enabled === true, phase:row.fiberPhase || '',
      readOnlyReason:row.readOnlyReason || ''}))
  };
}
let changing = false;
export async function setDshPluginEnabled(rpc, input) {
  if (!['bundle','plugin'].includes(input.kind) || typeof input.id !== 'string' || !input.id || input.id.length > 512 || typeof input.enabled !== 'boolean') fail('插件类型、标识或启停状态无效');
  if (changing) fail('另一个插件操作正在进行，请稍后刷新', 409);
  changing = true;
  try {
    const inventory = await listDshPlugins(rpc);
    const row = inventory[input.kind === 'bundle' ? 'bundles' : 'plugins'].find(row => row.id === input.id);
    if (!row) fail('该插件不在已安装列表中，请刷新', 404);
    if (row.readOnlyReason) fail('该组件由 DSH 保护或无法单独管理', 403);
    if (row.problem) fail('该插件存在加载问题，请在 DSH 中检查', 409);
    const args = input.kind === 'bundle' ? {name:input.id,enabled:input.enabled} : {id:input.id,enabled:input.enabled};
    const result = await rpc(input.kind === 'bundle' ? 'pluginManager.setBundleEnabled' : 'pluginManager.setPluginEnabled', args);
    const messages = {applied:'插件设置已保存并生效', 'restart-required':'插件设置已保存，需要重启 DSH 才能生效', overridden:'插件设置受到更高优先级配置覆盖，请在 DSH 中检查'};
    if (result.error || !messages[result.application]) fail('DSH 未完成插件操作：' + (result.error?.code || result.application || '未知结果'), 409);
    return {ok:result.application !== 'overridden',application:result.application,changed:result.changed === true,message:messages[result.application]};
  } finally { changing = false; }
}
