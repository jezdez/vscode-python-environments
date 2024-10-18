import * as path from 'path';
import { Disposable, EventEmitter, LogOutputChannel, MarkdownString, ProgressLocation, Uri, window } from 'vscode';
import {
    CreateEnvironmentScope,
    DidChangeEnvironmentEventArgs,
    DidChangeEnvironmentsEventArgs,
    EnvironmentChangeKind,
    EnvironmentManager,
    GetEnvironmentScope,
    GetEnvironmentsScope,
    IconPath,
    PythonEnvironment,
    PythonEnvironmentApi,
    PythonProject,
    RefreshEnvironmentsScope,
    ResolveEnvironmentContext,
    SetEnvironmentScope,
} from '../../api';
import {
    clearCondaCache,
    createCondaEnvironment,
    deleteCondaEnvironment,
    getCondaForGlobal,
    getCondaForWorkspace,
    refreshCondaEnvs,
    resolveCondaPath,
    setCondaForGlobal,
    setCondaForWorkspace,
} from './condaUtils';
import { NativePythonFinder } from '../common/nativePythonFinder';
import { createDeferred, Deferred } from '../../common/utils/deferred';

export class CondaEnvManager implements EnvironmentManager, Disposable {
    private collection: PythonEnvironment[] = [];
    private fsPathToEnv: Map<string, PythonEnvironment> = new Map();
    private disposablesMap: Map<string, Disposable> = new Map();
    private globalEnv: PythonEnvironment | undefined;

    private readonly _onDidChangeEnvironment = new EventEmitter<DidChangeEnvironmentEventArgs>();
    public readonly onDidChangeEnvironment = this._onDidChangeEnvironment.event;

    private readonly _onDidChangeEnvironments = new EventEmitter<DidChangeEnvironmentsEventArgs>();
    public readonly onDidChangeEnvironments = this._onDidChangeEnvironments.event;

    constructor(
        private readonly nativeFinder: NativePythonFinder,
        private readonly api: PythonEnvironmentApi,
        public readonly log: LogOutputChannel,
    ) {
        this.name = 'conda';
        this.displayName = 'Conda';
        this.preferredPackageManagerId = 'ms-python.python:conda';
        this.description = 'Conda environment manager';
        this.tooltip = 'Conda environment manager';
    }

    name: string;
    displayName: string;
    preferredPackageManagerId: string = 'ms-python.python:conda';
    description: string;
    tooltip: string | MarkdownString;
    iconPath?: IconPath;

    public dispose() {
        this.disposablesMap.forEach((d) => d.dispose());
    }

    private _initialized: Deferred<void> | undefined;
    async initialize(): Promise<void> {
        if (this._initialized) {
            return this._initialized.promise;
        }

        this._initialized = createDeferred();

        await window.withProgress(
            {
                location: ProgressLocation.Window,
                title: 'Discovering Conda environments',
            },
            async () => {
                this.collection = await refreshCondaEnvs(false, this.nativeFinder, this.api, this.log, this);
                await this.loadEnvMap();

                this._onDidChangeEnvironments.fire(
                    this.collection.map((e) => ({ environment: e, kind: EnvironmentChangeKind.add })),
                );
            },
        );
        this._initialized.resolve();
    }

    async getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]> {
        await this.initialize();

        if (scope === 'all') {
            return Array.from(this.collection);
        }

        if (scope === 'global') {
            return this.collection.filter((env) => {
                env.name === 'base';
            });
        }

        if (scope instanceof Uri) {
            const env = this.fromEnvMap(scope);
            if (env) {
                return [env];
            }
        }

        return [];
    }

    async create(context: CreateEnvironmentScope): Promise<PythonEnvironment | undefined> {
        try {
            const result = await createCondaEnvironment(
                this.api,
                this.log,
                this,
                context === 'global' ? undefined : context,
            );
            if (!result) {
                return undefined;
            }
            this.disposablesMap.set(
                result.envId.id,
                new Disposable(() => {
                    this.collection = this.collection.filter((env) => env.envId.id !== result.envId.id);
                    Array.from(this.fsPathToEnv.entries())
                        .filter(([, env]) => env.envId.id === result.envId.id)
                        .forEach(([uri]) => this.fsPathToEnv.delete(uri));
                    this.disposablesMap.delete(result.envId.id);
                }),
            );
            this.collection.push(result);
            this._onDidChangeEnvironments.fire([{ kind: EnvironmentChangeKind.add, environment: result }]);
            return result;
        } catch (error) {
            this.log.error('Failed to create conda environment:', error);
            return undefined;
        }
    }

    async remove(context: PythonEnvironment): Promise<void> {
        try {
            const projects = this.getProjectsForEnvironment(context);
            await deleteCondaEnvironment(context, this.log);
            this.disposablesMap.get(context.envId.id)?.dispose();

            setImmediate(() => {
                this._onDidChangeEnvironments.fire([{ kind: EnvironmentChangeKind.remove, environment: context }]);
                projects.forEach((project) =>
                    this._onDidChangeEnvironment.fire({ uri: project.uri, old: context, new: undefined }),
                );
            });
        } catch (error) {
            this.log.error('Failed to delete conda environment:', error);
        }
    }
    async refresh(context: RefreshEnvironmentsScope): Promise<void> {
        if (context === undefined) {
            this.disposablesMap.forEach((d) => d.dispose());
            this.disposablesMap.clear();

            await window.withProgress(
                {
                    location: ProgressLocation.Window,
                    title: 'Refreshing Conda Environments',
                },
                async () => {
                    this.log.info('Refreshing Conda Environments');
                    const discard = this.collection.map((c) => c);
                    this.collection = await refreshCondaEnvs(true, this.nativeFinder, this.api, this.log, this);

                    await this.loadEnvMap();

                    const args = [
                        ...discard.map((env) => ({ kind: EnvironmentChangeKind.remove, environment: env })),
                        ...this.collection.map((env) => ({ kind: EnvironmentChangeKind.add, environment: env })),
                    ];

                    this._onDidChangeEnvironments.fire(args);
                },
            );
        }
    }
    async get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
        await this.initialize();
        if (scope instanceof Uri) {
            let env = this.fsPathToEnv.get(scope.fsPath);
            if (env) {
                return env;
            }
            const project = this.api.getPythonProject(scope);
            if (project) {
                env = this.fsPathToEnv.get(project.uri.fsPath);
                if (env) {
                    return env;
                }
            }
        }

        return this.globalEnv;
    }
    async set(scope: SetEnvironmentScope, environment?: PythonEnvironment | undefined): Promise<void> {
        if (scope === undefined) {
            await setCondaForGlobal(environment?.environmentPath?.fsPath);
        } else if (scope instanceof Uri) {
            const folder = this.api.getPythonProject(scope);
            const fsPath = folder?.uri?.fsPath ?? scope.fsPath;
            if (fsPath) {
                if (environment) {
                    this.fsPathToEnv.set(fsPath, environment);
                    await setCondaForWorkspace(fsPath, environment.environmentPath.fsPath);
                } else {
                    this.fsPathToEnv.delete(fsPath);
                    await setCondaForWorkspace(fsPath, undefined);
                }
            }
        }
        return;
    }

    async resolve(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined> {
        await this.initialize();

        if (context instanceof Uri) {
            const env = await resolveCondaPath(context.fsPath, this.nativeFinder, this.api, this.log, this);
            if (env) {
                const _collectionEnv = this.findEnvironmentByPath(env.environmentPath.fsPath);
                if (_collectionEnv) {
                    return _collectionEnv;
                }

                this.collection.push(env);
                this._onDidChangeEnvironments.fire([{ kind: EnvironmentChangeKind.add, environment: env }]);

                return env;
            }

            return undefined;
        }
    }

    async clearCache(): Promise<void> {
        await clearCondaCache();
    }

    private async loadEnvMap() {
        this.globalEnv = undefined;
        this.fsPathToEnv.clear();

        // Try to find a global environment
        const fsPath = await getCondaForGlobal();

        if (fsPath) {
            this.globalEnv = this.findEnvironmentByPath(fsPath);

            // If the environment is not found, resolve the fsPath. Could be portable conda.
            if (!this.globalEnv) {
                this.globalEnv = await resolveCondaPath(fsPath, this.nativeFinder, this.api, this.log, this);

                // If the environment is resolved, add it to the collection
                if (this.globalEnv) {
                    this.collection.push(this.globalEnv);
                }
            }
        }

        // If a global environment is still not set, try using the 'base'
        if (!this.globalEnv) {
            this.globalEnv = this.findEnvironmentByName('base');
        }

        // Find any conda environments that might be associated with the current projects
        // These are environments whose parent dirs are project dirs.
        const pathSorted = this.collection
            .filter((e) => this.api.getPythonProject(e.environmentPath))
            .sort((a, b) => {
                if (a.environmentPath.fsPath !== b.environmentPath.fsPath) {
                    return a.environmentPath.fsPath.length - b.environmentPath.fsPath.length;
                }
                return a.environmentPath.fsPath.localeCompare(b.environmentPath.fsPath);
            });

        // Try to find workspace environments
        const paths = this.api.getPythonProjects().map((p) => p.uri.fsPath);
        for (const p of paths) {
            const env = await getCondaForWorkspace(p);

            if (env) {
                const found = this.findEnvironmentByPath(env);

                if (found) {
                    this.fsPathToEnv.set(p, found);
                } else {
                    // If not found, resolve the conda path. Could be portable conda.
                    const resolved = await resolveCondaPath(env, this.nativeFinder, this.api, this.log, this);

                    if (resolved) {
                        // If resolved add it to the collection
                        this.fsPathToEnv.set(p, resolved);
                        this.collection.push(resolved);
                    } else {
                        this.log.error(`Failed to resolve conda environment: ${env}`);
                    }
                }
            } else {
                // If there is not an environment already assigned by user to this project
                // then see if there is one in the collection
                if (pathSorted.length === 1) {
                    this.fsPathToEnv.set(p, pathSorted[0]);
                } else {
                    // If there is more than one environment then we need to check if the project
                    // is a subfolder of one of the environments
                    const found = pathSorted.find((e) => {
                        const t = this.api.getPythonProject(e.environmentPath)?.uri.fsPath;
                        return t && path.normalize(t) === p;
                    });
                    if (found) {
                        this.fsPathToEnv.set(p, found);
                    }
                }
            }
        }
    }

    private fromEnvMap(uri: Uri): PythonEnvironment | undefined {
        // Find environment directly using the URI mapping
        const env = this.fsPathToEnv.get(uri.fsPath);
        if (env) {
            return env;
        }

        // Find environment using the Python project for the Uri
        const project = this.api.getPythonProject(uri);
        if (project) {
            return this.fsPathToEnv.get(project.uri.fsPath);
        }

        return undefined;
    }

    private getProjectsForEnvironment(environment: PythonEnvironment): PythonProject[] {
        return Array.from(this.fsPathToEnv.entries())
            .filter(([, env]) => env === environment)
            .map(([uri]) => this.api.getPythonProject(Uri.file(uri)))
            .filter((project) => project !== undefined) as PythonProject[];
    }

    private findEnvironmentByPath(fsPath: string): PythonEnvironment | undefined {
        const normalized = path.normalize(fsPath);
        return this.collection.find((e) => {
            const n = path.normalize(e.environmentPath.fsPath);
            return n === normalized || path.dirname(n) === normalized || path.dirname(path.dirname(n)) === normalized;
        });
    }

    private findEnvironmentByName(name: string): PythonEnvironment | undefined {
        return this.collection.find((e) => {
            return e.name === name;
        });
    }
}