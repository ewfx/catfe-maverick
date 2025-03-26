import * as vscode from 'vscode';
import { Commands } from './commands';

/**
 * Data provider for test scenarios view
 */
export class ScenariosViewProvider implements vscode.TreeDataProvider<ScenarioTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<ScenarioTreeItem | undefined | null | void> = new vscode.EventEmitter<ScenarioTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ScenarioTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }

    // Sample data - will be replaced with actual data management
    private scenarios: ScenarioTreeItem[] = [
        new ScenarioTreeItem('Generate Scenarios', 'Click to generate test scenarios', vscode.TreeItemCollapsibleState.None, {
            command: Commands.GENERATE_SCENARIOS,
            title: 'Generate Scenarios',
            arguments: []
        })
    ];

    getTreeItem(element: ScenarioTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ScenarioTreeItem): Thenable<ScenarioTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return Promise.resolve(this.scenarios);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addScenario(scenario: ScenarioTreeItem): void {
        this.scenarios.push(scenario);
        this.refresh();
    }

    clear(): void {
        this.scenarios = [
            new ScenarioTreeItem('Generate Scenarios', 'Click to generate test scenarios', vscode.TreeItemCollapsibleState.None, {
                command: Commands.GENERATE_SCENARIOS,
                title: 'Generate Scenarios',
                arguments: []
            })
        ];
        this.refresh();
    }
}

/**
 * Data provider for test cases view
 */
export class TestCasesViewProvider implements vscode.TreeDataProvider<TestCaseTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<TestCaseTreeItem | undefined | null | void> = new vscode.EventEmitter<TestCaseTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TestCaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }

    // Sample data - will be replaced with actual data management
    private testCases: TestCaseTreeItem[] = [
        new TestCaseTreeItem('Generate Test Cases', 'Click to generate BDD test cases', vscode.TreeItemCollapsibleState.None, {
            command: Commands.GENERATE_TEST_CASES,
            title: 'Generate Test Cases',
            arguments: []
        })
    ];

    getTreeItem(element: TestCaseTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TestCaseTreeItem): Thenable<TestCaseTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return Promise.resolve(this.testCases);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addTestCase(testCase: TestCaseTreeItem): void {
        this.testCases.push(testCase);
        this.refresh();
    }

    clear(): void {
        this.testCases = [
            new TestCaseTreeItem('Generate Test Cases', 'Click to generate BDD test cases', vscode.TreeItemCollapsibleState.None, {
                command: Commands.GENERATE_TEST_CASES,
                title: 'Generate Test Cases',
                arguments: []
            })
        ];
        this.refresh();
    }
}

/**
 * Data provider for test execution view
 */
export class ExecutionViewProvider implements vscode.TreeDataProvider<ExecutionTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<ExecutionTreeItem | undefined | null | void> = new vscode.EventEmitter<ExecutionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ExecutionTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }

    // Sample data - will be replaced with actual data management
    private executionItems: ExecutionTreeItem[] = [
        new ExecutionTreeItem('Execute Tests', 'Click to execute tests', vscode.TreeItemCollapsibleState.None, {
            command: Commands.EXECUTE_TESTS,
            title: 'Execute Tests',
            arguments: []
        })
    ];

    getTreeItem(element: ExecutionTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ExecutionTreeItem): Thenable<ExecutionTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return Promise.resolve(this.executionItems);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addExecutionItem(item: ExecutionTreeItem): void {
        this.executionItems.push(item);
        this.refresh();
    }

    clear(): void {
        this.executionItems = [
            new ExecutionTreeItem('Execute Tests', 'Click to execute tests', vscode.TreeItemCollapsibleState.None, {
                command: Commands.EXECUTE_TESTS,
                title: 'Execute Tests',
                arguments: []
            })
        ];
        this.refresh();
    }
}

/**
 * Data provider for coverage analysis view
 */
export class CoverageViewProvider implements vscode.TreeDataProvider<CoverageTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<CoverageTreeItem | undefined | null | void> = new vscode.EventEmitter<CoverageTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CoverageTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }

    // Sample data - will be replaced with actual data management
    private coverageItems: CoverageTreeItem[] = [
        new CoverageTreeItem('Enhanced Coverage Analysis', 'Analyze with JaCoCo, Karate, OpenAPI and Product specs', vscode.TreeItemCollapsibleState.None, {
            command: 'testautomationagent.analyzeCoverageEnhanced',
            title: 'Enhanced Coverage Analysis',
            arguments: []
        })
    ];

    getTreeItem(element: CoverageTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CoverageTreeItem): Thenable<CoverageTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return Promise.resolve(this.coverageItems);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addCoverageItem(item: CoverageTreeItem): void {
        this.coverageItems.push(item);
        this.refresh();
    }

    clear(): void {
        this.coverageItems = [
            new CoverageTreeItem('Enhanced Coverage Analysis', 'Analyze with JaCoCo, Karate, OpenAPI and Product specs', vscode.TreeItemCollapsibleState.None, {
                command: 'testautomationagent.analyzeCoverageEnhanced',
                title: 'Enhanced Coverage Analysis',
                arguments: []
            })
        ];
        this.refresh();
    }
}

/**
 * Data provider for remediation view
 * Commented out as requested
 */
/*
export class RemediationViewProvider implements vscode.TreeDataProvider<RemediationTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<RemediationTreeItem | undefined | null | void> = new vscode.EventEmitter<RemediationTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<RemediationTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }

    // Sample data - will be replaced with actual data management
    private remediationItems: RemediationTreeItem[] = [
        new RemediationTreeItem('Suggest Remediation', 'Click to suggest remediation for failing tests', vscode.TreeItemCollapsibleState.None, {
            command: Commands.SUGGEST_REMEDIATION,
            title: 'Suggest Remediation',
            arguments: []
        })
    ];

    getTreeItem(element: RemediationTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: RemediationTreeItem): Thenable<RemediationTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return Promise.resolve(this.remediationItems);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addRemediationItem(item: RemediationTreeItem): void {
        this.remediationItems.push(item);
        this.refresh();
    }

    clear(): void {
        this.remediationItems = [
            new RemediationTreeItem('Suggest Remediation', 'Click to suggest remediation for failing tests', vscode.TreeItemCollapsibleState.None, {
                command: Commands.SUGGEST_REMEDIATION,
                title: 'Suggest Remediation',
                arguments: []
            })
        ];
        this.refresh();
    }
}
*/

/**
 * Tree item for scenarios view
 */
export class ScenarioTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.command = command;
    }
}

/**
 * Tree item for test cases view
 */
export class TestCaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.command = command;
    }
}

/**
 * Tree item for execution view
 */
export class ExecutionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.command = command;
    }
}

/**
 * Tree item for coverage view
 */
export class CoverageTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.command = command;
    }
}

/**
 * Tree item for remediation view
 * Commented out as requested
 */
/*
export class RemediationTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.command = command;
    }
}
*/

/**
 * Registers all view providers for the extension
 * @param context Extension context
 */
export function registerViews(context: vscode.ExtensionContext): {
    scenariosProvider: ScenariosViewProvider,
    testCasesProvider: TestCasesViewProvider,
    executionProvider: ExecutionViewProvider,
    coverageProvider: CoverageViewProvider
    // remediationProvider commented out
} {
    // Create the view providers
    const scenariosProvider = new ScenariosViewProvider();
    const testCasesProvider = new TestCasesViewProvider();
    const executionProvider = new ExecutionViewProvider();
    const coverageProvider = new CoverageViewProvider();
    // Remediation provider commented out as requested
    // const remediationProvider = new RemediationViewProvider();

    // Register the tree data providers
    vscode.window.registerTreeDataProvider('testautomationagent.scenarioView', scenariosProvider);
    vscode.window.registerTreeDataProvider('testautomationagent.testCaseView', testCasesProvider);
    vscode.window.registerTreeDataProvider('testautomationagent.executionView', executionProvider);
    vscode.window.registerTreeDataProvider('testautomationagent.coverageView', coverageProvider);
    // Remediation view registration commented out as requested
    // vscode.window.registerTreeDataProvider('testautomationagent.remediationView', remediationProvider);

    return {
        scenariosProvider,
        testCasesProvider,
        executionProvider,
        coverageProvider
        // remediationProvider removed from return object
    };
}
