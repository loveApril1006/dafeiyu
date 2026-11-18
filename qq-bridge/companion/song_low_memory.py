"""Layer offload for the bundled 2B turbo model; no upstream source patches."""
from contextlib import contextmanager
from types import MethodType
import gc
import os


def trim_own_working_set():
    if os.name == 'nt':
        import ctypes
        # Only this worker: release inactive mapped checkpoint pages so Windows
        # need not keep the old CPU weight pages resident while loading VAE/text.
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        ctypes.windll.psapi.EmptyWorkingSet(ctypes.c_void_p(handle))


def enable_layer_offload(handler, offload_home):
    import torch
    from accelerate import disk_offload
    from pathlib import Path

    original_vae_dtype = handler._get_vae_dtype
    original_load_main = handler._load_main_model_from_checkpoint
    prepared = False
    cpu_states = {}

    def prepare():
        nonlocal prepared
        if prepared:
            return
        layers = handler.model.decoder.layers
        if not layers:
            raise RuntimeError('Bundled decoder has no offloadable layers')
        # SSD-backed weights can be evicted by Windows instead of occupying
        # several GiB of private RAM alongside the application and voice server.
        for number, layer in enumerate(layers):
            disk_offload(layer, offload_dir=str(Path(offload_home)/('layer-'+str(number))),
                         execution_device=torch.device(handler.device), offload_buffers=True)
            if number % 4 == 3:
                trim_own_working_set()
        for name, module in handler.model.named_children():
            if name != 'decoder':
                disk_offload(module, offload_dir=str(Path(offload_home)/name),
                             execution_device=torch.device(handler.device), offload_buffers=True)
        prepared = True
        gc.collect()
        trim_own_working_set()
        print('SONG_LOW_MEMORY disk-backed-layer-offload '+str(len(layers)), flush=True)

    def transfer(module, device):
        key = id(module)
        if device != 'cpu':
            if key not in cpu_states:
                cpu_states[key] = module.state_dict()
            module.to(device=device, dtype=handler.dtype)
        elif key in cpu_states:
            # Keep the original CPU tensors instead of copying weights back
            # from CUDA. This also avoids a native Windows D2H failure in the
            # bundled torch during threaded text-encoder offloading.
            module.to_empty(device='meta')
            module.load_state_dict(cpu_states[key], assign=True)

    def move_non_layers(device):
        model = handler.model
        for parameter in model.parameters(recurse=False):
            parameter.data = parameter.data.to(device=device, dtype=handler.dtype)
        for name, buffer in model.named_buffers(recurse=False):
            model._buffers[name] = buffer.to(device)
        # Encoder/tokenizer/detokenizer have their own on-demand hooks.
        for name, module in model.decoder.named_children():
            if name != 'layers':
                transfer(module, device)
        for parameter in model.decoder.parameters(recurse=False):
            parameter.data = parameter.data.to(device=device, dtype=handler.dtype)
        for name, buffer in model.decoder.named_buffers(recurse=False):
            model.decoder._buffers[name] = buffer.to(device)
        if hasattr(handler, 'silence_latent'):
            handler.silence_latent = handler.silence_latent.to(device=device, dtype=handler.dtype)

    @contextmanager
    def low_context(self, model_name):
        nonlocal prepared
        if model_name != 'model':
            module = getattr(self, model_name)
            transfer(module, self.device)
            try:
                yield
            finally:
                torch.cuda.synchronize()
                transfer(module, 'cpu')
                gc.collect()
                torch.cuda.empty_cache()
            return
        if not prepared:
            prepare()
        move_non_layers(self.device)
        try:
            yield
        finally:
            torch.cuda.synchronize()
            move_non_layers('cpu')
            gc.collect()
            torch.cuda.empty_cache()

    def storage_vae_dtype(self, device=None):
        # The VAE computes on CUDA; retain half precision during CPU storage.
        if device == 'cpu':
            return self.dtype
        return original_vae_dtype(device)

    def load_and_offload(self, **kwargs):
        previous_dtype = torch.get_default_dtype()
        try:
            torch.set_default_dtype(self.dtype)
            result = original_load_main(**kwargs)
            prepare()
            return result
        finally:
            torch.set_default_dtype(previous_dtype)

    handler._load_model_context = MethodType(low_context, handler)
    handler._get_vae_dtype = MethodType(storage_vae_dtype, handler)
    handler._load_main_model_from_checkpoint = MethodType(load_and_offload, handler)
    handler._song_prepare_offload = prepare
