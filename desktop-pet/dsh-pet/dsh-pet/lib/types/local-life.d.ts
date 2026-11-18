export declare function closeLocalEmotion(): void;
/** Reuse the suite's single state engine without changing the desktop model/provider. */
export declare function localEmotion(root: string, petId: string, text?: string): Promise<{
    context: string;
    snapshot: {
        enabled: boolean;
        expression: {
            voiceProbability: number;
            stickerProbability: number;
            delayMs: number;
        };
    };
    autonomy: {
        allowed: boolean;
    };
    sent: () => void;
} | undefined>;
export declare function isLifeCommand(text: string): boolean;
export declare function localLife(root: string, text: string, request?: typeof fetch): Promise<{
    ok: true;
    text: string;
    image?: string;
} | undefined>;
/** Only explicit user/menu actions reach this owner-only management route. */
export declare function localWork(root: string, body?: Record<string, unknown>, request?: typeof fetch): Promise<Record<string, unknown>>;
