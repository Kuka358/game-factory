export type ExecutionNetworkAccess =
    | "allow"
    | "deny";


export type ExecutionFilesystemAccess =
    | "host"
    | "workspace-only";


export type ExecutionChildProcessAccess =
    | "allow"
    | "deny";


export interface ExecutionPolicy {
    network:
        ExecutionNetworkAccess;

    filesystem:
        ExecutionFilesystemAccess;

    childProcesses:
        ExecutionChildProcessAccess;
}


/*
 * This describes what the current local-process backend
 * ACTUALLY permits.
 *
 * It is deliberately not called "secure" or "isolated":
 * the child still has host filesystem and network access.
 */
export const HOST_PROCESS_EXECUTION_POLICY:
    Readonly<ExecutionPolicy> = {
        network:
            "allow",

        filesystem:
            "host",

        childProcesses:
            "allow"
    };


/*
 * This is the target policy for deterministic production
 * verification once a real OS/container sandbox backend
 * exists.
 */
export const STRICT_VERIFICATION_EXECUTION_POLICY:
    Readonly<ExecutionPolicy> = {
        network:
            "deny",

        filesystem:
            "workspace-only",

        childProcesses:
            "allow"
    };


export function normalizeExecutionPolicy(
    policy:
        ExecutionPolicy |
        undefined
): ExecutionPolicy {
    return policy
        ? {
            network:
                policy.network,

            filesystem:
                policy.filesystem,

            childProcesses:
                policy.childProcesses
        }
        : {
            ...HOST_PROCESS_EXECUTION_POLICY
        };
}