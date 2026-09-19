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
        const handlers = this.listeners.get(event);

        if (!handlers) {
            return;
        }

        // Create a snapshot of the current listeners to ensure stable dispatch.
        // This prevents mutations during emit from affecting the current event.
        const handlerArray = Array.from(handlers);

        for (const handler of handlerArray) {
            handler(payload);
        }
    }

    clear(): void {
        this.listeners.clear();
    }
}