import crypto from 'node:crypto';

const fields = {
  send: ['maxSendPerMinute', 'maxSendPerHour', 'burstMaxMessages', 'maxMessageChars'],
  voice: ['maxPerMinute', 'maxPerHour']
};

// Only these fields cross the settings boundary; never expose the rest of config.json.
export function sendLimitsSnapshot(social = {}) {
  const value = Object.fromEntries(Object.entries(fields).map(([group, names]) => [group,
    Object.fromEntries(names.map(name => [name, Number(social[group]?.[name]) || 0]))
  ]));
  return { revision: crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'), ...value };
}

export function validateSendLimits(input, current) {
  if (!input || input.revision !== current.revision) {
    throw Object.assign(new Error('发送限制已更新，请刷新页面后再保存'), { status: 409 });
  }
  const result = {};
  for (const [group, names] of Object.entries(fields)) {
    result[group] = {};
    for (const name of names) {
      const value = input[group]?.[name];
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) {
        throw new Error('发送限制请填写 0～1000000000 的整数，0 表示不限');
      }
      result[group][name] = value;
    }
  }
  return result;
}
