// Never repair and execute a model's malformed arguments. Retry the failed
// conversation once only when a complete event stream proves no tool ran.
export function isToolJsonFailure(error) {
  return /^DeepSeek Messages stream: tool input is invalid JSON\s*$/.test(String(error?.message ?? error ?? ''));
}

export function createToolJsonRecovery() {
  const turns = new Map();
  const failures = new Map();
  function observe(sessionId, event) {
    if (event?.type === 'turn/start') turns.set(sessionId, { turn: event.data?.turn, toolCalled: false });
    else if (event?.type === 'tool/call' && turns.has(sessionId)) turns.get(sessionId).toolCalled = true;
  }
  function finish(sessionId, ended) {
    const turn = turns.get(sessionId);
    turns.delete(sessionId);
    return { noTools: !!turn && turn.turn === ended.turn && !turn.toolCalled };
  }
  function fail(key, seq, { noTools = false, hasText = false } = {}) {
    const previous = failures.get(key);
    const state = previous?.seq === seq ? previous : { seq, retries: 0, notified: false };
    const retry = noTools && !hasText && state.retries === 0;
    if (retry) state.retries++;
    state.retryReady = retry;
    const notify = !retry && !state.notified;
    if (notify) state.notified = true;
    failures.set(key, state);
    return { retry, notify };
  }
  function allows(key, seq, reason, consume = false) {
    const state = failures.get(key);
    if (!state) return reason !== 'toolJsonRetry'; // Drop stale retry timers.
    if (seq > state.seq || reason === 'admin') {
      failures.delete(key); // A new user message or explicit manual wake may resume.
      return true;
    }
    if (reason !== 'toolJsonRetry' || !state.retryReady) return false;
    if (consume) state.retryReady = false;
    return true;
  }
  return {
    observe, finish, fail, allows,
    complete: key => failures.delete(key),
    forget(key, sessionId) { failures.delete(key); turns.delete(sessionId); },
    disconnect() { turns.clear(); }, // Incomplete evidence must never authorize retry.
  };
}
