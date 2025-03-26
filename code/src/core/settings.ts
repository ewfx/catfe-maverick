import * as vscode from 'vscode';

/**
 * Configuration section name for the extension
 */
const CONFIG_SECTION = 'testAutomationAgent';

/**
 * Context strategy configuration
 */
export interface ContextStrategy {
    tokenLimit: number;
    historyDepth: number;
    prioritizeCode: boolean;
    includeProjectStructure: boolean;
}

/**
 * Settings manager for the extension
 * Provides type-safe access to configuration properties
 */
export class SettingsManager {
    /**
     * Gets the current AI provider configuration
     * @returns The selected AI provider
     */
    static getAiProvider(): 'openai' | 'claude' {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('aiProvider', 'claude');
    }

    /**
     * Gets the current AI model configuration
     * @returns The selected AI model
     */
    static getAiModel(): string {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('aiModel', 'claude-3.7-sonnet');
    }

    /**
     * Gets the API keys for the AI providers
     * @returns Object containing API keys for different providers
     */
    static getApiKeys(): Record<string, string> {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('apiKeys', {});
    }

    /**
     * Gets the Plan/Act mode configuration
     * @returns Boolean indicating if Plan/Act mode is enabled
     */
    static isPlanActModeEnabled(): boolean {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('planActMode', true);
    }

    /**
     * Gets the test environments configuration
     * @returns Object containing test environment configurations
     */
    static getTestEnvironments(): Record<string, any> {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('testEnvironments', {
            dev: {
                baseUrl: 'http://localhost:8080',
                apiKey: '',
                timeoutMs: 5000
            }
        });
    }

    /**
     * Gets the path to Karate BDD installation
     * @returns String path to Karate BDD installation
     */
    static getKaratePath(): string {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('karatePath', '');
    }

    /**
     * Gets the path to Allure reports
     * @returns String path to Allure reports
     */
    static getAllureReportPath(): string {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('allureReportPath', '');
    }

    /**
     * Gets the path to JaCoCo reports
     * @returns String path to JaCoCo reports
     */
    static getJacocoReportPath(): string {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('jacocoReportPath', '');
    }

    /**
     * Gets the path to JaCoCo agent JAR
     * @returns String path to JaCoCo agent JAR
     */
    static getJacocoAgentPath(): string {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('jacocoAgentPath', 'jacoco/jacocoagent.jar');
    }

    /**
     * Gets the path to JaCoCo CLI JAR
     * @returns String path to JaCoCo CLI JAR
     */
    static getJacocoCliPath(): string {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('jacocoCliPath', 'jacoco/jacococli.jar');
    }

    /**
     * Checks if approval is required for code changes
     * @returns Boolean indicating if approval is required
     */
    static isApprovalRequired(): boolean {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('requireApproval', true);
    }

    /**
     * Gets the MCP integration settings
     * @returns Object containing MCP tool configuration settings
     */
    static getMcpIntegration(): Record<string, any> {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('mcpIntegration', {});
    }
    
    /**
     * Gets the list of allowed commands for the command executor
     * @returns Array of allowed command patterns
     */
    static getAllowedCommands(): string[] {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('allowedCommands', [
            'npm',
            'node',
            'git',
            'java',
            'mvn',
            'ls',
            'dir',
            'cd',
            'echo',
            'cat',
            'open'
        ]);
    }

    /**
     * Gets the context strategy configuration
     * @returns The context strategy configuration
     */
    static getContextStrategy(): ContextStrategy {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get('contextStrategy', {
            tokenLimit: 90000,
            historyDepth: 10,
            prioritizeCode: true,
            includeProjectStructure: true
        });
    }

    /**
     * Updates the context strategy configuration
     * @param strategy The new context strategy
     * @param target Configuration target scope
     * @returns Promise that resolves when the setting is updated
     */
    static async updateContextStrategy(
        strategy: ContextStrategy,
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        await vscode.workspace.getConfiguration(CONFIG_SECTION).update('contextStrategy', strategy, target);
    }

    /**
     * Updates a configuration setting
     * @param key Configuration key to update
     * @param value New value for the configuration
     * @param target Configuration target scope
     * @returns Promise that resolves when the setting is updated
     */
    static async updateSetting(
        key: string, 
        value: any, 
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        await vscode.workspace.getConfiguration(CONFIG_SECTION).update(key, value, target);
    }
}
