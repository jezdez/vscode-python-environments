import { l10n, LogOutputChannel, ProgressLocation, QuickPickItem, QuickPickItemKind, ThemeIcon, Uri } from 'vscode';
import {
    EnvironmentManager,
    Installable,
    PythonCommandRunConfiguration,
    PythonEnvironment,
    PythonEnvironmentApi,
    PythonEnvironmentInfo,
    PythonProject,
    TerminalShellType,
} from '../../api';
import * as tomljs from '@iarna/toml';
import * as path from 'path';
import * as os from 'os';
import * as fsapi from 'fs-extra';
import { isUvInstalled, resolveSystemPythonEnvironmentPath, runPython, runUV } from './utils';
import { ENVS_EXTENSION_ID } from '../../common/constants';
import {
    isNativeEnvInfo,
    NativeEnvInfo,
    NativePythonEnvironmentKind,
    NativePythonFinder,
} from '../common/nativePythonFinder';
import { getWorkspacePersistentState } from '../../common/persistentState';
import { shortVersion, sortEnvironments } from '../common/utils';
import { findFiles, getConfiguration } from '../../common/workspace.apis';
import { pickEnvironmentFrom } from '../../common/pickers/environments';
import {
    showQuickPick,
    withProgress,
    showWarningMessage,
    showInputBox,
    showOpenDialog,
} from '../../common/window.apis';
import { showErrorMessage } from '../../common/errors/utils';
import { getPackagesToInstallFromInstallable } from '../../common/pickers/packages';
import { Common, VenvManagerStrings } from '../../common/localize';

export const VENV_WORKSPACE_KEY = `${ENVS_EXTENSION_ID}:venv:WORKSPACE_SELECTED`;
export const VENV_GLOBAL_KEY = `${ENVS_EXTENSION_ID}:venv:GLOBAL_SELECTED`;

export async function clearVenvCache(): Promise<void> {
    const keys = [VENV_WORKSPACE_KEY, VENV_GLOBAL_KEY];
    const state = await getWorkspacePersistentState();
    await state.clear(keys);
}

export async function getVenvForWorkspace(fsPath: string): Promise<string | undefined> {
    if (process.env.VIRTUAL_ENV) {
        return process.env.VIRTUAL_ENV;
    }

    const state = await getWorkspacePersistentState();
    const data: { [key: string]: string } | undefined = await state.get(VENV_WORKSPACE_KEY);
    if (data) {
        try {
            const envPath = data[fsPath];
            if (await fsapi.pathExists(envPath)) {
                return envPath;
            }
            setVenvForWorkspace(fsPath, undefined);
        } catch {
            return undefined;
        }
    }
    return undefined;
}

export async function setVenvForWorkspace(fsPath: string, envPath: string | undefined): Promise<void> {
    const state = await getWorkspacePersistentState();
    const data: { [key: string]: string } = (await state.get(VENV_WORKSPACE_KEY)) ?? {};
    if (envPath) {
        data[fsPath] = envPath;
    } else {
        delete data[fsPath];
    }
    await state.set(VENV_WORKSPACE_KEY, data);
}

export async function getVenvForGlobal(): Promise<string | undefined> {
    const state = await getWorkspacePersistentState();
    const envPath: string | undefined = await state.get(VENV_GLOBAL_KEY);
    if (envPath && (await fsapi.pathExists(envPath))) {
        return envPath;
    }
    return undefined;
}

export async function setVenvForGlobal(envPath: string | undefined): Promise<void> {
    const state = await getWorkspacePersistentState();
    await state.set(VENV_GLOBAL_KEY, envPath);
}

function getName(binPath: string): string {
    const dir1 = path.dirname(binPath);
    if (dir1.endsWith('bin') || dir1.endsWith('Scripts') || dir1.endsWith('scripts')) {
        return path.basename(path.dirname(dir1));
    }
    return path.basename(dir1);
}

function getPythonInfo(env: NativeEnvInfo): PythonEnvironmentInfo {
    if (env.executable && env.version && env.prefix) {
        const venvName = env.name ?? getName(env.executable);
        const sv = shortVersion(env.version);
        const name = `${venvName} (${sv})`;

        const binDir = path.dirname(env.executable);

        const shellActivation: Map<TerminalShellType, PythonCommandRunConfiguration[]> = new Map();
        shellActivation.set(TerminalShellType.bash, [{ executable: 'source', args: [path.join(binDir, 'activate')] }]);
        shellActivation.set(TerminalShellType.powershell, [
            { executable: '&', args: [path.join(binDir, 'Activate.ps1')] },
        ]);
        shellActivation.set(TerminalShellType.commandPrompt, [{ executable: path.join(binDir, 'activate.bat') }]);
        shellActivation.set(TerminalShellType.unknown, [{ executable: path.join(binDir, 'activate') }]);

        const shellDeactivation = new Map<TerminalShellType, PythonCommandRunConfiguration[]>();
        shellDeactivation.set(TerminalShellType.bash, [{ executable: 'deactivate' }]);
        shellDeactivation.set(TerminalShellType.powershell, [{ executable: 'deactivate' }]);
        shellDeactivation.set(TerminalShellType.commandPrompt, [{ executable: path.join(binDir, 'deactivate.bat') }]);
        shellActivation.set(TerminalShellType.unknown, [{ executable: 'deactivate' }]);

        return {
            name: name,
            displayName: name,
            shortDisplayName: `${sv} (${venvName})`,
            displayPath: env.executable,
            version: env.version,
            description: env.executable,
            environmentPath: Uri.file(env.executable),
            iconPath: new ThemeIcon('python'),
            sysPrefix: env.prefix,
            execInfo: {
                run: {
                    executable: env.executable,
                },
                activatedRun: {
                    executable: env.executable,
                },
                shellActivation,
                shellDeactivation,
            },
        };
    } else {
        throw new Error(`Invalid python info: ${JSON.stringify(env)}`);
    }
}

export async function findVirtualEnvironments(
    hardRefresh: boolean,
    nativeFinder: NativePythonFinder,
    api: PythonEnvironmentApi,
    log: LogOutputChannel,
    manager: EnvironmentManager,
    uris?: Uri[],
): Promise<PythonEnvironment[]> {
    const collection: PythonEnvironment[] = [];
    const data = await nativeFinder.refresh(hardRefresh, uris);
    const envs = data
        .filter((e) => isNativeEnvInfo(e))
        .map((e) => e as NativeEnvInfo)
        .filter((e) => e.kind === NativePythonEnvironmentKind.venv);

    envs.forEach((e) => {
        if (!(e.prefix && e.executable && e.version)) {
            log.warn(`Invalid conda environment: ${JSON.stringify(e)}`);
            return;
        }

        const env = api.createPythonEnvironmentItem(getPythonInfo(e), manager);
        collection.push(env);
        log.info(`Found venv environment: ${env.name}`);
    });
    return collection;
}

function getVenvFoldersSetting(): string[] {
    const settings = getConfiguration('python');
    return settings.get<string[]>('venvFolders', []);
}

interface FolderQuickPickItem extends QuickPickItem {
    uri?: Uri;
}
export async function getGlobalVenvLocation(): Promise<Uri | undefined> {
    const items: FolderQuickPickItem[] = [
        {
            label: Common.browse,
            description: VenvManagerStrings.venvGlobalFolder,
        },
    ];

    const venvPaths = getVenvFoldersSetting();
    if (venvPaths.length > 0) {
        items.push(
            {
                label: VenvManagerStrings.venvGlobalFoldersSetting,
                kind: QuickPickItemKind.Separator,
            },
            ...venvPaths.map((p) => ({
                label: path.basename(p),
                description: path.resolve(p),
                uri: Uri.file(path.resolve(p)),
            })),
        );
    }

    if (process.env.WORKON_HOME) {
        items.push(
            {
                label: 'virtualenvwrapper',
                kind: QuickPickItemKind.Separator,
            },
            {
                label: 'WORKON_HOME (env variable)',
                description: process.env.WORKON_HOME,
                uri: Uri.file(process.env.WORKON_HOME),
            },
        );
    }

    const selected = await showQuickPick(items, {
        placeHolder: VenvManagerStrings.venvGlobalFolder,
        ignoreFocusOut: true,
    });

    if (selected) {
        if (selected.label === Common.browse) {
            const result = await showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: Common.selectFolder,
            });
            if (result && result.length > 0) {
                return result[0];
            }
        } else if (selected.uri) {
            return selected.uri;
        }
    }
    return undefined;
}

export async function createPythonVenv(
    nativeFinder: NativePythonFinder,
    api: PythonEnvironmentApi,
    log: LogOutputChannel,
    manager: EnvironmentManager,
    basePythons: PythonEnvironment[],
    venvRoot: Uri,
): Promise<PythonEnvironment | undefined> {
    if (basePythons.length === 0) {
        log.error('No base python found');
        showErrorMessage(VenvManagerStrings.venvErrorNoBasePython);
        return;
    }

    const filtered = basePythons.filter((e) => e.version.startsWith('3.'));
    if (filtered.length === 0) {
        log.error('Did not find any base python 3.*');
        showErrorMessage(VenvManagerStrings.venvErrorNoPython3);
        basePythons.forEach((e) => {
            log.error(`available base python: ${e.version}`);
        });
        return;
    }

    const basePython = await pickEnvironmentFrom(sortEnvironments(filtered));
    if (!basePython || !basePython.execInfo) {
        log.error('No base python selected, cannot create virtual environment.');
        return;
    }

    const name = await showInputBox({
        prompt: VenvManagerStrings.venvName,
        value: '.venv',
        ignoreFocusOut: true,
        validateInput: async (value) => {
            if (!value) {
                return VenvManagerStrings.venvNameErrorEmpty;
            }
            if (await fsapi.pathExists(path.join(venvRoot.fsPath, value))) {
                return VenvManagerStrings.venvNameErrorExists;
            }
        },
    });
    if (!name) {
        log.error('No name entered, cannot create virtual environment.');
        return;
    }

    const envPath = path.join(venvRoot.fsPath, name);
    const pythonPath =
        os.platform() === 'win32' ? path.join(envPath, 'Scripts', 'python.exe') : path.join(envPath, 'bin', 'python');

    const project = api.getPythonProject(venvRoot);
    const installable = await getProjectInstallable(api, project ? [project] : undefined);

    let packages: string[] = [];
    if (installable && installable.length > 0) {
        const packagesToInstall = await getPackagesToInstallFromInstallable(installable);
        if (!packagesToInstall) {
            return;
        }
        packages = packagesToInstall;
    }

    return await withProgress(
        {
            location: ProgressLocation.Notification,
            title: VenvManagerStrings.venvCreating,
        },
        async () => {
            try {
                const useUv = await isUvInstalled(log);
                if (basePython.execInfo?.run.executable) {
                    if (useUv) {
                        await runUV(
                            ['venv', '--verbose', '--seed', '--python', basePython.execInfo?.run.executable, envPath],
                            venvRoot.fsPath,
                            log,
                        );
                    } else {
                        await runPython(
                            basePython.execInfo.run.executable,
                            ['-m', 'venv', envPath],
                            venvRoot.fsPath,
                            manager.log,
                        );
                    }
                    if (!(await fsapi.pathExists(pythonPath))) {
                        log.error('no python executable found in virtual environment');
                        throw new Error('no python executable found in virtual environment');
                    }
                }

                const resolved = await nativeFinder.resolve(pythonPath);
                const env = api.createPythonEnvironmentItem(getPythonInfo(resolved), manager);
                if (packages?.length > 0) {
                    await api.installPackages(env, packages, { upgrade: false });
                }
                return env;
            } catch (e) {
                log.error(`Failed to create virtual environment: ${e}`);
                showErrorMessage(VenvManagerStrings.venvCreateFailed);
                return;
            }
        },
    );
}

export async function removeVenv(environment: PythonEnvironment, log: LogOutputChannel): Promise<boolean> {
    const pythonPath = os.platform() === 'win32' ? 'python.exe' : 'python';

    const envPath = environment.environmentPath.fsPath.endsWith(pythonPath)
        ? path.dirname(path.dirname(environment.environmentPath.fsPath))
        : environment.environmentPath.fsPath;

    const confirm = await showWarningMessage(
        l10n.t('Are you sure you want to remove {0}?', envPath),
        Common.yes,
        Common.no,
    );
    if (confirm === Common.yes) {
        await withProgress(
            {
                location: ProgressLocation.Notification,
                title: VenvManagerStrings.venvRemoving,
            },
            async () => {
                try {
                    await fsapi.remove(envPath);
                    return true;
                } catch (e) {
                    log.error(`Failed to remove virtual environment: ${e}`);
                    showErrorMessage(VenvManagerStrings.venvRemoveFailed);
                    return false;
                }
            },
        );
    }

    return false;
}

function tomlParse(content: string, log?: LogOutputChannel): tomljs.JsonMap {
    try {
        return tomljs.parse(content);
    } catch (err) {
        log?.error('Failed to parse `pyproject.toml`:', err);
    }
    return {};
}

function isPipInstallableToml(toml: tomljs.JsonMap): boolean {
    return toml['build-system'] !== undefined && toml.project !== undefined;
}

function getTomlInstallable(toml: tomljs.JsonMap, tomlPath: Uri): Installable[] {
    const extras: Installable[] = [];

    if (isPipInstallableToml(toml)) {
        extras.push({
            displayName: path.basename(tomlPath.fsPath),
            description: VenvManagerStrings.installEditable,
            group: 'TOML',
            args: ['-e', path.dirname(tomlPath.fsPath)],
            uri: tomlPath,
        });
    }

    if (toml.project && (toml.project as tomljs.JsonMap)['optional-dependencies']) {
        const deps = (toml.project as tomljs.JsonMap)['optional-dependencies'];
        for (const key of Object.keys(deps)) {
            extras.push({
                displayName: key,
                group: 'TOML',
                args: ['-e', `.[${key}]`],
                uri: tomlPath,
            });
        }
    }
    return extras;
}

export async function getProjectInstallable(
    api: PythonEnvironmentApi,
    projects?: PythonProject[],
): Promise<Installable[]> {
    if (!projects) {
        return [];
    }
    const exclude = '**/{.venv*,.git,.nox,.tox,.conda,site-packages,__pypackages__}/**';
    const installable: Installable[] = [];
    await withProgress(
        {
            location: ProgressLocation.Window,
            title: VenvManagerStrings.searchingDependencies,
        },
        async (_progress, token) => {
            const results: Uri[] = (
                await Promise.all([
                    findFiles('**/*requirements*.txt', exclude, undefined, token),
                    findFiles('**/requirements/*.txt', exclude, undefined, token),
                    findFiles('**/pyproject.toml', exclude, undefined, token),
                ])
            ).flat();

            const fsPaths = projects.map((p) => p.uri.fsPath);
            const filtered = results
                .filter((uri) => {
                    const p = api.getPythonProject(uri)?.uri.fsPath;
                    return p && fsPaths.includes(p);
                })
                .sort();

            await Promise.all(
                filtered.map(async (uri) => {
                    if (uri.fsPath.endsWith('.toml')) {
                        const toml = tomlParse(await fsapi.readFile(uri.fsPath, 'utf-8'));
                        installable.push(...getTomlInstallable(toml, uri));
                    } else {
                        installable.push({
                            uri,
                            displayName: path.basename(uri.fsPath),
                            group: 'Requirements',
                            args: ['-r', uri.fsPath],
                        });
                    }
                }),
            );
        },
    );
    return installable;
}

export async function resolveVenvPythonEnvironmentPath(
    fsPath: string,
    nativeFinder: NativePythonFinder,
    api: PythonEnvironmentApi,
    manager: EnvironmentManager,
    baseManager: EnvironmentManager,
): Promise<PythonEnvironment | undefined> {
    const resolved = await nativeFinder.resolve(fsPath);

    if (resolved.kind === NativePythonEnvironmentKind.venv) {
        const envInfo = getPythonInfo(resolved);
        return api.createPythonEnvironmentItem(envInfo, manager);
    }

    return resolveSystemPythonEnvironmentPath(fsPath, nativeFinder, api, baseManager);
}
