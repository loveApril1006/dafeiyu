import { unwrap } from '../qq-bridge/src/dsh-client.js';
import { getDshConnection } from './dsh-connection.mjs';
import { waitForPetBundle, checkPetApplication, waitForPetRoute } from './pet-startup.mjs';
try {
  const { api, baseUrl, cookie } = await getDshConnection();
  await waitForPetBundle(async () => unwrap(await api.callUnary('pluginManager.listBundles', {}), 'pluginManager/listBundles'));
  const set = async enabled => checkPetApplication(unwrap(await api.callUnary('pluginManager.setBundleEnabled', { name: 'dsh-pet', enabled }), 'pluginManager/setBundleEnabled'));
  if (process.argv.includes('--stop')) {
    await set(false);
    console.log('桌宠插件已关闭，QQ 和语音后台保持运行。');
    process.exit(0);
  }
  if (process.argv.includes('--reload')) await set(false);
  await set(true);
  await waitForPetRoute(async () => {
    const response = await fetch(new URL('/dsh-pet-7340/state', baseUrl), { headers: { cookie }, signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    const state = await response.json();
    return Number.isFinite(state.counter) && Object.hasOwn(state, 'sections') && Object.hasOwn(state, 'pets');
  });
  console.log('dsh-pet 插件已加载。');
} catch (error) {
  console.error(String(error.message || error).replace(/([?&]token=)[^\s&]+/gi, '$1[隐藏]').slice(0,2000));
  process.exitCode = 1;
}
