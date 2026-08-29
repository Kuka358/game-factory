export type EventHandler<T = unknown> = (
    payload: T
) => void;

export class EventBus {
    private readonly listeners =
        new Map<string, Set<EventHandler>>();

    on<T>(
        event: string,
        handler: EventHandler<T>
    ): () => void {
        let handlers = this.listeners.get(event);

        if (!handlers) {
            handlers = new Set();
            this.listeners.set(event, handlers);
        }

        handlers.add(
            handler as EventHandler
        );

        return () => {
            handlers.delete(
                handler as EventHandler
            );

            if (handlers.size === 0) {
                this.listeners.delete(event);
            }
        };
    }

    emit<T>(
        event: string,
        payload: T
    ): void {
        const handlers =
            this.listeners.get(event);

        if (!handlers) {
            return;
        }

        for (const handler of handlers) {
            handler(payload);
        }
    }

    clear(): void {
        this.listeners.clear();
    }
}