// This private IPC belongs only to the pond child created by model-engine.mjs.
if(process.connected){
  const stop=()=>{if(process.listenerCount('SIGTERM'))process.emit('SIGTERM');};
  process.on('message',message=>{if(message?.type==='xiaoge-pond-stop')stop();});
  process.once('disconnect',stop);
}
