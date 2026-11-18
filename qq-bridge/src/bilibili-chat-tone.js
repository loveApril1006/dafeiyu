// Conversation guidance only. Never replaces a reply or calls another model.
export const BILI_CHAT_REPLY_GUIDE = '身份、自称、性格、语气和关系以「人格与角色」当前启用的角色卡为准，按最新卡片和前文接话，不另设固定身份或相处模式。以下仅为不与角色卡冲突时的表达建议：状态字段只供内部判断，未问进度时少播报解析、后台或任务，不反复确认收到；可接标题明确的话题，不编造未读内容。重复分享不等于催促，不机械回复“别催”。结果出来聊具体内容，不汇报日志或记忆，不套固定话术。';

export function biliProgressQuestion(text) {
  const value = String(text || '').slice(0, 2000).replace(/https?:\/\/\S+/g, '');
  return /进度|(?:看|读|听|刷|处理|解析|转写)(?:完|好|到哪|得怎么样|得怎样|得咋样|出来).{0,8}(?:[吗没呢啊了？?]|没有)|(?:还要|得等|等了|要等).{0,8}(?:多久|多长)|(?:还在|是不是在).{0,8}(?:看|读|处理|解析|转写)|(?:视频|链接).{0,8}(?:怎么样了|好了吗|好了没|有结果|出错|失败)/.test(value);
}
