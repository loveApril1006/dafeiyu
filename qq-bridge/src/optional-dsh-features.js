// Presentation only: enabled state always comes from DSH's plugin manager.
export const OPTIONAL_DSH_FEATURES = Object.freeze({
  'dsh-mnemon': {
    title:'长期记忆 · Mnemon',
    description:'保存用户偏好与长期信息，按工作区读取记忆。关闭后保留数据。',
    cost:'记忆会占用输入 token；初始关闭空闲自动审查、技能自进化和 Git 同步。召回默认 3 条，工作记忆 4 KB、用户画像 1 KB。容量整理仍可能调用模型。',
    scope:'QQ 记忆按群和私聊隔离；新会话使用独立工作区。只开放记忆读写，不开放文件或插件管理。'
  },
  'dsh-context': {
    title:'上下文与用量 · Context',
    description:'查看 DSH 会话的上下文组成、使用量与缓存情况。',
    cost:'统计与展示本身不额外调用模型；它不会自动压缩上下文或保证节省 token。',
    scope:'DSH 会话中查看详细统计；机器人后台原有用量统计继续保留。'
  },
  'dsh-vision-router': {
    title:'视觉识图 · Vision Router',
    description:'为文字模型提供图片理解，原生视觉模型也可按需补充识图。',
    cost:'识图会发起视觉请求，并把结果带入后续上下文。初始关闭自动首轮识图与桌面截图，使用缓存和快速识图，每回合最多 2 次视觉调用。',
    scope:'QQ 仅允许识别本会话已上传的图片，不允许本地路径和桌面截图。默认视觉链使用上游预置的云端服务。'
  },
  '@liustack/modsearch': {
    title:'联网搜索 · ModSearch',
    description:'开启后接管 QQ 的只读联网搜索；关闭后恢复原有搜索。',
    cost:'按需搜索；QQ 最多返回 5 条、每条摘要 500 字符，并缓存 5 分钟。搜索服务的免费额度与模型 token 分开计算。',
    scope:'只接入网页搜索；网页抓取仍经过机器人的公网地址检查，不开放任意命令。'
  }
});
