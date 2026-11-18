// The SiliconFlow /models response currently omits input modalities. Only
// supplement exact IDs documented by the official service/model authors;
// explicit API metadata always takes precedence in provider-discovery.js.
// https://api-docs.siliconflow.cn/docs/userguide/capabilities/multimodal-vision
// https://github.com/deepseek-ai/DeepSeek-OCR
const siliconflowImages = new Set([
  'deepseek-ai/DeepSeek-OCR',
  'Qwen/Qwen2.5-VL-72B-Instruct',
  'Qwen/Qwen3-VL-8B-Instruct',
  'Qwen/Qwen3-VL-8B-Thinking',
  'Qwen/Qwen3-VL-30B-A3B-Instruct',
  'Qwen/Qwen3-VL-30B-A3B-Thinking',
  'Qwen/Qwen3-VL-32B-Instruct',
  'Qwen/Qwen3-VL-32B-Thinking'
]);

export function documentedImageHint(baseUrl,id) {
  let url;
  try { url = new URL(baseUrl); } catch { return null; }
  if (url.origin !== 'https://api.siliconflow.cn' || url.pathname.replace(/\/+$/,'') !== '/v1' || !siliconflowImages.has(id)) return null;
  return {
    supportsImages:true,
    imageCapabilitySource:'official-docs',
    ...(id === 'deepseek-ai/DeepSeek-OCR' ? {visionNote:'文字识别专用；抖音画面理解建议选择 Qwen-VL 等通用视觉模型'} : {})
  };
}
