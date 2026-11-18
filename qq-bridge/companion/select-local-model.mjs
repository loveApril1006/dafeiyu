// Custom API providers may omit reasoning-effort capabilities entirely.
export async function selectLocalModel(api,unwrap,sessionId,dsh,signal){
  const selection={sessionId,provider:dsh.provider,model:dsh.model,reasoningEffort:'off'};
  try{return unwrap(await api.callUnary('session.selectModel',selection,signal),'session/selectModel');}
  catch(error){if(!/does not support reasoning effort|不支持.*推理/i.test(error.message))throw error;}
  delete selection.reasoningEffort;
  signal?.throwIfAborted();
  return unwrap(await api.callUnary('session.selectModel',selection,signal),'session/selectModel');
}
