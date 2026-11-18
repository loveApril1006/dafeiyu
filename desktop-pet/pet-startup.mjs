export async function waitForPetBundle(list, { timeoutMs = 20000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const deadline = now() + timeoutMs;
  let lastError = '';
  do {
    try {
      const bundles = await list();
      if (!Array.isArray(bundles)) throw new Error('插件管理尚未返回有效列表');
      const pet = bundles.find(row => row.name === 'dsh-pet');
      if (pet) return pet;
      lastError = '当前DSH未注册dsh-pet插件，请检查本安装的插件配置和文件';
    } catch (error) { lastError = error.message || 'DSH插件管理尚未就绪'; }
    if (now() >= deadline) break;
    await sleep(Math.min(500, deadline - now()));
  } while (now() <= deadline);
  throw new Error('桌宠加载准备未完成：' + lastError);
}

export function checkPetApplication(result) {
  if (result.error || result.application === 'failed') throw new Error(result.error?.message || result.error?.code || 'DSH未能加载桌宠插件');
  if (result.application === 'restart-required') throw new Error('插件设置已保存，需要重启本安装的DSH聊天引擎才能加载桌宠');
  if (result.application !== 'applied') throw new Error('桌宠插件设置未生效：' + (result.application || '未知返回状态'));
  return result;
}

export async function waitForPetRoute(probe, { timeoutMs = 15000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const deadline = now() + timeoutMs;
  do {
    try { if (await probe()) return; } catch {}
    if (now() >= deadline) break;
    await sleep(Math.min(500, deadline - now()));
  } while (now() <= deadline);
  throw new Error('插件已启用，但桌宠接口尚未就绪；请检查logs/engine-error.log中的dsh-pet加载错误');
}
