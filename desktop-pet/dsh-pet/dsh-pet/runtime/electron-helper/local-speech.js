/* Desktop-only playback: a new cue cancels the old one; show its text when audio starts. */
window.XiaogeSpeech = (() => {
  const pending = new Map();
  function cancel(id, reason = 'cancelled') {
    const current = pending.get(id);
    if (!current) return;
    pending.delete(id);
    current.report(reason);
    clearTimeout(current.timer);
    current.audio.pause();
    current.audio.removeAttribute('src');
    current.audio.load();
  }
  function deliver(sprite, said, id, base) {
    cancel(sprite.pet.id);
    const show = (duration) => sprite.showWhisper(said.text, said.image, said.url, duration ?? said.duration, said.anim);
    if (!/^[a-f0-9-]{36}\.wav$/.test(id || '') || said.duration === 0) { show(); return; }
    const audio = new Audio(base + '/speech/' + id);
    const report = (status) => { if (typeof fetch === 'function') fetch(base + '/speech/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }).catch(() => {}); };
    const current = { audio, timer: null, report };
    pending.set(sprite.pet.id, current);
    let shown = false;
    const reveal = () => {
      if (pending.get(sprite.pet.id) !== current || shown) return;
      shown = true;
      report('playing');
      clearTimeout(current.timer);
      show(Math.max(said.duration ?? 10000, Number.isFinite(audio.duration) ? audio.duration * 1000 + 1500 : 10000));
    };
    const fallback = () => { if (pending.get(sprite.pet.id) !== current) return; reveal(); cancel(sprite.pet.id, 'error'); };
    current.timer = setTimeout(fallback, 8000);
    audio.addEventListener('playing', reveal, { once: true });
    audio.addEventListener('error', fallback, { once: true });
    audio.addEventListener('ended', () => { if (pending.get(sprite.pet.id) === current) cancel(sprite.pet.id, 'ended'); }, { once: true });
    audio.play().catch(fallback);
  }
  window.addEventListener('beforeunload', () => { for (const id of [...pending.keys()]) cancel(id); });
  return { deliver, cancel };
})();

