export interface ScreenModel {
    provider: string;
    model: string;
}
export interface ScreenSettings {
    enabled: boolean;
    interval: number;
    model: ScreenModel | null;
}
export declare function petName(value: unknown): string;
export declare function createScreenCompanion(root: string): {
    snapshot: () => {
        busy: boolean;
        status: string;
        lastAt: number;
        requestId: number;
        openId: number;
        runtime: Record<string, unknown>;
        enabled: boolean;
        interval: number;
        model: ScreenModel | null;
    };
    look: () => number;
    open: () => number;
    runtime(value: unknown): void;
    configure(value: unknown): {
        busy: boolean;
        status: string;
        lastAt: number;
        requestId: number;
        openId: number;
        runtime: Record<string, unknown>;
        enabled: boolean;
        interval: number;
        model: ScreenModel | null;
    };
    observe(key: unknown): void;
    dispose: () => void;
    comment(input: unknown, options: {
        generate(image: string, model: ScreenModel, recent: string[], signal: AbortSignal): Promise<string>;
        voice(text: string): Promise<Record<string, unknown>>;
        deliver(text: string, voice: Record<string, unknown>): void;
        foreground(): boolean;
        foregroundVersion?: () => number;
        now?: () => number;
    }): Promise<{
        ok: boolean;
        skipped: string;
        message?: undefined;
        text?: undefined;
    } | {
        ok: boolean;
        message: string;
        skipped?: undefined;
        text?: undefined;
    } | {
        ok: boolean;
        text: string;
        skipped?: undefined;
        message?: undefined;
    }>;
};
export declare function generateScreenComment(ctx: {
    llm?: unknown;
    get?: (name: string, required?: boolean) => unknown;
}, image: string, model: ScreenModel, system: string, recent: string[], signal: AbortSignal, probe?: boolean): Promise<string>;
