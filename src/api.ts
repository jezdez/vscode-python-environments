import { Uri, Disposable, MarkdownString, Event, LogOutputChannel, ThemeIcon } from 'vscode';

/**
 * The path to an icon, or a theme-specific configuration of icons.
 */
export type IconPath =
    | Uri
    | {
          /**
           * The icon path for the light theme.
           */
          light: Uri;
          /**
           * The icon path for the dark theme.
           */
          dark: Uri;
      }
    | ThemeIcon;

/**
 * Options for executing a Python executable.
 */
export interface PythonCommandRunConfiguration {
    /**
     * Path to the binary like `python.exe` or `python3` to execute. This should be an absolute path
     * to an executable that can be spawned.
     */
    executable: string;

    /**
     * Arguments to pass to the python executable. These arguments will be passed on all execute calls.
     * This is intended for cases where you might want to do interpreter specific flags.
     */
    args?: string[];
}

export enum TerminalShellType {
    powershell = 'powershell',
    powershellCore = 'powershellCore',
    commandPrompt = 'commandPrompt',
    gitbash = 'gitbash',
    bash = 'bash',
    zsh = 'zsh',
    ksh = 'ksh',
    fish = 'fish',
    cshell = 'cshell',
    tcshell = 'tshell',
    nushell = 'nushell',
    wsl = 'wsl',
    xonsh = 'xonsh',
    unknown = 'unknown',
}

/**
 * Contains details on how to use a particular python environment
 *
 * Running In Terminal:
 * 1. If {@link PythonEnvironmentExecutionInfo.activatedRun} is provided, then that will be used.
 * 2. If {@link PythonEnvironmentExecutionInfo.activatedRun} is not provided, then:
 *   - If {@link PythonEnvironmentExecutionInfo.shellActivation} is provided and shell type is known, then that will be used.
 *   - If {@link PythonEnvironmentExecutionInfo.shellActivation} is provided and shell type is not known, then:
 *     - {@link TerminalShellType.unknown} will be used if provided.
 *     - {@link PythonEnvironmentExecutionInfo.activation} will be used otherwise.
 *   - If {@link PythonEnvironmentExecutionInfo.shellActivation} is not provided, then {@link PythonEnvironmentExecutionInfo.activation} will be used.
 *   - If {@link PythonEnvironmentExecutionInfo.activation} is not provided, then {@link PythonEnvironmentExecutionInfo.run} will be used.
 *
 * Creating a Terminal:
 * 1. If {@link PythonEnvironmentExecutionInfo.shellActivation} is provided and shell type is known, then that will be used.
 * 2. If {@link PythonEnvironmentExecutionInfo.shellActivation} is provided and shell type is not known, then {@link PythonEnvironmentExecutionInfo.activation} will be used.
 * 3. If {@link PythonEnvironmentExecutionInfo.shellActivation} is not provided, then:
 *     - {@link TerminalShellType.unknown} will be used if provided.
 *     - {@link PythonEnvironmentExecutionInfo.activation} will be used otherwise.
 * 4. If {@link PythonEnvironmentExecutionInfo.activation} is not provided, then {@link PythonEnvironmentExecutionInfo.run} will be used.
 *
 */
export interface PythonEnvironmentExecutionInfo {
    /**
     * Details on how to run the python executable.
     */
    run: PythonCommandRunConfiguration;

    /**
     * Details on how to run the python executable after activating the environment.
     * If set this will overrides the {@link PythonEnvironmentExecutionInfo.run} command.
     */
    activatedRun?: PythonCommandRunConfiguration;

    /**
     * Details on how to activate an environment.
     */
    activation?: PythonCommandRunConfiguration[];

    /**
     * Details on how to activate an environment using a shell specific command.
     * If set this will override the {@link PythonEnvironmentExecutionInfo.activation}.
     * {@link TerminalShellType.unknown} is used if shell type is not known.
     * If {@link TerminalShellType.unknown} is not provided and shell type is not known then
     * {@link PythonEnvironmentExecutionInfo.activation} if set.
     */
    shellActivation?: Map<TerminalShellType, PythonCommandRunConfiguration[]>;

    /**
     * Details on how to deactivate an environment.
     */
    deactivation?: PythonCommandRunConfiguration[];

    /**
     * Details on how to deactivate an environment using a shell specific command.
     * If set this will override the {@link PythonEnvironmentExecutionInfo.deactivation} property.
     * {@link TerminalShellType.unknown} is used if shell type is not known.
     * If {@link TerminalShellType.unknown} is not provided and shell type is not known then
     * {@link PythonEnvironmentExecutionInfo.deactivation} if set.
     */
    shellDeactivation?: Map<TerminalShellType, PythonCommandRunConfiguration[]>;
}

/**
 * Interface representing the ID of a Python environment.
 */
export interface PythonEnvironmentId {
    /**
     * The unique identifier of the Python environment.
     */
    id: string;

    /**
     * The ID of the manager responsible for the Python environment.
     */
    managerId: string;
}

/**
 * Interface representing information about a Python environment.
 */
export interface PythonEnvironmentInfo {
    /**
     * The name of the Python environment.
     */
    readonly name: string;

    /**
     * The display name of the Python environment.
     */
    readonly displayName: string;

    /**
     * The short display name of the Python environment.
     */
    readonly shortDisplayName?: string;

    /**
     * The display path of the Python environment.
     */
    readonly displayPath: string;

    /**
     * The version of the Python environment.
     */
    readonly version: string;

    /**
     * Path to the python binary or environment folder.
     */
    readonly environmentPath: Uri;

    /**
     * The description of the Python environment.
     */
    readonly description?: string;

    /**
     * The tooltip for the Python environment, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString;

    /**
     * The icon path for the Python environment, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;

    /**
     * Information on how to execute the Python environment. If not provided, {@link PythonEnvironmentApi.resolveEnvironment} will be
     * used to to get the details at later point if needed. The recommendation is to fill this in if known.
     */
    readonly execInfo?: PythonEnvironmentExecutionInfo;

    /**
     * `sys.prefix` is the path to the base directory of the Python installation. Typically obtained by executing `sys.prefix` in the Python interpreter.
     * This is required by extension like Jupyter, Pylance, and other extensions to provide better experience with python.
     */
    readonly sysPrefix: string;
}

/**
 * Interface representing a Python environment.
 */
export interface PythonEnvironment extends PythonEnvironmentInfo {
    /**
     * The ID of the Python environment.
     */
    readonly envId: PythonEnvironmentId;
}

/**
 * Type representing the scope for setting a Python environment.
 * Can be undefined or a URI.
 */
export type SetEnvironmentScope = undefined | Uri;

/**
 * Type representing the scope for getting a Python environment.
 * Can be undefined or a URI.
 */
export type GetEnvironmentScope = undefined | Uri;

/**
 * Type representing the scope for creating a Python environment.
 * Can be a Python project or 'global'.
 */
export type CreateEnvironmentScope = PythonProject | 'global';
/**
 * The scope for which environments are to be refreshed.
 * - `undefined`: Search for environments globally and workspaces.
 * - {@link Uri}: Environments in the workspace/folder or associated with the Uri.
 */
export type RefreshEnvironmentsScope = Uri | undefined;

/**
 * The scope for which environments are required.
 * - `undefined`/`"all"`: All environments.
 * - `"global"`: Python installations that are usually a base for creating virtual environments.
 * - {@link Uri}: Environments for the workspace/folder/file pointed to by the Uri.
 */
export type GetEnvironmentsScope = Uri | 'all' | 'global';

/**
 * Event arguments for when the current Python environment changes.
 */
export type DidChangeEnvironmentEventArgs = {
    /**
     * The URI of the environment that changed.
     */
    readonly uri: Uri;

    /**
     * The old Python environment before the change.
     */
    readonly old: PythonEnvironment | undefined;

    /**
     * The new Python environment after the change.
     */
    readonly new: PythonEnvironment | undefined;
};

/**
 * Enum representing the kinds of environment changes.
 */
export enum EnvironmentChangeKind {
    /**
     * Indicates that an environment was added.
     */
    add = 'add',

    /**
     * Indicates that an environment was removed.
     */
    remove = 'remove',
}

/**
 * Event arguments for when the list of Python environments changes.
 */
export type DidChangeEnvironmentsEventArgs = {
    /**
     * The kind of change that occurred (add or remove).
     */
    kind: EnvironmentChangeKind;

    /**
     * The Python environment that was added or removed.
     */
    environment: PythonEnvironment;
}[];

export type PythonIsKnownContext = Uri | string;

/**
 * Result of checking if a context is a known Python environment.
 */
export interface PythonIsKnownResult {
    /**
     * The confidence level of the result (low, moderate, or high).
     */
    confidence: 'low' | 'moderate' | 'high';

    /**
     * The Python environment match.
     */
    result: 'unknown' | 'known' | 'canHandle';
}

/**
 * Type representing the context for resolving a Python environment.
 */
export type ResolveEnvironmentContext = PythonEnvironment | Uri;

/**
 * Interface representing an environment manager.
 */
export interface EnvironmentManager {
    /**
     * The name of the environment manager.
     */
    readonly name: string;

    /**
     * The display name of the environment manager.
     */
    readonly displayName?: string;

    /**
     * The preferred package manager ID for the environment manager.
     * @example 'ms-python.python:pip'
     */
    readonly preferredPackageManagerId: string;

    /**
     * The description of the environment manager.
     */
    readonly description?: string;

    /**
     * The tooltip for the environment manager, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString | undefined;

    /**
     * The icon path for the environment manager, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;

    /**
     * The log output channel for the environment manager.
     */
    readonly log?: LogOutputChannel;

    /**
     * Creates a new Python environment within the specified scope.
     * @param scope - The scope within which to create the environment.
     * @returns A promise that resolves to the created Python environment, or undefined if creation failed.
     */
    create?(scope: CreateEnvironmentScope): Promise<PythonEnvironment | undefined>;

    /**
     * Removes the specified Python environment.
     * @param environment - The Python environment to remove.
     * @returns A promise that resolves when the environment is removed.
     */
    remove?(environment: PythonEnvironment): Promise<void>;

    /**
     * Refreshes the list of Python environments within the specified scope.
     * @param scope - The scope within which to refresh environments.
     * @returns A promise that resolves when the refresh is complete.
     */
    refresh(scope: RefreshEnvironmentsScope): Promise<void>;

    /**
     * Retrieves a list of Python environments within the specified scope.
     * @param scope - The scope within which to retrieve environments.
     * @returns A promise that resolves to an array of Python environments.
     */
    getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]>;

    /**
     * Event that is fired when the list of Python environments changes.
     */
    onDidChangeEnvironments?: Event<DidChangeEnvironmentsEventArgs>;

    /**
     * Sets the current Python environment within the specified scope.
     * @param scope - The scope within which to set the environment.
     * @param environment - The Python environment to set. If undefined, the environment is unset.
     * @returns A promise that resolves when the environment is set.
     */
    set(scope: SetEnvironmentScope, environment?: PythonEnvironment): Promise<void>;

    /**
     * Retrieves the current Python environment within the specified scope.
     * @param scope - The scope within which to retrieve the environment.
     * @returns A promise that resolves to the current Python environment, or undefined if none is set.
     */
    get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined>;

    /**
     * Event that is fired when the current Python environment changes.
     */
    onDidChangeEnvironment?: Event<DidChangeEnvironmentEventArgs>;

    /**
     * Resolves the specified Python environment. The environment can be either a {@link PythonEnvironment} or a {@link Uri} context.
     *
     * This method is used to obtain a fully detailed {@link PythonEnvironment} object. The input can be:
     * - A {@link PythonEnvironment} object, which might be missing key details such as {@link PythonEnvironment.execInfo}.
     * - A {@link Uri} object, which typically represents either:
     *   - A folder that contains the Python environment.
     *   - The path to a Python executable.
     *
     * @param context - The context for resolving the environment, which can be a {@link PythonEnvironment} or a {@link Uri}.
     * @returns A promise that resolves to the fully detailed {@link PythonEnvironment}, or `undefined` if the environment cannot be resolved.
     */
    resolve(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined>;

    /**
     * Checks if the specified context is a known Python environment. The string/Uri can point to the environment root folder
     * or to python executable. It can also be a named environment.
     *
     * @param context - The URI/string context to check.
     * @returns A promise that resolves to the result of the check.
     */
    isKnown?(context: PythonIsKnownContext): Promise<PythonIsKnownResult>;

    /**
     * Clears the environment manager's cache.
     *
     * @returns A promise that resolves when the cache is cleared.
     */
    clearCache?(): Promise<void>;
}

/**
 * Interface representing a package ID.
 */
export interface PackageId {
    /**
     * The ID of the package.
     */
    id: string;

    /**
     * The ID of the package manager.
     */
    managerId: string;

    /**
     * The ID of the environment in which the package is installed.
     */
    environmentId: string;
}

/**
 * Interface representing package information.
 */
export interface PackageInfo {
    /**
     * The name of the package.
     */
    readonly name: string;

    /**
     * The display name of the package.
     */
    readonly displayName: string;

    /**
     * The version of the package.
     */
    readonly version?: string;

    /**
     * The description of the package.
     */
    readonly description?: string;

    /**
     * The tooltip for the package, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString | undefined;

    /**
     * The icon path for the package, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;

    /**
     * The URIs associated with the package.
     */
    readonly uris?: readonly Uri[];
}

/**
 * Interface representing a package.
 */
export interface Package extends PackageInfo {
    /**
     * The ID of the package.
     */
    readonly pkgId: PackageId;
}

/**
 * Enum representing the kinds of package changes.
 */
export enum PackageChangeKind {
    /**
     * Indicates that a package was added.
     */
    add = 'add',

    /**
     * Indicates that a package was removed.
     */
    remove = 'remove',
}

/**
 * Event arguments for when packages change.
 */
export interface DidChangePackagesEventArgs {
    /**
     * The Python environment in which the packages changed.
     */
    environment: PythonEnvironment;

    /**
     * The package manager responsible for the changes.
     */
    manager: PackageManager;

    /**
     * The list of changes, each containing the kind of change and the package affected.
     */
    changes: { kind: PackageChangeKind; pkg: Package }[];
}

/**
 * Interface representing a package manager.
 */
export interface PackageManager {
    /**
     * The name of the package manager.
     */
    name: string;

    /**
     * The display name of the package manager.
     */
    displayName?: string;

    /**
     * The description of the package manager.
     */
    description?: string;

    /**
     * The tooltip for the package manager, which can be a string or a Markdown string.
     */
    tooltip?: string | MarkdownString | undefined;

    /**
     * The icon path for the package manager, which can be a string, Uri, or an object with light and dark theme paths.
     */
    iconPath?: IconPath;

    /**
     * The log output channel for the package manager.
     */
    logOutput?: LogOutputChannel;

    /**
     * Installs packages in the specified Python environment.
     * @param environment - The Python environment in which to install packages.
     * @param packages - The packages to install.
     * @returns A promise that resolves when the installation is complete.
     */
    install(environment: PythonEnvironment, packages: string[], options: PackageInstallOptions): Promise<void>;

    /**
     * Uninstalls packages from the specified Python environment.
     * @param environment - The Python environment from which to uninstall packages.
     * @param packages - The packages to uninstall, which can be an array of packages or strings.
     * @returns A promise that resolves when the uninstall is complete.
     */
    uninstall(environment: PythonEnvironment, packages: Package[] | string[]): Promise<void>;

    /**
     * Refreshes the package list for the specified Python environment.
     * @param environment - The Python environment for which to refresh the package list.
     * @returns A promise that resolves when the refresh is complete.
     */
    refresh(environment: PythonEnvironment): Promise<void>;

    /**
     * Retrieves the list of packages for the specified Python environment.
     * @param environment - The Python environment for which to retrieve packages.
     * @returns An array of packages, or undefined if the packages could not be retrieved.
     */
    getPackages(environment: PythonEnvironment): Promise<Package[] | undefined>;

    /**
     * Get a list of installable items for a Python project.
     *
     * @param environment The Python environment for which to get installable items.
     *
     * Note: An environment can be used by multiple projects, so the installable items returned.
     * should be for the environment. IF you want to do it for a particular project, then you may
     * shown a QuickPick to the user to select the project, and filter the installable items based
     * on the project.
     */
    getInstallable?(environment: PythonEnvironment): Promise<Installable[]>;

    /**
     * Event that is fired when packages change.
     */
    onDidChangePackages?: Event<DidChangePackagesEventArgs>;

    /**
     * Clears the package manager's cache.
     * @returns A promise that resolves when the cache is cleared.
     */
    clearCache?(): Promise<void>;
}

/**
 * Interface representing a Python project.
 */
export interface PythonProject {
    /**
     * The name of the Python project.
     */
    readonly name: string;

    /**
     * The URI of the Python project.
     */
    readonly uri: Uri;

    /**
     * The description of the Python project.
     */
    readonly description?: string;

    /**
     * The tooltip for the Python project, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString;

    /**
     * The icon path for the Python project, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;
}

/**
 * Options for creating a Python project.
 */
export interface PythonProjectCreatorOptions {
    /**
     * The name of the Python project.
     */
    name: string;

    /**
     * Optional path that may be provided as a root for the project.
     */
    uri?: Uri;
}

/**
 * Interface representing a creator for Python projects.
 */
export interface PythonProjectCreator {
    /**
     * The name of the Python project creator.
     */
    readonly name: string;

    /**
     * The display name of the Python project creator.
     */
    readonly displayName?: string;

    /**
     * The description of the Python project creator.
     */
    readonly description?: string;

    /**
     * The tooltip for the Python project creator, which can be a string or a Markdown string.
     */
    readonly tooltip?: string | MarkdownString;

    /**
     * The icon path for the Python project creator, which can be a string, Uri, or an object with light and dark theme paths.
     */
    readonly iconPath?: IconPath;

    /**
     * Creates a new Python project or projects.
     * @param options - Optional parameters for creating the Python project.
     * @returns A promise that resolves to a Python project, an array of Python projects, or undefined.
     */
    create(options?: PythonProjectCreatorOptions): Promise<PythonProject | PythonProject[] | undefined>;
}

/**
 * Event arguments for when Python projects change.
 */
export interface DidChangePythonProjectsEventArgs {
    /**
     * The list of Python projects that were added.
     */
    added: PythonProject[];

    /**
     * The list of Python projects that were removed.
     */
    removed: PythonProject[];
}

/**
 * Options for package installation.
 */
export interface PackageInstallOptions {
    /**
     * Upgrade the packages if it is already installed.
     */
    upgrade?: boolean;
}

export interface Installable {
    /**
     * The display name of the package, requirements, pyproject.toml or any other project file.
     */
    readonly displayName: string;

    /**
     * Arguments passed to the package manager to install the package.
     *
     * @example
     *  ['debugpy==1.8.7'] for `pip install debugpy==1.8.7`.
     *  ['--pre', 'debugpy'] for `pip install --pre debugpy`.
     *  ['-r', 'requirements.txt'] for `pip install -r requirements.txt`.
     */
    readonly args: string[];

    /**
     * Installable group name, this will be used to group installable items in the UI.
     *
     * @example
     *  `Requirements` for any requirements file.
     *  `Packages` for any package.
     */
    readonly group?: string;

    /**
     * Path to the requirements, version of the package, or any other project file path.
     */
    readonly description?: string;

    /**
     * External Uri to the package on pypi or docs.
     * @example
     *  https://pypi.org/project/debugpy/ for `debugpy`.
     */
    readonly uri?: Uri;
}

export interface PythonEnvironmentManagerApi {
    /**
     * Register an environment manager implementation.
     *
     * @param manager Environment Manager implementation to register.
     * @returns A disposable that can be used to unregister the environment manager.
     * @see {@link EnvironmentManager}
     */
    registerEnvironmentManager(manager: EnvironmentManager): Disposable;

    /**
     * Create a Python environment item from the provided environment info. This item is used to interact
     * with the environment.
     *
     * @param info Some details about the environment like name, version, etc. needed to interact with the environment.
     * @param manager The environment manager to associate with the environment.
     * @returns The Python environment.
     */
    createPythonEnvironmentItem(info: PythonEnvironmentInfo, manager: EnvironmentManager): PythonEnvironment;

    /**
     * Create a Python environment using environment manager associated with the scope.
     *
     * @param scope Where the environment is to be created.
     * @returns The Python environment created. `undefined` if not created.
     */
    createEnvironment(scope: CreateEnvironmentScope): Promise<PythonEnvironment | undefined>;

    /**
     * Remove a Python environment.
     *
     * @param environment The Python environment to remove.
     * @returns A promise that resolves when the environment has been removed.
     */
    removeEnvironment(environment: PythonEnvironment): Promise<void>;

    /**
     * Initiates a refresh of Python environments within the specified scope.
     * @param scope - The scope within which to search for environments.
     * @returns A promise that resolves when the search is complete.
     */
    refreshEnvironments(scope: RefreshEnvironmentsScope): Promise<void>;

    /**
     * Retrieves a list of Python environments within the specified scope.
     * @param scope - The scope within which to retrieve environments.
     * @returns A promise that resolves to an array of Python environments.
     */
    getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]>;

    /**
     * Event that is fired when the list of Python environments changes.
     * @see {@link DidChangeEnvironmentsEventArgs}
     */
    onDidChangeEnvironments: Event<DidChangeEnvironmentsEventArgs>;

    /**
     * Sets the current Python environment within the specified scope.
     * @param scope - The scope within which to set the environment.
     * @param environment - The Python environment to set. If undefined, the environment is unset.
     */
    setEnvironment(scope: SetEnvironmentScope, environment?: PythonEnvironment): void;

    /**
     * Retrieves the current Python environment within the specified scope.
     * @param scope - The scope within which to retrieve the environment.
     * @returns A promise that resolves to the current Python environment, or undefined if none is set.
     */
    getEnvironment(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined>;

    /**
     * Event that is fired when the selected Python environment changes for Project, Folder or File.
     * @see {@link DidChangeEnvironmentEventArgs}
     */
    onDidChangeEnvironment: Event<DidChangeEnvironmentEventArgs>;

    /**
     * This method is used to get the details missing from a PythonEnvironment. Like
     * {@link PythonEnvironment.execInfo} and other details.
     *
     * @param context : The PythonEnvironment or Uri for which details are required.
     */
    resolveEnvironment(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined>;
}

export interface PythonPackageManagerApi {
    /**
     * Register a package manager implementation.
     *
     * @param manager Package Manager implementation to register.
     * @returns A disposable that can be used to unregister the package manager.
     * @see {@link PackageManager}
     */
    registerPackageManager(manager: PackageManager): Disposable;

    /**
     * Install packages into a Python Environment.
     *
     * @param environment The Python Environment into which packages are to be installed.
     * @param packages The packages to install.
     * @param options Options for installing packages.
     */
    installPackages(environment: PythonEnvironment, packages: string[], options: PackageInstallOptions): Promise<void>;

    /**
     * Uninstall packages from a Python Environment.
     *
     * @param environment The Python Environment from which packages are to be uninstalled.
     * @param packages The packages to uninstall.
     */
    uninstallPackages(environment: PythonEnvironment, packages: PackageInfo[] | string[]): Promise<void>;

    /**
     * Refresh the list of packages in a Python Environment.
     *
     * @param environment The Python Environment for which the list of packages is to be refreshed.
     * @returns A promise that resolves when the list of packages has been refreshed.
     */
    refreshPackages(environment: PythonEnvironment): Promise<void>;

    /**
     * Get the list of packages in a Python Environment.
     *
     * @param environment The Python Environment for which the list of packages is required.
     * @returns The list of packages in the Python Environment.
     */
    getPackages(environment: PythonEnvironment): Promise<Package[] | undefined>;

    /**
     * Event raised when the list of packages in a Python Environment changes.
     * @see {@link DidChangePackagesEventArgs}
     */
    onDidChangePackages: Event<DidChangePackagesEventArgs>;

    /**
     * Create a package item from the provided package info.
     *
     * @param info The package info.
     * @param environment The Python Environment in which the package is installed.
     * @param manager The package manager that installed the package.
     * @returns The package item.
     */
    createPackageItem(info: PackageInfo, environment: PythonEnvironment, manager: PackageManager): Package;
}

/**
 * The API for interacting with Python projects. A project in python is any folder or file that is a contained
 * in some manner. For example, a PEP-723 compliant file can be treated as a project. A folder with a `pyproject.toml`,
 * or just python files can be treated as a project. All this allows you to do is set a python environment for that project.
 *
 * By default all `vscode.workspace.workspaceFolders` are treated as projects.
 */
export interface PythonProjectApi {
    /**
     * Add a python project or projects to the list of projects.
     *
     * @param projects The project or projects to add.
     */
    addPythonProject(projects: PythonProject | PythonProject[]): void;

    /**
     * Remove a python project from the list of projects.
     *
     * @param project The project to remove.
     */
    removePythonProject(project: PythonProject): void;

    /**
     * Get all python projects.
     */
    getPythonProjects(): readonly PythonProject[];

    /**
     * Event raised when python projects are added or removed.
     * @see {@link DidChangePythonProjectsEventArgs}
     */
    onDidChangePythonProjects: Event<DidChangePythonProjectsEventArgs>;

    /**
     * Get the python project for a given URI.
     *
     * @param uri The URI of the project
     * @returns The project or `undefined` if not found.
     */
    getPythonProject(uri: Uri): PythonProject | undefined;

    /**
     * Register a Python project creator.
     *
     * @param creator The project creator to register.
     * @returns A disposable that can be used to unregister the project creator.
     * @see {@link PythonProjectCreator}
     */
    registerPythonProjectCreator(creator: PythonProjectCreator): Disposable;
}

/**
 * The API for interacting with Python environments, package managers, and projects.
 */
export interface PythonEnvironmentApi extends PythonEnvironmentManagerApi, PythonPackageManagerApi, PythonProjectApi {}