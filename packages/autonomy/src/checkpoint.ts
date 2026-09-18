import type {
    CheckpointManager,
    CheckpointRef
} from "./providers.js";


export class MemoryCheckpointManager
    implements CheckpointManager
{
    private sequence =
        0;

    private readonly created:
        string[] = [];

    private readonly restored:
        string[] = [];

    private readonly released:
        string[] = [];


    async create(
        runId:
            string,

        iterationId:
            string
    ): Promise<CheckpointRef> {
        this.sequence +=
            1;

        const checkpoint = {
            id:
                `memory:${runId}:${iterationId}:${this.sequence}`
        };

        this.created.push(
            checkpoint.id
        );

        return checkpoint;
    }


    async restore(
        checkpoint:
            CheckpointRef
    ): Promise<void> {
        this.restored.push(
            checkpoint.id
        );
    }


    async release(
        checkpoint:
            CheckpointRef
    ): Promise<void> {
        this.released.push(
            checkpoint.id
        );
    }


    get createdIds():
        readonly string[]
    {
        return [
            ...this.created
        ];
    }


    get restoredIds():
        readonly string[]
    {
        return [
            ...this.restored
        ];
    }


    get releasedIds():
        readonly string[]
    {
        return [
            ...this.released
        ];
    }
}