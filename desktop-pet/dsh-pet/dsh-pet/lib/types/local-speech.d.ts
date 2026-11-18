export declare function createLocalSpeech(root: string, warn?: (message: string) => void, request?: typeof fetch): {
    settings: () => {
        enabled: boolean;
    };
    voices: () => Promise<{
        selected: string;
        voices: {
            id: string;
            name: string;
        }[];
    }>;
    selectVoice(voice: string): Promise<{
        selected: string;
        voices: {
            id: string;
            name: string;
        }[];
    }>;
    status(id: string): {
        status: string;
        at: number;
    } | null;
    report(id: string, status: string): boolean;
    configure(enabled: boolean): {
        enabled: boolean;
    };
    file(id: string): string | undefined;
    prepare(text: string, foreground?: boolean): Promise<{
        speech?: string;
    }>;
};
/** Compare normalized recent phrases, including small wording changes. */
export declare function repeatedPhrase(text: string, recent: string[]): boolean;
