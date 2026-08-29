import type { EventBus } from "../events/EventBus.js";

export interface ScoreChangedEvent {
    value: number;
}

export class ScoreService {
    private value = 0;

    constructor(
        private readonly events: EventBus
    ) {}

    get(): number {
        return this.value;
    }

    set(value: number): void {
        if (value === this.value) {
            return;
        }

        this.value = value;

        this.events.emit<ScoreChangedEvent>(
            "score.changed",
            {
                value: this.value
            }
        );
    }

    add(amount: number): void {
        this.set(
            this.value + amount
        );
    }

    reset(): void {
        this.set(0);
    }
}