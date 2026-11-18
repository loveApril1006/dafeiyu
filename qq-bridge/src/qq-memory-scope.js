import path from 'node:path';
import crypto from 'node:crypto';

export const QQ_MEMORY_SCOPE_VERSION = 'qq-memory-workspace-v1';
// A workspace is also Mnemon's storage boundary. Never share one between QQ channels.
export function qqMemoryWorkspace(base, key) {
  const match = /^(group|private):\d+$/.exec(String(key));
  if (!match) throw new Error('无效 QQ 记忆范围');
  return path.join(path.resolve(base), 'qq-memory-channels', match[1] + '-' + crypto.createHash('sha256').update(key).digest('hex'));
}
