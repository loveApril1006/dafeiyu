export const douyinModelProfile=Object.freeze({
  provider:'xiaoge-douyin-siliconflow',providerName:'硅基流动',
  model:'Qwen/Qwen3-VL-8B-Instruct',baseUrl:'https://api.siliconflow.cn/v1',
  api:'openai-completions',registerUrl:'https://cloud.siliconflow.cn/i/HtBsfZYI',
});
export const fixedDouyinSelection=()=>({provider:douyinModelProfile.provider,model:douyinModelProfile.model});
