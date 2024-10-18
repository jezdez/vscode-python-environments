import { Uri, Disposable, Event, EventEmitter } from 'vscode';
import {
    PythonEnvironmentApi,
    PythonEnvironment,
    EnvironmentManager,
    PackageManager,
    DidChangeEnvironmentEventArgs,
    DidChangeEnvironmentsEventArgs,
    DidChangePythonProjectsEventArgs,
    GetEnvironmentsScope,
    Package,
    PythonEnvironmentInfo,
    PythonProject,
    RefreshEnvironmentsScope,
    DidChangePackagesEventArgs,
    PythonEnvironmentId,
    CreateEnvironmentScope,
    SetEnvironmentScope,
    GetEnvironmentScope,
    PackageInfo,
    PackageId,
    PythonProjectCreator,
    ResolveEnvironmentContext,
    PackageInstallOptions,
} from '../api';
import {
    EnvironmentManagers,
    ProjectCreators,
    PythonEnvironmentImpl,
    PythonPackageImpl,
    PythonProjectManager,
} from '../internal.api';
import { createDeferred } from '../common/utils/deferred';
import { traceError } from '../common/logging';
import { showErrorMessage } from '../common/errors/utils';

class PythonEnvironmentApiImpl implements PythonEnvironmentApi {
    private readonly _onDidChangeEnvironments = new EventEmitter<DidChangeEnvironmentsEventArgs>();
    private readonly _onDidChangeEnvironment = new EventEmitter<DidChangeEnvironmentEventArgs>();
    private readonly _onDidChangePythonProjects = new EventEmitter<DidChangePythonProjectsEventArgs>();
    private readonly _onDidChangePackages = new EventEmitter<DidChangePackagesEventArgs>();
    constructor(
        private readonly envManagers: EnvironmentManagers,
        private readonly projectManager: PythonProjectManager,
        private readonly projectCreators: ProjectCreators,
    ) {}

    registerEnvironmentManager(manager: EnvironmentManager): Disposable {
        const disposables: Disposable[] = [];
        disposables.push(this.envManagers.registerEnvironmentManager(manager));
        if (manager.onDidChangeEnvironments) {
            disposables.push(manager.onDidChangeEnvironments((e) => this._onDidChangeEnvironments.fire(e)));
        }
        if (manager.onDidChangeEnvironment) {
            disposables.push(
                manager.onDidChangeEnvironment((e) => {
                    const mgr = this.envManagers.getEnvironmentManager(e.uri);
                    if (mgr?.equals(manager)) {
                        // Fire this event only if the manager set for current uri
                        // is the same as the manager that triggered environment change
                        setImmediate(() => {
                            this._onDidChangeEnvironment.fire(e);
                        });
                    }
                }),
            );
        }
        return new Disposable(() => disposables.forEach((d) => d.dispose()));
    }

    createPythonEnvironmentItem(info: PythonEnvironmentInfo, manager: EnvironmentManager): PythonEnvironment {
        const mgr = this.envManagers.managers.find((m) => m.equals(manager));
        if (!mgr) {
            throw new Error('Environment manager not found');
        }
        const randomStr = Math.random().toString(36).substring(2);
        const envId: PythonEnvironmentId = {
            managerId: mgr.id,
            id: `${info.name}-${randomStr}`,
        };
        return new PythonEnvironmentImpl(envId, info);
    }
    createEnvironment(scope: CreateEnvironmentScope): Promise<PythonEnvironment | undefined> {
        const manager = this.envManagers.getEnvironmentManager(scope === 'global' ? undefined : scope.uri);
        if (!manager) {
            return Promise.reject(new Error('No environment manager found'));
        }
        return manager.create(scope);
    }
    removeEnvironment(environment: PythonEnvironment): Promise<void> {
        const manager = this.envManagers.getEnvironmentManager(environment);
        if (!manager) {
            return Promise.reject(new Error('No environment manager found'));
        }
        return manager.remove(environment);
    }
    async refreshEnvironments(scope: RefreshEnvironmentsScope): Promise<void> {
        if (scope === undefined) {
            await Promise.all(this.envManagers.managers.map((manager) => manager.refresh(scope)));
            return Promise.resolve();
        }
        const manager = this.envManagers.getEnvironmentManager(scope);
        if (!manager) {
            return Promise.reject(new Error(`No environment manager found for: ${scope.fsPath}`));
        }
        return manager.refresh(scope);
    }
    async getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]> {
        if (scope === 'all' || scope === 'global') {
            const promises = this.envManagers.managers.map((manager) => manager.getEnvironments(scope));
            const items = await Promise.all(promises);
            return items.flat();
        }
        const manager = this.envManagers.getEnvironmentManager(scope);
        if (!manager) {
            return [];
        }

        const items = await manager.getEnvironments(scope);
        return items;
    }
    onDidChangeEnvironments: Event<DidChangeEnvironmentsEventArgs> = this._onDidChangeEnvironments.event;
    setEnvironment(scope: SetEnvironmentScope, environment?: PythonEnvironment): void {
        const manager = this.envManagers.getEnvironmentManager(scope);
        if (!manager) {
            throw new Error('No environment manager found');
        }
        manager.set(scope, environment);
    }
    async getEnvironment(context: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
        const manager = this.envManagers.getEnvironmentManager(context);
        if (!manager) {
            return undefined;
        }
        return await manager.get(context);
    }
    onDidChangeEnvironment: Event<DidChangeEnvironmentEventArgs> = this._onDidChangeEnvironment.event;
    async resolveEnvironment(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined> {
        const manager = this.envManagers.getEnvironmentManager(context);
        if (!manager) {
            const data = context instanceof Uri ? context.fsPath : context.environmentPath.fsPath;
            traceError(`No environment manager found: ${data}`);
            traceError(`Know environment managers: ${this.envManagers.managers.map((m) => m.name).join(', ')}`);
            showErrorMessage('No environment manager found');
            return undefined;
        }
        const env = await manager.resolve(context);
        if (env && !env.execInfo) {
            traceError(`Environment wasn't resolved correctly, missing execution info: ${env.name}`);
            traceError(`Environment: ${JSON.stringify(env)}`);
            traceError(`Resolved by: ${manager.id}`);
            showErrorMessage("Environment wasn't resolved correctly, missing execution info");
            return undefined;
        }

        return env;
    }

    registerPackageManager(manager: PackageManager): Disposable {
        const disposables: Disposable[] = [];
        disposables.push(this.envManagers.registerPackageManager(manager));
        if (manager.onDidChangePackages) {
            disposables.push(manager.onDidChangePackages((e) => this._onDidChangePackages.fire(e)));
        }
        return new Disposable(() => disposables.forEach((d) => d.dispose()));
    }
    installPackages(context: PythonEnvironment, packages: string[], options: PackageInstallOptions): Promise<void> {
        const manager = this.envManagers.getPackageManager(context);
        if (!manager) {
            return Promise.reject(new Error('No package manager found'));
        }
        return manager.install(context, packages, options);
    }
    uninstallPackages(context: PythonEnvironment, packages: Package[] | string[]): Promise<void> {
        const manager = this.envManagers.getPackageManager(context);
        if (!manager) {
            return Promise.reject(new Error('No package manager found'));
        }
        return manager.uninstall(context, packages);
    }
    refreshPackages(context: PythonEnvironment): Promise<void> {
        const manager = this.envManagers.getPackageManager(context);
        if (!manager) {
            return Promise.reject(new Error('No package manager found'));
        }
        return manager.refresh(context);
    }
    getPackages(context: PythonEnvironment): Promise<Package[] | undefined> {
        const manager = this.envManagers.getPackageManager(context);
        if (!manager) {
            return Promise.resolve(undefined);
        }
        return manager.getPackages(context);
    }
    onDidChangePackages: Event<DidChangePackagesEventArgs> = this._onDidChangePackages.event;
    createPackageItem(info: PackageInfo, environment: PythonEnvironment, manager: PackageManager): Package {
        const mgr = this.envManagers.packageManagers.find((m) => m.equals(manager));
        if (!mgr) {
            throw new Error('Package manager not found');
        }
        const randomStr = Math.random().toString(36).substring(2);
        const pkg: PackageId = {
            managerId: mgr.id,
            environmentId: environment.envId.id,
            id: `${info.name}-${randomStr}`,
        };
        return new PythonPackageImpl(pkg, info);
    }

    addPythonProject(projects: PythonProject | PythonProject[]): void {
        this.projectManager.add(projects);
    }
    removePythonProject(pyWorkspace: PythonProject): void {
        this.projectManager.remove(pyWorkspace);
    }
    getPythonProjects(): readonly PythonProject[] {
        return this.projectManager.getProjects();
    }
    onDidChangePythonProjects: Event<DidChangePythonProjectsEventArgs> = this._onDidChangePythonProjects.event;
    getPythonProject(uri: Uri): PythonProject | undefined {
        return this.projectManager.get(uri);
    }
    registerPythonProjectCreator(creator: PythonProjectCreator): Disposable {
        return this.projectCreators.registerPythonProjectCreator(creator);
    }
}

let _deferred = createDeferred<PythonEnvironmentApi>();
export function setPythonApi(
    envMgr: EnvironmentManagers,
    projectMgr: PythonProjectManager,
    projectCreators: ProjectCreators,
) {
    _deferred.resolve(new PythonEnvironmentApiImpl(envMgr, projectMgr, projectCreators));
}

export function getPythonApi(): Promise<PythonEnvironmentApi> {
    return _deferred.promise;
}