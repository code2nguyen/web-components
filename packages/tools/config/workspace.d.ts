/** The repository root: the directory holding `pnpm-workspace.yaml`. */
export declare const workspaceRoot: string

/** `pnpm-workspace.yaml` of `root` (default: this repository), parsed. */
export declare function readWorkspace(root?: string): { packages?: string[]; catalog?: Record<string, string> }

/** The `packages:` globs of `pnpm-workspace.yaml`; throws on an empty list or a negated glob. */
export declare function workspacePatterns(root?: string): string[]

/** Every workspace package as `{ name, dir }` (`dir` absolute), sorted by name. */
export declare function workspacePackages(root?: string): { name: string; dir: string }[]
