import * as vscode from 'vscode';
import { registerCommands } from './core/commands';
import { registerViews } from './core/views';
import { logger } from './utils/logger';
import { EnvironmentManager } from './testExecution/environmentManager';
import { registerCoverageCommands } from './coverage/coverageCommands';

/**
 * This method is called when the extension is activated.
 * The extension is activated the first time a command is executed.
 */
export function activate(context: vscode.ExtensionContext) {
    logger.info('TestAutomationAgent is now active!');
    // Show output channel when extension activates
    logger.show();
    
    // Register commands using the centralized registration function
    registerCommands(context);
    
    // Register enhanced coverage commands
    registerCoverageCommands(context);
    
    // Register views
    const { 
        scenariosProvider, 
        testCasesProvider, 
        executionProvider, 
        coverageProvider
        // remediationProvider removed
    } = registerViews(context);
    
    // Store providers in context for later use
    context.subscriptions.push(
        scenariosProvider,
        testCasesProvider,
        executionProvider,
        coverageProvider
        // remediationProvider removed
    );
    
    // Initialize the EnvironmentManager
    logger.info('Initializing EnvironmentManager...');
    EnvironmentManager.getInstance().initialize().then(() => {
        logger.info('EnvironmentManager initialized successfully');
    }).catch(error => {
        logger.error('Failed to initialize EnvironmentManager', error);
    });
    
    // Show ready status message
    vscode.window.showInformationMessage('TestAutomationAgent is now active!');
}

/**
 * This method is called when the extension is deactivated
 */
export function deactivate() {
    logger.info('TestAutomationAgent is now deactivated!');
}
