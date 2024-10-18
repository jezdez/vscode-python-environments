import { ExtensionContext, Memento } from 'vscode';
import { createDeferred, Deferred } from './utils/deferred';
import { traceError } from './logging';

export interface PersistentState {
    get<T>(key: string, defaultValue?: T): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    clear(keys?: string[]): Promise<void>;
}

class PersistentStateImpl implements PersistentState {
    private keys: string[] = [];
    private clearing: Deferred<void>;
    constructor(private readonly momento: Memento) {
        this.clearing = createDeferred<void>();
        this.clearing.resolve();
    }
    async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        await this.clearing.promise;
        if (defaultValue === undefined) {
            return this.momento.get<T>(key);
        }
        return this.momento.get<T>(key, defaultValue);
    }
    async set<T>(key: string, value: T): Promise<void> {
        await this.clearing.promise;

        if (!this.keys.includes(key)) {
            this.keys.push(key);
        }
        await this.momento.update(key, value);

        const before = JSON.stringify(value);
        const after = JSON.stringify(await this.momento.get<T>(key));
        if (before !== after) {
            await this.momento.update(key, undefined);
            traceError('Error while updating state for key:', key);
        }
    }
    async clear(keys?: string[]): Promise<void> {
        if (this.clearing.completed) {
            this.clearing = createDeferred<void>();
            const _keys = keys ?? this.keys;
            await Promise.all(_keys.map((key) => this.momento.update(key, undefined)));
            this.keys = this.keys.filter((k) => _keys.includes(k));
            this.clearing.resolve();
        }
        return this.clearing.promise;
    }
}

const _workspace = createDeferred<PersistentState>();
const _global = createDeferred<PersistentState>();

export function setPersistentState(context: ExtensionContext): void {
    _workspace.resolve(new PersistentStateImpl(context.workspaceState));
    _global.resolve(new PersistentStateImpl(context.globalState));
}

export function getWorkspacePersistentState(): Promise<PersistentState> {
    return _workspace.promise;
}

export function getGlobalPersistentState(): Promise<PersistentState> {
    return _global.promise;
}