// Reuse the actual upstream provider implementations without registering a DSH bundle.
export {generateOpenAICompatibleImage,editOpenAICompatibleImage} from '../image-gen-upstream/src/openai-compatible.js';
export {generateComfyUIImage,editComfyUIImage} from '../image-gen-upstream/src/comfyui.js';
export {generateGoogleImage,editGoogleImage} from '../image-gen-upstream/src/google.js';
export {generateDashScopeImage,editDashScopeImage} from '../image-gen-upstream/src/dashscope.js';
export {searchInspirationCases,BUNDLED_INSPIRATION_CATALOG} from '../image-gen-upstream/src/inspiration.js';
