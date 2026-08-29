export interface GameDebugPlayerState {
    alive: boolean;
    x: number;
    y: number;
}

export interface GameDebugState {
    ready: boolean;
    scene: string | null;

    player: GameDebugPlayerState | null;

    score: number;

    entities: Record<string, number>;

    game_over: boolean;
}

export interface DebugError {
    message: string;
    source?: string;
}

const EMPTY_STATE: GameDebugState = {
    ready: false,
    scene: null,
    player: null,
    score: 0,
    entities: {},
    game_over: false
};

export class DebugService {
    private stateProvider:
        (() => GameDebugState) | null = null;

    private readonly errors: DebugError[] = [];

    setStateProvider(
        provider: () => GameDebugState
    ): () => void {
        this.stateProvider = provider;

        return () => {
            if (this.stateProvider === provider) {
                this.stateProvider = null;
            }
        };
    }

    getState(): GameDebugState {
        return this.stateProvider?.() ?? EMPTY_STATE;
    }

    reportError(error: DebugError): void {
        this.errors.push(error);
    }

    getErrors(): readonly DebugError[] {
        return [...this.errors];
    }

    clearErrors(): void {
        this.errors.length = 0;
    }
}