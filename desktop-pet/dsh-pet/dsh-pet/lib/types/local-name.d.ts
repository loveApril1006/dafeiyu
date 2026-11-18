import { type ConfigPaths } from './config';
/** Rename one instance in its owning layer; retain its id, other pets and fine-tuned settings. */
export declare function renamePet(paths: ConfigPaths, id: string, value: unknown): Promise<string>;
