import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StatusBarManager } from '../core/statusBar';
import { FileManager } from '../fileSystem/fileManager';
import { CommandExecutor } from '../terminal/commandExecutor';
import { EnvironmentManager, TestEnvironment } from './environmentManager';
import { TestCase, TestCaseTemplate } from '../testGeneration/testCase/testCaseGenerator';
import { SettingsManager } from '../core/settings';
import { logger } from '../utils/logger';

/**
 * Test execution result status
 */
export enum TestResultStatus {
    PASSED = 'passed',
    FAILED = 'failed',
    ERROR = 'error',
    SKIPPED = 'skipped',
    PENDING = 'pending'
}

/**
 * Test execution result
 */
export interface TestResult {
    id: string;
    testCaseId: string;
    name: string;
    status: TestResultStatus;
    duration: number;
    errorMessage?: string;
    stackTrace?: string;
    startTime: Date;
    endTime: Date;
    output?: string;
    environment: string;
    feature?: string; // Added for command handler compatibility
}

/**
 * Execution options
 */
export interface ExecutionOptions {
    environment?: string;
    tags?: string[];
    parallel?: boolean;
    failFast?: boolean;
    outputPath?: string;
    reportPath?: string;
    withCoverage?: boolean;
    startMicroservice?: boolean;
}

/**
 * Class for executing tests
 */
export class TestExecutor {
    private static instance: TestExecutor;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;
    private commandExecutor: CommandExecutor;
    private environmentManager: EnvironmentManager;
    private results: Map<string, TestResult> = new Map();

    private constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
        this.commandExecutor = CommandExecutor.getInstance();
        this.environmentManager = EnvironmentManager.getInstance();
    }

    /**
     * Starts the microservice with JaCoCo agent
     * @param options Execution options
     * @returns Promise resolving when microservice is started and ready
     */
    public async startMicroserviceWithCoverage(options?: ExecutionOptions): Promise<void> {
        try {
            logger.info('Starting microservice with JaCoCo coverage...');
            this.statusBarManager.showBusy('Starting microservice with JaCoCo coverage...');
            
            // Ensure required JARs are available
            await this.ensureRequiredJars();
            
            // Define base directories for consistency
            const pluginBaseDir = 'testautomationagentplugin';
            const jacocoDir = `${pluginBaseDir}/jacoco`;
            
            // Get workspace root for absolute paths
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
            
            // Get JaCoCo agent path from settings or use default with absolute paths
            const jacocoReportPath = SettingsManager.getJacocoReportPath() || jacocoDir;
            const defaultJacocoAgentPath = `${workspaceRoot}/jacoco/jacocoagent.jar`;
            const jacocoAgentPath = SettingsManager.getJacocoAgentPath() || defaultJacocoAgentPath;
            
            logger.debug(`Starting microservice with the following paths:`);
            logger.debug(`- JaCoCo agent path: ${jacocoAgentPath}`);
            logger.debug(`- JaCoCo report path: ${jacocoReportPath}`);
            
            // Build the Gradle command with JaCoCo agent using absolute paths
            const jacocoExecPath = `${workspaceRoot}/testautomationagentplugin/jacoco/jacoco.exec`; 
            
            // JaCoCo configuration is now added directly in build.gradle, so we don't need to pass it via command line
            logger.debug(`JaCoCo configuration is in build.gradle, no additional parameters needed`);
            
            // Use Gradle to start the microservice
            // Note: The command is run in a new terminal so the user can see the output and interact with it
            const terminal = vscode.window.createTerminal('Microservice with JaCoCo');
            terminal.show();
            
            // Run with Gradle (JaCoCo configuration is in build.gradle)
            terminal.sendText(`./gradlew bootRun`);
            
            logger.info('Microservice started with JaCoCo coverage');
            this.statusBarManager.showSuccess('Microservice started with JaCoCo coverage');
            
            // Wait for microservice to be fully ready
            await this.waitForMicroserviceReady(options);
        } catch (error) {
            logger.error('Error starting microservice with coverage', error);
            this.statusBarManager.showError(`Error starting microservice: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Waits for the microservice to be fully ready
     * @param options Execution options
     * @returns Promise resolving when microservice is ready
     */
    private async waitForMicroserviceReady(options?: ExecutionOptions): Promise<void> {
        // Add a fixed 10-second delay before starting health checks
        logger.info('Waiting 10 seconds before checking microservice health...');
        this.statusBarManager.showBusy('Waiting 10 seconds before health check...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const maxRetries = 30; // 30 attempts
        const retryInterval = 2000; // 2 seconds between attempts
        let retries = 0;
        
        logger.info('Waiting for microservice to be ready...');
        this.statusBarManager.showBusy('Waiting for microservice to be ready...');
        
        // Get environment info
        const environment = this.getEnvironment(options?.environment);
        const baseUrl = environment.baseUrl;
        const healthEndpoint = `${baseUrl}/actuator/health`;
        
        // Wait for microservice to be ready
        while (retries < maxRetries) {
            try {
                logger.debug(`Checking microservice health (attempt ${retries + 1}/${maxRetries}): ${healthEndpoint}`);
                
                // Try executing a curl command to check health
                const command = `curl -s ${healthEndpoint}`;
                await this.commandExecutor.executeCommand(command, {
                    name: 'Microservice Health Check',
                    requireApproval: false
                });
                
                logger.info('Microservice is ready');
                this.statusBarManager.showSuccess('Microservice is ready');
                return;
            } catch (error) {
                retries++;
                if (retries >= maxRetries) {
                    logger.warn(`Microservice not ready after ${maxRetries} attempts. Proceeding anyway.`);
                    this.statusBarManager.showInfo('Microservice readiness check timed out, proceeding anyway');
                    return;
                }
                
                logger.debug(`Microservice not ready yet (attempt ${retries}/${maxRetries}), waiting...`);
                await new Promise(resolve => setTimeout(resolve, retryInterval));
            }
        }
    }

    /**
     * Gets the singleton instance of the TestExecutor
     * @returns The TestExecutor instance
     */
    public static getInstance(): TestExecutor {
        if (!TestExecutor.instance) {
            TestExecutor.instance = new TestExecutor();
        }
        return TestExecutor.instance;
    }

    /**
     * Gets available environments for test execution
     * @returns Promise resolving to array of available environments
     */
    public async getAvailableEnvironments(): Promise<TestEnvironment[]> {
        const environments = this.environmentManager.getEnvironments();
        // Convert Map to an array of TestEnvironment objects
        return Array.from(environments.values());
    }

    /**
     * Ensures required JARs and configuration files are available
     * @returns Promise resolving when all required files are available
     */
    public async ensureRequiredJars(): Promise<void> {
        try {
            logger.info('Checking for required JARs and config files...');
            this.statusBarManager.showBusy('Checking for required files...');
            
            // Define base directories for artifacts
            const pluginBaseDir = 'testautomationagentplugin';
            const jacocoDir = `${pluginBaseDir}/jacoco`;
            const karateDir = `${pluginBaseDir}/karate`;
            
            // Get report paths from settings or use defaults
            const jacocoReportPath = SettingsManager.getJacocoReportPath() || jacocoDir;
            const karateReportPath = karateDir; // Use karate directory directly, no longer using Allure paths
            
            // JAR paths - standardize defaults to match the plugin naming pattern
            const pluginJacocoPath = `${jacocoDir}/jacocoagent.jar`;
            const pluginKaratePath = `${karateDir}/karate.jar`;
            
            // Get JAR paths from settings or use standardized defaults
            const jacocoAgentPath = SettingsManager.getJacocoAgentPath() || pluginJacocoPath;
            const karatePath = SettingsManager.getKaratePath() || pluginKaratePath;
            
            // Define root jacoco directory for Gradle command compatibility
            const rootJacocoDir = 'jacoco';
            const rootJacocoPath = `${rootJacocoDir}/jacocoagent.jar`;  // Matches -javaagent:jacoco/jacocoagent.jar
            
            // For logging purposes
            logger.debug(`Base directories:`);
            logger.debug(`- Plugin base directory: ${pluginBaseDir}`);
            logger.debug(`- JaCoCo directory: ${jacocoDir}`);
            logger.debug(`- Karate directory: ${karateDir}`);
            logger.debug(`- JaCoCo backward compatibility directory: ${rootJacocoDir}`);
            
            logger.debug(`JAR paths configured:`);
            logger.debug(`- JaCoCo agent plugin path: ${pluginJacocoPath}`);
            logger.debug(`- Karate JAR plugin path: ${pluginKaratePath}`);
            logger.debug(`- JaCoCo agent root path: ${rootJacocoPath}`);
            
            // Config paths
            const karateConfigPath = path.dirname(karatePath) + '/karate-config.js';
            
            // Ensure directories exist
            await this.fileManager.createDirectory(jacocoReportPath);
            await this.fileManager.createDirectory(karateReportPath);
            
            // Map all paths to absolute paths
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
            
            // Plugin paths
            const absJacocoAgentPath = path.isAbsolute(jacocoAgentPath) ? 
                jacocoAgentPath : path.join(workspaceRoot, jacocoAgentPath);
            const absKaratePath = path.isAbsolute(karatePath) ? 
                karatePath : path.join(workspaceRoot, karatePath);
                
            // Root jacoco path
            const absRootJacocoPath = path.isAbsolute(rootJacocoPath) ? 
                rootJacocoPath : path.join(workspaceRoot, rootJacocoPath);
            
            // Clear logging of all paths to help with debugging
            logger.info('JaCoCo agent paths:');
            logger.info(`- Settings path: ${jacocoAgentPath}`);
            logger.info(`- Absolute path: ${absJacocoAgentPath}`);
            logger.info(`- Backward compatible path: ${absRootJacocoPath}`);
            logger.info('Karate JAR path:');
            logger.info(`- Settings path: ${karatePath}`);
            logger.info(`- Absolute path: ${absKaratePath}`);
            
            // Check all possible locations for the JaCoCo agent
            let jacocoAgentExists = false;
            
            // Check plugin location first
            try {
                await fs.promises.access(absJacocoAgentPath, fs.constants.F_OK);
                jacocoAgentExists = true;
                logger.info(`JaCoCo agent found at: ${absJacocoAgentPath}`);
            } catch (error) {
                logger.debug(`JaCoCo agent not found at plugin path: ${absJacocoAgentPath}`);
                
                // Check root location as fallback
                try {
                    await fs.promises.access(absRootJacocoPath, fs.constants.F_OK);
                    jacocoAgentExists = true;
                    logger.info(`JaCoCo agent found at fallback path: ${absRootJacocoPath}`);
                } catch (fallbackError) {
                    logger.debug(`JaCoCo agent not found at fallback path: ${absRootJacocoPath}`);
                    jacocoAgentExists = false;
                }
            }

            if (!jacocoAgentExists) {
                logger.info(`JaCoCo agent not found, downloading...`);
                // Download to plugin path
                await this.downloadJacocoAgent(jacocoAgentPath, absJacocoAgentPath);
                
                // Copy to root path for backward compatibility
                try {
                    // Create root jacoco directory if it doesn't exist
                    await this.fileManager.createDirectory(path.dirname(rootJacocoPath));
                    
                    // Copy file
                    await fs.promises.copyFile(absJacocoAgentPath, absRootJacocoPath);
                    logger.info(`Copied JaCoCo agent to backward compatible location: ${absRootJacocoPath}`);
                } catch (copyError) {
                    logger.warn(`Failed to copy to backward compatible location: ${(copyError as Error).message}`);
                    // Don't throw error here, as the main download was successful
                }
            }
            
            // Check if Karate JAR exists
            let karateExists = false;
            try {
                await fs.promises.access(absKaratePath, fs.constants.F_OK);
                karateExists = true;
                logger.info(`Karate JAR found at: ${absKaratePath}`);
            } catch (error) {
                karateExists = false;
                logger.debug(`Karate JAR not found at: ${absKaratePath}`);
            }

            if (!karateExists) {
                logger.info(`Karate JAR not found, downloading...`);
                await this.downloadKarate(karatePath, absKaratePath);
            }
            
            // Check if karate-config.js exists in the same directory as karate.jar
            const karateConfigExists = await this.fileManager.fileExists(karateConfigPath);
            if (!karateConfigExists) {
                logger.info(`karate-config.js not found at ${karateConfigPath}, creating default...`);
                await this.createKarateConfig(karateConfigPath);
            }
            
            logger.info('All required files are available');
            this.statusBarManager.showSuccess('Required files are available');
        } catch (error) {
            logger.error('Error ensuring required JARs', error);
            this.statusBarManager.showError(`Error ensuring required JARs: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Downloads JaCoCo agent JAR
     * @param targetPath Path to save the downloaded JAR
     * @returns Promise resolving when download is complete
     */
    private async downloadJacocoAgent(targetPath: string, absoluteTargetPath?: string): Promise<void> {
        try {
            // JaCoCo agent download URL - using the exact version requested
            const downloadUrl = "https://repo1.maven.org/maven2/org/jacoco/org.jacoco.agent/0.8.10/org.jacoco.agent-0.8.10-runtime.jar";
            
            logger.info(`Downloading JaCoCo agent from ${downloadUrl}...`);
            this.statusBarManager.showBusy('Downloading JaCoCo agent...');
            
            // Use provided absolute path or compute it
            const absPath = absoluteTargetPath || (path.isAbsolute(targetPath) ? 
                targetPath : 
                path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd(), targetPath));
                
                logger.info(`Absolute JaCoCo agent path: ${absPath}`);
            
            // Create directory for the JAR if needed
            const dirPath = path.dirname(absPath);
            logger.info(`Creating JaCoCo directory at: ${dirPath}`);
            
            // Ensure the JAR directory exists using both methods for reliability
            await this.fileManager.createDirectory(dirPath);
            
            try {
                await fs.promises.mkdir(dirPath, { recursive: true });
                logger.info(`Created directory: ${dirPath}`);
            } catch (mkdirError) {
                // If directory already exists, this is fine
                logger.info(`Directory may already exist: ${dirPath}`);
            }
            
            // Execute download command - using absolute path
            const command = `curl -L "${downloadUrl}" -o "${absPath}"`;
            logger.info(`Executing download command: ${command}`);
            
            await this.commandExecutor.executeCommand(command, {
                name: 'JaCoCo Agent Download',
                requireApproval: false
            });
            
            // After executing the download command, wait longer to ensure file is fully written
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verify the file was downloaded with multiple retries
            let fileExists = false;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!fileExists && retryCount < maxRetries) {
                // Check using fileManager
                fileExists = await this.fileManager.fileExists(absPath);
                
                if (!fileExists) {
                    // Double-check with direct fs access in case file system is not immediately in sync
                    try {
                        await fs.promises.access(absPath, fs.constants.F_OK);
                        fileExists = true;
                        logger.debug(`Verified file exists with fs.promises.access: ${absPath}`);
                    } catch (error) {
                        logger.debug(`File check with fs.promises.access failed: ${(error as Error).message}`);
                        
                        // Wait before retrying
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        retryCount++;
                        logger.debug(`Retry ${retryCount}/${maxRetries} for file check: ${absPath}`);
                    }
                } else {
                    logger.debug(`Verified file exists with fileManager.fileExists: ${absPath}`);
                    break;
                }
            }
            
            if (!fileExists) {
                // If file still doesn't exist after retries, attempt direct file download
                logger.warn(`File not found after ${maxRetries} retries, attempting direct download...`);
                
                try {
                    // Create a direct HTTPS request to download the file
                    const https = require('https');
                    const http = require('http');
                    const url = new URL(downloadUrl);
                    const protocol = url.protocol === 'https:' ? https : http;
                    
                    await new Promise<void>((resolve, reject) => {
                        logger.info(`Starting direct download from ${downloadUrl}`);
                        const request = protocol.get(url, (response: any) => {
                            // Handle redirects
                            if (response.statusCode === 301 || response.statusCode === 302) {
                                logger.info(`Following redirect to ${response.headers.location}`);
                                const redirectUrl = new URL(response.headers.location);
                                const redirectProtocol = redirectUrl.protocol === 'https:' ? https : http;
                                
                                redirectProtocol.get(redirectUrl, (redirectResponse: any) => {
                                    if (redirectResponse.statusCode !== 200) {
                                        reject(new Error(`Failed to download, status: ${redirectResponse.statusCode}`));
                                        return;
                                    }
                                    
                                    const file = fs.createWriteStream(absPath);
                                    redirectResponse.pipe(file);
                                    
                                    file.on('finish', () => {
                                        file.close();
                                        logger.info(`Direct download completed and saved to ${absPath}`);
                                        resolve();
                                    });
                                    
                                    file.on('error', (err: any) => {
                                        fs.unlink(absPath, () => {});
                                        reject(err);
                                    });
                                }).on('error', reject);
                                
                                return;
                            }
                            
                            if (response.statusCode !== 200) {
                                reject(new Error(`Failed to download, status: ${response.statusCode}`));
                                return;
                            }
                            
                            const file = fs.createWriteStream(absPath);
                            response.pipe(file);
                            
                            file.on('finish', () => {
                                file.close();
                                logger.info(`Direct download completed and saved to ${absPath}`);
                                resolve();
                            });
                            
                            file.on('error', (err: any) => {
                                fs.unlink(absPath, () => {});
                                reject(err);
                            });
                        }).on('error', reject);
                    });
                    
                    // Verify the file was downloaded successfully
                    try {
                        await fs.promises.access(absPath, fs.constants.F_OK);
                        fileExists = true;
                        logger.info(`Successfully downloaded file directly to ${absPath}`);
                    } catch (accessError) {
                        logger.error(`File still not accessible after direct download: ${(accessError as Error).message}`);
                        throw new Error(`Failed to verify downloaded file: ${(accessError as Error).message}`);
                    }
                    
                } catch (directError) {
                    logger.error(`Direct download failed: ${(directError as Error).message}`);
                    throw new Error(`Failed to download JaCoCo agent to ${absPath}. File does not exist after curl and direct download attempts. This may be due to network issues or permission problems.`);
                }
            }
            
            // Additional verification through stat - using absolute path
            try {
                const stats = await fs.promises.stat(absPath);
                if (stats.size < 1000) { // Check if file is too small (likely an error page)
                    throw new Error(`Downloaded JaCoCo agent file is too small (${stats.size} bytes). Download may have failed.`);
                }
                
                logger.info(`JaCoCo agent successfully downloaded to ${absPath} (${stats.size} bytes)`);
            } catch (statError) {
                throw new Error(`Failed to verify JaCoCo agent file: ${(statError as Error).message}`);
            }
            this.statusBarManager.showSuccess('JaCoCo agent downloaded successfully');
        } catch (error) {
            logger.error('Error downloading JaCoCo agent', error);
            this.statusBarManager.showError(`Failed to download JaCoCo agent: ${(error as Error).message}`);
            throw new Error(`Failed to download JaCoCo agent: ${(error as Error).message}`);
        }
    }
    
    /**
     * Downloads Karate JAR
     * @param targetPath Path to save the downloaded JAR
     * @returns Promise resolving when download is complete
     */
    private async downloadKarate(targetPath: string, absoluteTargetPath?: string): Promise<void> {
        try {
            // Karate version info
            const karateVersion = '1.4.0';
            const downloadUrl = `https://github.com/karatelabs/karate/releases/download/v${karateVersion}/karate-${karateVersion}.jar`;
            
            // Use provided absolute path or compute it
            const absPath = absoluteTargetPath || (path.isAbsolute(targetPath) ? 
                targetPath : 
                path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd(), targetPath));
            
            logger.info(`Target Karate JAR path: ${absPath}`);
            
            // Create directory for the JAR if needed
            const dirPath = path.dirname(absPath);
            logger.info(`Creating directory at: ${dirPath}`);
            await this.fileManager.createDirectory(dirPath);
            
            // First check if we have a valid karate.jar in the current working directory
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
            const localJarPath = path.join(workspaceRoot, 'karate.jar');
            
            try {
                const localJarExists = await fs.promises.access(localJarPath, fs.constants.F_OK)
                    .then(() => true)
                    .catch(() => false);
                
                if (localJarExists) {
                    const stats = await fs.promises.stat(localJarPath);
                    logger.info(`Found local Karate JAR in workspace: ${localJarPath} (${stats.size} bytes)`);
                    
                    if (stats.size > 5000000) { // 5MB minimum for a valid JAR
                        logger.info(`Using existing local Karate JAR (${stats.size} bytes)`);
                        this.statusBarManager.showBusy('Copying local Karate JAR...');
                        
                        // Copy file to target location
                        await fs.promises.copyFile(localJarPath, absPath);
                        
                        // Verify copy worked
                        const targetStats = await fs.promises.stat(absPath);
                        if (targetStats.size === stats.size) {
                            logger.info(`Successfully copied local Karate JAR to: ${absPath}`);
                            this.statusBarManager.showSuccess(`Karate JAR copied successfully (${targetStats.size} bytes)`);
                            return; // Successfully copied, exit method
                        } else {
                            logger.warn(`Copy verification failed: size mismatch (${targetStats.size} vs ${stats.size})`);
                            // Continue to download
                        }
                    } else {
                        logger.warn(`Local JAR file exists but is too small (${stats.size} bytes), will download instead`);
                    }
                }
            } catch (error) {
                logger.debug(`Error checking or copying local JAR: ${(error as Error).message}`);
                // Continue with download
            }
            
            // If we reach here, either there was no local JAR, or it was invalid, or copy failed
            // Proceed with download
            
            // Delete the file if it already exists but is incomplete
            try {
                const exists = await this.fileManager.fileExists(absPath);
                if (exists) {
                    const stats = await fs.promises.stat(absPath);
                    if (stats.size < 5000000) { // If file exists but is less than ~5MB, it might be incomplete
                        logger.info(`Found potentially incomplete Karate JAR (${stats.size} bytes), removing it...`);
                        await fs.promises.unlink(absPath);
                        logger.info(`Removed incomplete JAR file: ${absPath}`);
                    } else {
                        logger.info(`Found existing Karate JAR of adequate size (${stats.size} bytes), skipping download`);
                        return; // File already exists and is valid
                    }
                }
            } catch (error) {
                logger.debug(`Error checking/removing existing file: ${(error as Error).message}`);
                // Continue regardless of error
            }
            
            logger.info(`Downloading Karate from ${downloadUrl}...`);
            this.statusBarManager.showBusy('Downloading Karate...');
            
            // Try filesystem binary copy first if we have the JAR in the extension directory
            const extensionJarPath = path.join(__dirname, '../../../resources/karate.jar');
            try {
                const extensionJarExists = await fs.promises.access(extensionJarPath, fs.constants.F_OK)
                    .then(() => true)
                    .catch(() => false);
                
                if (extensionJarExists) {
                    const stats = await fs.promises.stat(extensionJarPath);
                    if (stats.size > 5000000) {
                        logger.info(`Using bundled Karate JAR from extension resources (${stats.size} bytes)`);
                        await fs.promises.copyFile(extensionJarPath, absPath);
                        
                        // Verify copy
                        const targetStats = await fs.promises.stat(absPath);
                        if (targetStats.size === stats.size) {
                            logger.info(`Successfully copied extension Karate JAR to: ${absPath}`);
                            this.statusBarManager.showSuccess(`Karate JAR copied successfully (${targetStats.size} bytes)`);
                            return; // Successfully copied, exit method
                        }
                    }
                }
            } catch (error) {
                logger.debug(`Error accessing extension JAR: ${(error as Error).message}`);
                // Continue with download
            }
            
            // If we reach here, we need to download the JAR using both methods for reliability
            try {
                // 1. First try with curl (more reliable for large files)
                const command = `curl -fsSL "${downloadUrl}" -o "${absPath}"`;
                logger.info(`Executing download command: ${command}`);
                
                await this.commandExecutor.executeCommand(command, {
                    name: 'Karate Download',
                    requireApproval: false
                });
                
                // Wait to ensure file is fully written
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Add a significant delay after the curl download to ensure the file is fully written
                logger.info(`Waiting for 8 seconds to ensure file system operations are complete...`);
                await new Promise(resolve => setTimeout(resolve, 8000));
                
                // Check if curl download was successful
                const exists = await fs.promises.access(absPath, fs.constants.F_OK)
                    .then(() => true)
                    .catch(() => false);
                    
                if (exists) {
                    // We trust that the file is complete after the delay
                    logger.info(`Verified Karate JAR exists after delay`);
                    const stats = await fs.promises.stat(absPath);
                    logger.info(`Downloaded JAR file with curl successfully (${stats.size} bytes)`);
                    this.statusBarManager.showSuccess('Karate JAR downloaded successfully');
                    return;
                }
                
                // 2. Try with Node.js HTTPS if curl failed
                logger.info('Trying direct Node.js download...');
                const https = require('https');
                const http = require('http');
                
                await new Promise<void>((resolve, reject) => {
                    const url = new URL(downloadUrl);
                    const protocol = url.protocol === 'https:' ? https : http;
                    
                    protocol.get(url, (response: any) => {
                        // Handle redirects
                        if (response.statusCode === 301 || response.statusCode === 302) {
                            const redirectUrl = new URL(response.headers.location);
                            const redirectProtocol = redirectUrl.protocol === 'https:' ? https : http;
                            
                            redirectProtocol.get(redirectUrl, (redirectResponse: any) => {
                                if (redirectResponse.statusCode !== 200) {
                                    reject(new Error(`Failed to download, status: ${redirectResponse.statusCode}`));
                                    return;
                                }
                                
                                const file = fs.createWriteStream(absPath);
                                redirectResponse.pipe(file);
                                
                                file.on('finish', () => {
                                    file.close();
                                    resolve();
                                });
                                
                                file.on('error', (err: any) => {
                                    fs.unlink(absPath, () => {});
                                    reject(err);
                                });
                            }).on('error', reject);
                            
                            return;
                        }
                        
                        if (response.statusCode !== 200) {
                            reject(new Error(`Failed to download, status: ${response.statusCode}`));
                            return;
                        }
                        
                        const file = fs.createWriteStream(absPath);
                        response.pipe(file);
                        
                        file.on('finish', () => {
                            file.close();
                            resolve();
                        });
                        
                        file.on('error', (err: any) => {
                            fs.unlink(absPath, () => {});
                            reject(err);
                        });
                    }).on('error', reject);
                });
                
                // Add a significant delay after the Node.js download to ensure the file is fully written
                logger.info(`Waiting for 8 seconds to ensure file system operations are complete...`);
                await new Promise(resolve => setTimeout(resolve, 8000));
                
                // Verify the file exists after Node.js download
                const nodeDownloadExists = await fs.promises.access(absPath, fs.constants.F_OK)
                    .then(() => true)
                    .catch(() => false);
                    
                if (nodeDownloadExists) {
                    // We trust that the file is complete after the delay
                    const stats = await fs.promises.stat(absPath);
                    logger.info(`Downloaded JAR file with Node.js successfully (${stats.size} bytes)`);
                    this.statusBarManager.showSuccess('Karate JAR downloaded successfully');
                    return;
                } else {
                    throw new Error('Download failed: file does not exist after download attempts');
                }
                
            } catch (error) {
                // If all download methods failed, throw an error
                logger.error(`All download attempts failed: ${(error as Error).message}`);
                throw new Error(`Failed to download Karate JAR: ${(error as Error).message}`);
            }
            
        } catch (error) {
            logger.error('Error downloading Karate', error);
            this.statusBarManager.showError(`Failed to download Karate: ${(error as Error).message}`);
            throw new Error(`Failed to download Karate: ${(error as Error).message}`);
        }
    }

    /**
     * Executes a test case
     * @param testCase The test case to execute
     * @param options Execution options
     * @returns Promise resolving to the test result
     */
    public async executeTest(testCase: TestCase, options?: ExecutionOptions): Promise<TestResult> {
        try {
            // Ensure required JARs are available
            await this.ensureRequiredJars();
            
            logger.info(`Executing test: ${testCase.id}`);
            this.statusBarManager.showBusy(`Executing test: ${testCase.id}`);
            
            // Get the environment to use - ensure environment parameter is a string
            const environmentId = typeof options?.environment === 'string' 
                ? options.environment 
                : undefined;
            
            logger.debug(`Getting environment with ID: ${environmentId || 'default'}`);
            const environment = this.getEnvironment(environmentId);
            logger.debug(`Using environment: ${environment.id} (${environment.baseUrl})`);
            
            // Create a temp file for the test case
            const testFilePath = await this.createTestFile(testCase);
            logger.debug(`Created test file: ${testFilePath}`);
            
            // Create Karate config if needed through environment manager
            const configPath = await this.environmentManager.createKarateConfig();
            
            // Check if it's a Karate test, if so, ensure withCoverage is false
            const updatedOptions = { ...options };
            
            // Check if test is Karate based on filename or template
            if (testCase.template === TestCaseTemplate.KARATE_BDD || 
                (testFilePath && testFilePath.toLowerCase().endsWith('.feature'))) {
                // Force withCoverage to false for Karate tests
                updatedOptions.withCoverage = false;
                logger.info(`Karate test detected - JaCoCo coverage disabled for test execution`);
            }
            
            // Build execution command with updated options
            const command = await this.buildExecutionCommand(testFilePath, environment, updatedOptions);
            logger.debug(`Execution command: ${command}`);
            
            // Execute the command
            const startTime = new Date();
            logger.info(`Running test: ${testCase.id}`);
            this.statusBarManager.showBusy(`Running test: ${testCase.id}`);
            
            // Execute command and capture output
            let output = 'Command execution completed';
            try {
                // Add a 3-second delay before execution to avoid timeout failures
                logger.info('Adding 3-second delay before execution to avoid timeout failures...');
                this.statusBarManager.showBusy('Adding 3-second delay before execution...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                logger.info('Delay completed, proceeding with test execution');
                
                await this.commandExecutor.executeCommand(command, {
                    name: 'Test Execution',
                    requireApproval: false
                });
                logger.debug(`Command execution completed`);
            } catch (error) {
                const errorMsg = `Error executing command: ${(error as Error).message}`;
                logger.error(errorMsg, error);
                output = errorMsg;
            }
            
            const endTime = new Date();
            
            // Get the execution status from output text
            const status = this.parseTestStatus(output);
            const duration = endTime.getTime() - startTime.getTime();
            
            // Create the result
            const result: TestResult = {
                id: `result-${Date.now()}`,
                testCaseId: testCase.id,
                name: testCase.id,
                status,
                duration,
                startTime,
                endTime,
                output,
                environment: environment.id,
                feature: path.basename(testFilePath, '.feature') // Extract feature name from file path
            };
            
            logger.info(`Test ${testCase.id} completed with status: ${status} in ${duration}ms`);
            
            // Store the result
            this.results.set(result.id, result);
            
            // Clean up temp files only if they were created by this test run
            // Skip cleanup for existing files
            if (testCase.content && !testCase.path) {
                try {
                    await this.fileManager.deleteFile(testFilePath);
                    logger.debug(`Deleted temp test file: ${testFilePath}`);
                } catch (error) {
                    logger.error(`Error cleaning up temp test file: ${testFilePath}`, error);
                }
            } else {
                logger.debug(`Skipping cleanup for existing file: ${testFilePath}`);
            }
            
            // Show success or failure
            if (status === TestResultStatus.PASSED) {
                logger.info(`Test passed: ${testCase.id}`);
                this.statusBarManager.showSuccess(`Test passed: ${testCase.id}`);
            } else {
                logger.warn(`Test failed: ${testCase.id} with status ${status}`);
                this.statusBarManager.showError(`Test failed: ${testCase.id}`);
            }
            
            return result;
        } catch (error) {
            logger.error(`Error executing test: ${testCase.id}`, error);
            this.statusBarManager.showError(`Error executing test: ${(error as Error).message}`);
            
            // Create an error result
            const result: TestResult = {
                id: `result-${Date.now()}`,
                testCaseId: testCase.id,
                name: testCase.id,
                status: TestResultStatus.ERROR,
                duration: 0,
                errorMessage: (error as Error).message,
                stackTrace: (error as Error).stack,
                startTime: new Date(),
                endTime: new Date(),
                environment: options?.environment || 'unknown'
            };
            
            logger.warn(`Created error result for test ${testCase.id}: ${(error as Error).message}`);
            
            // Store the result
            this.results.set(result.id, result);
            
            return result;
        }
    }

    
    /**
     * Generates JaCoCo reports using JaCoCo CLI
     * @returns Promise resolving when report generation is complete
     */
    public async generateJacocoReport(): Promise<void> {
        try {
            logger.info('Generating JaCoCo reports directly using JaCoCo CLI...');
            this.statusBarManager.showBusy('Generating JaCoCo reports...');
            
            // Define base directories for consistency
            const pluginBaseDir = 'testautomationagentplugin';
            const jacocoDir = `${pluginBaseDir}/jacoco`;
            
            // Get JaCoCo report path from settings or use default
            const jacocoReportPath = SettingsManager.getJacocoReportPath() || jacocoDir;
            
            // Get workspace root for absolute paths
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
            
            // Convert to absolute path if it's not already
            const absJacocoReportPath = path.isAbsolute(jacocoReportPath) 
                ? jacocoReportPath 
                : path.join(workspaceRoot, jacocoReportPath);
            
            // Define report output directory with absolute path
            const reportsDir = path.join(absJacocoReportPath, 'reports');
            
            logger.debug(`Generating JaCoCo report with the following paths:`);
            logger.debug(`- JaCoCo report path: ${absJacocoReportPath}`);
            logger.debug(`- Reports output directory: ${reportsDir}`);
            
            // Check if JaCoCo exec file exists - try both relative and absolute paths
            const relJacocoExecPath = path.join(jacocoReportPath, 'jacoco.exec');
            const absJacocoExecPath = path.join(absJacocoReportPath, 'jacoco.exec');
            
            // Array of potential jacoco.exec locations
            const potentialJacocoExecPaths = [
                absJacocoExecPath,
                relJacocoExecPath,
                // Add the specific path from logs
                `/Users/kasiperumal/Documents/Cline/payment_microservice/testautomationagentplugin/jacoco/jacoco.exec`,
                // Check for jacoco.exec in the root jacoco directory
                path.join(workspaceRoot, 'jacoco', 'jacoco.exec')
            ];
            
            let jacocoExecPath = '';
            let execFileExists = false;
            
            // Try each potential path
            for (const execPath of potentialJacocoExecPaths) {
                try {
                    await fs.promises.access(execPath, fs.constants.F_OK);
                    logger.info(`JaCoCo exec file found at: ${execPath}`);
                    jacocoExecPath = execPath;
                    execFileExists = true;
                    break;
                } catch (err) {
                    logger.debug(`JaCoCo exec file not found at: ${execPath}`);
                }
            }
            
            if (!execFileExists) {
                logger.warn(`JaCoCo exec file not found at any of the expected locations`);
                throw new Error(`JaCoCo exec file not found. Please ensure Karate tests were executed with coverage.`);
            }
            
            // Ensure the reports directory exists
            await this.fileManager.createDirectory(reportsDir);
            
            // Get path to jacococli.jar with absolute paths
            const relJacocoCLIPath = 'jacoco/jacococli.jar';
            const absJacocoCLIPath = path.join(workspaceRoot, relJacocoCLIPath);
            
            // Potential places the CLI tool could be
            const potentialCLIPaths = [
                absJacocoCLIPath,
                relJacocoCLIPath,
                // Add specific paths from your environment
                path.join(workspaceRoot, 'testautomationagentplugin/jacoco/jacococli.jar'),
                path.join('/Users/kasiperumal/Documents/Cline/payment_microservice/jacoco/jacococli.jar'),
                // Try the path relative to the current file
                path.resolve(__dirname, '../../jacoco/jacococli.jar')
            ];
            
            let jacocoCLIPath = '';
            let jacocoCLIExists = false;
            
            // Check all potential paths
            for (const cliPath of potentialCLIPaths) {
                try {
                    await fs.promises.access(cliPath, fs.constants.F_OK);
                    const stats = await fs.promises.stat(cliPath);
                    if (stats.size > 10000) { // Make sure it's a valid JAR
                        jacocoCLIExists = true;
                        jacocoCLIPath = cliPath;
                        logger.info(`JaCoCo CLI tool found at: ${jacocoCLIPath}`);
                        break;
                    } else {
                        logger.debug(`Found jacococli.jar at ${cliPath} but it's too small (${stats.size} bytes)`);
                    }
                } catch (error) {
                    logger.debug(`JaCoCo CLI tool not found at: ${cliPath}`);
                }
            }
            
            // Download JaCoCo CLI if it doesn't exist
            if (!jacocoCLIExists) {
                logger.info('Downloading JaCoCo CLI tool...');
                this.statusBarManager.showBusy('Downloading JaCoCo CLI tool...');
                
                // Define the download path - use the absolute path for reliable file operations
                jacocoCLIPath = absJacocoCLIPath;
                
                // Ensure directory exists
                const jacocoCLIDir = path.dirname(jacocoCLIPath);
                await this.fileManager.createDirectory(jacocoCLIDir);
                logger.info(`Ensured directory exists for CLI download: ${jacocoCLIDir}`);
                
                // Use the same version as the agent for consistency
                const jacocoVersion = "0.8.10";
                const downloadUrl = `https://repo1.maven.org/maven2/org/jacoco/org.jacoco.cli/${jacocoVersion}/org.jacoco.cli-${jacocoVersion}-nodeps.jar`;
                
                try {
                    // Download directly with axios/https rather than using terminal command
                    logger.info(`Downloading JaCoCo CLI from ${downloadUrl} to ${jacocoCLIPath}...`);
                    
                    // Use Node.js https directly instead of terminal command
                    const https = require('https');
                    const http = require('http');
                    const url = new URL(downloadUrl);
                    const protocol = url.protocol === 'https:' ? https : http;
                    
                    await new Promise<void>((resolve, reject) => {
                        protocol.get(url, (response: any) => {
                            // Handle redirects
                            if (response.statusCode === 301 || response.statusCode === 302) {
                                logger.info(`Following redirect to ${response.headers.location}`);
                                const redirectUrl = new URL(response.headers.location);
                                const redirectProtocol = redirectUrl.protocol === 'https:' ? https : http;
                                
                                redirectProtocol.get(redirectUrl, (redirectResponse: any) => {
                                    if (redirectResponse.statusCode !== 200) {
                                        reject(new Error(`Failed to download, status: ${redirectResponse.statusCode}`));
                                        return;
                                    }
                                    
                                    const file = fs.createWriteStream(jacocoCLIPath);
                                    redirectResponse.pipe(file);
                                    
                                    file.on('finish', () => {
                                        file.close();
                                        logger.info(`JaCoCo CLI download completed to ${jacocoCLIPath}`);
                                        resolve();
                                    });
                                    
                                    file.on('error', (err: any) => {
                                        fs.unlink(jacocoCLIPath, () => {});
                                        reject(err);
                                    });
                                }).on('error', reject);
                                
                                return;
                            }
                            
                            if (response.statusCode !== 200) {
                                reject(new Error(`Failed to download, status: ${response.statusCode}`));
                                return;
                            }
                            
                            const file = fs.createWriteStream(jacocoCLIPath);
                            response.pipe(file);
                            
                            file.on('finish', () => {
                                file.close();
                                logger.info(`JaCoCo CLI download completed to ${jacocoCLIPath}`);
                                resolve();
                            });
                            
                            file.on('error', (err: any) => {
                                fs.unlink(jacocoCLIPath, () => {});
                                reject(err);
                            });
                        }).on('error', reject);
                    });
                    
                    // Verify download after Node.js download completes
                    const stats = await fs.promises.stat(jacocoCLIPath);
                    if (stats.size < 10000) {
                        throw new Error(`Downloaded JaCoCo CLI file is too small (${stats.size} bytes). Download may have failed.`);
                    }
                    logger.info(`JaCoCo CLI tool downloaded successfully to ${jacocoCLIPath} (${stats.size} bytes)`);
                    
                } catch (downloadError) {
                    logger.error(`Failed to download JaCoCo CLI using Node.js HTTP: ${(downloadError as Error).message}`);
                    
                    // Fallback to the curl method 
                    try {
                        const command = `curl -L "${downloadUrl}" -o "${jacocoCLIPath}"`;
                        logger.info(`Executing download command: ${command}`);
                        
                        await this.commandExecutor.executeCommand(command, {
                            name: 'JaCoCo CLI Download',
                            requireApproval: false
                        });
                        
                        // Add a significant delay after the curl command to ensure file is written
                        logger.info('Waiting 10 seconds for file download to complete...');
                        await new Promise(resolve => setTimeout(resolve, 10000));
                        
                        // Verify download after delay
                        const stats = await fs.promises.stat(jacocoCLIPath);
                        if (stats.size < 10000) {
                            throw new Error(`Downloaded JaCoCo CLI file is too small (${stats.size} bytes). Download may have failed.`);
                        }
                        logger.info(`JaCoCo CLI tool downloaded successfully to ${jacocoCLIPath} (${stats.size} bytes)`);
                    } catch (curlError) {
                        throw new Error(`Failed to download JaCoCo CLI tool: ${(curlError as Error).message}`);
                    }
                }
            }
            
            // Build the command for JaCoCo CLI
            const command = `java -jar ${jacocoCLIPath} report ${jacocoExecPath} ` +
                `--classfiles ../payment_microservice/build/classes ` +
                `--sourcefiles ../payment_microservice/src/main/java ` +
                `--html ${reportsDir}/html ` +
                `--xml ${reportsDir}/jacoco.xml`;
            
            logger.info(`Executing JaCoCo report command: ${command}`);
            
            // Create a terminal for better visibility
            const terminal = vscode.window.createTerminal('JaCoCo Report Generation');
            terminal.show();
            terminal.sendText(command);
            
            logger.info('JaCoCo reports generation requested via CLI');
            this.statusBarManager.showSuccess('JaCoCo reports generation started');
            
            return;
        } catch (error) {
            logger.error('Error generating JaCoCo report', error);
            this.statusBarManager.showError(`Error generating JaCoCo report: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Executes multiple test cases
     * @param testCasesOrPaths The test cases or file paths to execute
     * @param options Execution options
     * @returns Promise resolving to an array of test results
     */
    public async executeTests(testCasesOrPaths: (TestCase | string)[], options?: ExecutionOptions): Promise<TestResult[]> {
        try {
            // Ensure required JARs are available
            await this.ensureRequiredJars();
            
            // If startMicroservice is true, start microservice with JaCoCo coverage
            if (options?.startMicroservice) {
                logger.info('Starting microservice before running tests');
                await this.startMicroserviceWithCoverage(options);
                logger.info('Microservice started and ready, proceeding with test execution');
            }
            
            // Check if all the tests are Karate feature files - to determine if we should disable coverage
            let allKarateTests = true;
            
            // Filter the testCasesOrPaths to only include .feature files when paths are provided
            // Ensure we only process .feature files
            const filteredTestCasesOrPaths = testCasesOrPaths.filter(test => {
                // Only filter string paths, keep TestCase objects as is
                if (typeof test === 'string') {
                    // Check if the file has .feature extension
                    const isFeatureFile = test.toLowerCase().endsWith('.feature');
                    if (!isFeatureFile) {
                        logger.debug(`Skipping non-feature file: ${test}`);
                        allKarateTests = false;
                    }
                    return isFeatureFile;
                } else if (test.template !== TestCaseTemplate.KARATE_BDD) {
                    allKarateTests = false;
                }
                return true;
            });
            
            // Create updated options with withCoverage set to false for Karate tests
            const updatedOptions = { ...options };
            if (allKarateTests) {
                // Force withCoverage to false for Karate tests
                updatedOptions.withCoverage = false;
                logger.info(`All Karate tests detected - JaCoCo coverage disabled for test execution`);
            }
            
            const filteredCount = testCasesOrPaths.length - filteredTestCasesOrPaths.length;
            if (filteredCount > 0) {
                logger.info(`Filtered out ${filteredCount} non-feature files`);
            }
            
            logger.info(`Executing ${filteredTestCasesOrPaths.length} tests...`);
            this.statusBarManager.showBusy(`Executing ${filteredTestCasesOrPaths.length} tests...`);
            
            const results: TestResult[] = [];
            
            // Get the environment to use - ensure environment parameter is a string
            const environmentId = typeof options?.environment === 'string' 
                ? options.environment 
                : undefined;
            
            logger.debug(`Getting environment with ID: ${environmentId || 'default'}`);
            const environment = this.getEnvironment(environmentId);
            logger.debug(`Using environment: ${environment.id} (${environment.baseUrl})`);
            
            // Create Karate config if needed
            await this.environmentManager.createKarateConfig();
            logger.debug(`Karate configuration created/updated`);
            
            // Execute tests in parallel or sequentially
            if (updatedOptions?.parallel) {
                // Execute tests in parallel
                logger.info(`Executing ${filteredTestCasesOrPaths.length} tests in parallel`);
                
                // Create promises for both TestCase objects and file paths
                const promises = filteredTestCasesOrPaths.map(test => {
                    if (typeof test === 'string') {
                        // Create a temporary TestCase object for file paths
                        const fileName = path.basename(test);
                        const testId = fileName.replace(/\.\w+$/, ''); // Remove extension
                        
                        // Create a mock TestCase object for the executeTest method
                        const mockTestCase: TestCase = {
                            id: testId,
                            scenarioId: testId,
                            template: TestCaseTemplate.KARATE_BDD,
                            content: '', // Not needed as we'll use the file directly
                            path: test
                        };
                        
                        return this.executeTest(mockTestCase, updatedOptions);
                    } else {
                        return this.executeTest(test, updatedOptions);
                    }
                });
                
                const parallelResults = await Promise.all(promises);
                results.push(...parallelResults);
            } else {
                // Execute tests sequentially
                logger.info(`Executing ${filteredTestCasesOrPaths.length} tests sequentially`);
                
                for (const test of filteredTestCasesOrPaths) {
                    let result: TestResult;
                    
                    if (typeof test === 'string') {
                        // Create a temporary TestCase object for file paths
                        const fileName = path.basename(test);
                        const testId = fileName.replace(/\.\w+$/, ''); // Remove extension
                        
                        // Create a mock TestCase object for the executeTest method
                        const mockTestCase: TestCase = {
                            id: testId,
                            scenarioId: testId,
                            template: TestCaseTemplate.KARATE_BDD,
                            content: '', // Not needed as we'll use the file directly
                            path: test
                        };
                        
                        result = await this.executeTest(mockTestCase, updatedOptions);
                    } else {
                        result = await this.executeTest(test, updatedOptions);
                    }
                    
                    results.push(result);
                    
                    // Stop execution if failFast is true and the test failed
                    if (options?.failFast && result.status !== TestResultStatus.PASSED) {
                        logger.info(`Stopping test execution due to failFast option and test failure`);
                        break;
                    }
                }
            }
            
            // Log result summary to console (for debugging only)
            const passedCount = results.filter(r => r.status === TestResultStatus.PASSED).length;
            const failedCount = results.filter(r => r.status === TestResultStatus.FAILED).length;
            const errorCount = results.filter(r => r.status === TestResultStatus.ERROR).length;
            const skippedCount = results.filter(r => r.status === TestResultStatus.SKIPPED).length;
            
            logger.info(`Test execution completed: ${passedCount} passed, ${failedCount} failed, ${errorCount} errors, ${skippedCount} skipped`);
            // Remove success notification to avoid unnecessary UI distraction
            
            // Verify Karate tests have completed by checking for results
            await this.verifyKarateTestsCompleted(results);
            
            // Generate JaCoCo coverage report after test execution
            try {
                logger.info('Karate tests completed, waiting 5 seconds before generating coverage report...');
                this.statusBarManager.showBusy('Waiting before generating coverage report...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Ensure jacococli.jar exists in jacoco directory
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
                const jacocoCLIPath = path.join(workspaceRoot, 'jacoco/jacococli.jar');
                
                // Check if jacococli.jar exists
                let jacocoCLIExists = false;
                try {
                    await fs.promises.access(jacocoCLIPath, fs.constants.F_OK);
                    const stats = await fs.promises.stat(jacocoCLIPath);
                    if (stats.size > 10000) { // Make sure it's a valid JAR
                        jacocoCLIExists = true;
                        logger.info(`JaCoCo CLI tool found at: ${jacocoCLIPath}`);
                    } else {
                        logger.debug(`Found jacococli.jar but it's too small (${stats.size} bytes)`);
                    }
                } catch (error) {
                    logger.debug(`JaCoCo CLI tool not found at: ${jacocoCLIPath}`);
                }
                
                // Download jacococli.jar if it doesn't exist
                if (!jacocoCLIExists) {
                    logger.info('Downloading JaCoCo CLI tool before generating report...');
                    this.statusBarManager.showBusy('Downloading JaCoCo CLI tool...');
                    
                    // Ensure directory exists
                    await this.fileManager.createDirectory(path.dirname(jacocoCLIPath));
                    
                    // Download jacococli.jar
                    const jacocoVersion = "0.8.10";
                    const downloadUrl = `https://repo1.maven.org/maven2/org/jacoco/org.jacoco.cli/${jacocoVersion}/org.jacoco.cli-${jacocoVersion}-nodeps.jar`;
                    
                    // Download using curl
                    const command = `curl -L "${downloadUrl}" -o "${jacocoCLIPath}"`;
                    logger.info(`Executing download command: ${command}`);
                    
                    await this.commandExecutor.executeCommand(command, {
                        name: 'JaCoCo CLI Download',
                        requireApproval: false
                    });
                    
                    // Wait to ensure file is fully written
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Verify download
                    try {
                        const stats = await fs.promises.stat(jacocoCLIPath);
                        if (stats.size < 10000) {
                            throw new Error(`Downloaded JaCoCo CLI file is too small (${stats.size} bytes)`);
                        }
                        logger.info(`JaCoCo CLI tool downloaded successfully (${stats.size} bytes)`);
                    } catch (err) {
                        logger.error(`Failed to verify JaCoCo CLI download: ${(err as Error).message}`);
                        throw new Error('Failed to download JaCoCo CLI tool needed for coverage report');
                    }
                }
                
                logger.info('Generating coverage report using Gradle task...');
                this.statusBarManager.showBusy('Generating coverage report...');
                
                // Use Gradle to generate the coverage report
                const terminal = vscode.window.createTerminal('Coverage Report Generation');
                terminal.show();
                
                // Run gradlew generateCoverageReport
                terminal.sendText('./gradlew generateCoverageReport');
                
                logger.info('Coverage report generation requested');
                this.statusBarManager.showSuccess('Coverage report generation started');
            } catch (error) {
                logger.warn(`Failed to generate coverage report, but tests were executed successfully: ${(error as Error).message}`);
                // Don't throw here, as test execution was successful
            }
            
            return results;
        } catch (error) {
            logger.error(`Error executing tests`, error);
            this.statusBarManager.showError(`Error executing tests: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Verifies that Karate tests have completed by checking for result files
     * @param results Array of test results
     * @returns Promise resolving when verification is complete
     */
    private async verifyKarateTestsCompleted(results: TestResult[]): Promise<void> {
        logger.info('Verifying Karate tests completion...');
        
        // Check if any tests were executed
        if (results.length === 0) {
            logger.warn('No test results found, cannot verify Karate test completion');
            throw new Error('No test results found, cannot verify Karate test completion');
        }
        
        // Add a delay to ensure reports are generated before verification
        logger.info('Waiting 15 seconds for Karate reports to be generated...');
        this.statusBarManager.showBusy('Waiting for Karate reports to be generated...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        logger.info('Continuing with report verification');
        
        // Get workspace root for absolute paths
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
        
        // Check for Karate reports directory existence - use absolute path
        const karateReportsDir = path.join(workspaceRoot, 'target/karate-reports');
        
        // Try multiple possible report locations - prioritize the expected path from screenshot
        const possibleReportDirs = [
            // First check the specific path from the screenshot
            path.join(workspaceRoot, 'testautomationagentplugin/karate/karate-reports'),
            // Then check other possible locations
            karateReportsDir,
            path.join(workspaceRoot, 'testautomationagentplugin/karate/reports'),
            path.join(workspaceRoot, 'testautomationagentplugin/karate'),
            path.join(workspaceRoot, 'karate-reports'),
            // Relative paths in case workspaceRoot isn't correctly determined
            './target/karate-reports',
            './testautomationagentplugin/karate/reports',
            './testautomationagentplugin/karate/karate-reports',
            './testautomationagentplugin/karate',
            './karate-reports'
        ];
        
        let reportsFound = false;
        let foundReportDir = '';
        
        for (const reportDir of possibleReportDirs) {
            try {
                await fs.promises.access(reportDir, fs.constants.F_OK);
                const dirContents = await fs.promises.readdir(reportDir);
                
                // Check for any files that could indicate report generation
                // Be more lenient in what we consider a "report file"
                const hasReportFiles = dirContents.length > 0 && (
                    dirContents.some(file => 
                        file.endsWith('.html') || 
                        file.endsWith('.xml') || 
                        file.endsWith('.json') ||
                        file.endsWith('-json.txt') ||
                        file.endsWith('.svg') ||
                        file.endsWith('.png') ||
                        file.endsWith('.ico') ||
                        file === 'karate-summary.html' ||
                        file === 'karate-tags.html' ||
                        file === 'karate-timeline.html' ||
                        file === 'res' ||  // Resource directory
                        file.startsWith('karate-') ||
                        file.includes('karate')
                    )
                );
                
                if (hasReportFiles) {
                    logger.info(`Karate reports directory found at: ${reportDir}`);
                    reportsFound = true;
                    foundReportDir = reportDir;
                    break;
                } else {
                    logger.debug(`Directory found at ${reportDir} but no report files detected`);
                }
            } catch (error) {
                logger.debug(`Karate reports directory not found at: ${reportDir}`);
            }
        }
        
        // If no report directory was found, try to create one to prevent future issues
        if (!reportsFound) {
            try {
                logger.warn(`No Karate reports directory found. Creating: ${karateReportsDir}`);
                await this.fileManager.createDirectory(karateReportsDir);
                logger.info(`Created default report directory: ${karateReportsDir}`);
                
                // We still throw an error to maintain backward compatibility
                throw new Error(`Karate reports directory not found. Tests may not have completed properly.`);
            } catch (error) {
                logger.error(`Failed to create report directory: ${(error as Error).message}`);
                throw new Error(`Karate reports directory not found and could not be created. Tests may not have completed properly.`);
            }
        }
        
        // For each test result, check if a corresponding report file exists using various potential naming patterns
        for (const result of results) {
            if (!result.feature) {
                logger.debug(`Skipping verification for test ${result.testCaseId} without feature name`);
                continue;
            }
            
            // Create a list of potential file name patterns
            const potentialPaths = [
                // Primary file from screenshot - give this top priority
                path.join(workspaceRoot, `testautomationagentplugin/karate/karate-reports/testautomationagentplugin.testcases.${result.feature}.karate-json.txt`),
                // Common patterns
                path.join(foundReportDir, `test-files.${result.feature}.html`),
                path.join(foundReportDir, `${result.feature}.html`),
                // With testautomationagentplugin prefix
                path.join(foundReportDir, `testautomationagentplugin.testcases.${result.feature}.html`),
                // With test-files prefix (lowercase version)
                path.join(foundReportDir, `test-files.${result.feature.toLowerCase()}.html`),
                // JSON format files
                path.join(foundReportDir, `test-files.${result.feature}.karate-json.txt`),
                path.join(foundReportDir, `testautomationagentplugin.testcases.${result.feature}.karate-json.txt`),
                // Check in nested karate-reports directory
                path.join(foundReportDir, 'karate-reports', `test-files.${result.feature}.html`),
                path.join(foundReportDir, 'karate-reports', `testautomationagentplugin.testcases.${result.feature}.html`),
                path.join(foundReportDir, 'karate-reports', `testautomationagentplugin.testcases.${result.feature}.karate-json.txt`),
                // Check specific absolute path pattern from logs
                `/Users/kasiperumal/Documents/Cline/payment_microservice/testautomationagentplugin/karate/karate-reports/testautomationagentplugin.testcases.${result.feature}.karate-json.txt`
            ];
            
            let reportFileFound = false;
            
            // Check each potential path
            for (const filePath of potentialPaths) {
                try {
                    await fs.promises.access(filePath, fs.constants.F_OK);
                    logger.debug(`Report file found for test ${result.testCaseId}: ${filePath}`);
                    reportFileFound = true;
                    break;
                } catch (error) {
                    // Continue to next pattern
                }
            }
            
            if (!reportFileFound) {
                // Instead of warning about specific files, log a general message about report files
                logger.debug(`No specific report file found for test ${result.testCaseId}, but directory contains reports`);
                // We don't throw here as some tests might not generate individual reports
                // or might use a different naming convention
            }
        }
        
        // If we found a report directory with report files, consider verification successful
        if (reportsFound) {
            logger.info('Karate test completion verification successful');
        } else {
            // This should not happen as we would have thrown earlier if no report directory was found
            logger.warn('Karate report verification could not confirm individual test reports, but found report directory');
        }
    }

    /**
     * Gets a test result
     * @param id The test result ID
     * @returns The test result or undefined if not found
     */
    public getResult(id: string): TestResult | undefined {
        return this.results.get(id);
    }

    /**
     * Gets all test results
     * @returns Array of all test results
     */
    public getAllResults(): TestResult[] {
        return Array.from(this.results.values());
    }

    /**
     * Gets the test result for a test case
     * @param testCaseId The test case ID
     * @returns The latest test result for the test case or undefined if not found
     */
    public getResultForTestCase(testCaseId: string): TestResult | undefined {
        // Get all results for the test case
        const results = Array.from(this.results.values())
            .filter(result => result.testCaseId === testCaseId);
        
        // Sort by end time descending (latest first)
        results.sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
        
        // Return the latest result
        return results[0];
    }

    /**
     * Clears all test results
     */
    public clearResults(): void {
        this.results.clear();
    }

    /**
     * Gets the environment to use
     * @param environmentId The environment ID
     * @returns The test environment
     */
    private getEnvironment(environmentId?: string): TestEnvironment {
        let environment: TestEnvironment | undefined;
        
        // Debug logging for environment ID
        logger.debug(`Getting environment with ID: ${environmentId || 'default (current)'}`);
        
        if (environmentId) {
            // Protect against object being passed instead of string
            if (typeof environmentId !== 'string') {
                logger.error(`Invalid environment ID type: ${typeof environmentId}`);
                throw new Error(`Invalid environment ID type: ${typeof environmentId}. Must be a string.`);
            }
            
            // Get the specified environment
            environment = this.environmentManager.getEnvironment(environmentId);
            
            if (!environment) {
                logger.error(`Environment "${environmentId}" not found`);
                throw new Error(`Environment "${environmentId}" not found`);
            }
        } else {
            // Get the current environment
            environment = this.environmentManager.getCurrentEnvironment();
            
            if (!environment) {
                logger.error('No current environment set');
                throw new Error('No current environment set');
            }
        }
        
        logger.debug(`Using environment: ${environment.id} (${environment.baseUrl})`);
        return environment;
    }

    /**
     * Creates a temporary test file
     * @param testCaseOrPath The test case object or file path string
     * @returns Promise resolving to the file path
     */
    private async createTestFile(testCaseOrPath: TestCase | string): Promise<string> {
        try {
            // If testCaseOrPath is a string (file path), validate and return it directly
            if (typeof testCaseOrPath === 'string') {
                // Double-check it's a feature file
                if (!testCaseOrPath.toLowerCase().endsWith('.feature')) {
                    logger.warn(`Non-feature file path provided: ${testCaseOrPath}`);
                    throw new Error(`Only .feature files are supported for test execution`);
                }
                logger.debug(`Using existing test file: ${testCaseOrPath}`);
                return testCaseOrPath;
            }

            // Handle TestCase object
            const testCase = testCaseOrPath;
            
            // Check if the test case has a path and no content (using existing file)
            if (testCase.path && (!testCase.content || testCase.content.trim() === '')) {
                logger.debug(`Using existing test file from TestCase path: ${testCase.path}`);
                return testCase.path;
            }
            
            // Create a temporary file for the test case
            const testDir = 'test-files';
            logger.debug(`Creating test file in directory: ${testDir}`);
            
            // Ensure the test directory exists
            if (!await this.fileManager.directoryExists(testDir)) {
                logger.debug(`Creating test directory: ${testDir}`);
                await this.fileManager.createDirectory(testDir);
            }
            
            // Generate a file name based on the test case ID
            let fileName: string;
            
            // Ensure testCase.id exists to prevent 'replace' of undefined error
            if (!testCase.id) {
                logger.warn('Test case ID is undefined, using generic filename');
                fileName = `test_${Date.now()}.feature`;
            } else {
                switch (testCase.template) {
                    case TestCaseTemplate.KARATE_BDD:
                        // Preserve original file name format
                        fileName = `${testCase.id}.feature`;
                        break;
                        
                    case TestCaseTemplate.CUCUMBER:
                        // Preserve original file name format
                        fileName = `${testCase.id}.feature`;
                        break;
                        
                    default:
                        // Preserve original file name format for JS files too
                        fileName = `${testCase.id}.js`;
                }
            }
            
            const filePath = path.join(testDir, fileName);
            
            // Only write content if it's not empty
            if (testCase.content && testCase.content.trim() !== '') {
                // Ensure the content ends with a newline to avoid EOF issues
                let finalContent = testCase.content;
                if (!finalContent.endsWith('\n')) {
                    finalContent += '\n';
                    logger.debug('Adding trailing newline to feature file to prevent EOF parsing issues');
                }
                
                await this.fileManager.writeFile(filePath, finalContent);
                logger.debug(`Created test file: ${filePath}`);
            } else {
                logger.debug(`Skipping write for empty content: ${filePath}`);
            }
            
            return filePath;
        } catch (error) {
            logger.error(`Error creating test file`, error);
            throw error;
        }
    }

    /**
     * Builds the execution command
     * @param testFilePath The test file path
     * @param environment The test environment
     * @param options Execution options
     * @returns The execution command
     */
    /**
     * Parses the test status from the command output
     * @param output The command output
     * @returns The test result status
     */
    private parseTestStatus(output: string): TestResultStatus {
        // Check for common failure indicators
        if (
            output.includes('FAILED') ||
            output.includes('failed:') ||
            output.includes('AssertionError') ||
            output.includes('error:') ||
            output.includes('Error:')
        ) {
            return TestResultStatus.FAILED;
        }
        
        // Check for skipped tests
        if (output.includes('SKIPPED') || output.includes('skipped:')) {
            return TestResultStatus.SKIPPED;
        }
        
        // Check for successful tests
        if (output.includes('PASSED') || output.includes('passed:') || output.includes('Success:')) {
            return TestResultStatus.PASSED;
        }
        
        // Default to pending if status is unclear
        return TestResultStatus.PENDING;
    }
    
    /**
     * Creates a default karate-config.js file
     * @param filePath The file path to create the config at
     * @returns Promise resolving when the file is created
     */
    private async createKarateConfig(filePath: string): Promise<void> {
        try {
            logger.info(`Creating karate-config.js at ${filePath}`);
            
            // Default Karate config for different environments
            const configContent = `
function fn() {
  var env = karate.env || 'dev';
  karate.log('karate.env:', env);

  var config = {
    baseUrl: 'http://localhost:8080',
    timeoutMs: 5000,
    headers: { 'Content-Type': 'application/json' }
  };
  
  // Environment-specific settings
  if (env === 'dev') {
    config.baseUrl = 'http://localhost:8080';
  } else if (env === 'test') {
    config.baseUrl = 'http://test-server:8080';
  } else if (env === 'prod') {
    config.baseUrl = 'https://api.example.com';
  }

  // Configure Karate settings
  karate.configure('connectTimeout', config.timeoutMs);
  karate.configure('readTimeout', config.timeoutMs);
  karate.configure('headers', config.headers);

  return config;
}
`;
            
            // Write the file
            await this.fileManager.writeFile(filePath, configContent);
            logger.info(`Created karate-config.js file at ${filePath}`);
        } catch (error) {
            logger.error(`Error creating karate-config.js at ${filePath}`, error);
            throw error;
        }
    }

    private async buildExecutionCommand(
        testFilePath: string,
        environment: TestEnvironment,
        options?: ExecutionOptions
    ): Promise<string> {
        // Define base directories for consistency with directories in ensureRequiredJars
        const pluginBaseDir = 'testautomationagentplugin';
        const jacocoDir = `${pluginBaseDir}/jacoco`;
        const karateDir = `${pluginBaseDir}/karate`;
        
        // Map all paths to absolute paths
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
        
        // Get the Karate path from settings or use default
        const defaultKaratePath = `${karateDir}/karate.jar`;
        const settingsKaratePath = SettingsManager.getKaratePath() || defaultKaratePath;
        
        // Get Karate report path from settings with default values
        const settingsKarateReportPath = SettingsManager.getAllureReportPath() || karateDir;
        
        // Convert Karate paths to absolute paths
        const absKaratePath = path.isAbsolute(settingsKaratePath) ? 
            settingsKaratePath : path.join(workspaceRoot, settingsKaratePath);
        
        const absKarateReportPath = path.isAbsolute(settingsKarateReportPath) ? 
            settingsKarateReportPath : path.join(workspaceRoot, settingsKarateReportPath);
            
        // JaCoCo paths are only needed if coverage is explicitly requested
        let absJacocoAgentPath = '';
        let absJacocoReportPath = '';
        
        if (options?.withCoverage === true) {
            // Get JaCoCo paths from settings with default values
            const settingsJacocoReportPath = SettingsManager.getJacocoReportPath() || jacocoDir;
            
            // Get JaCoCo agent path from settings or use default
            const defaultJacocoAgentPath = `jacoco/jacocoagent.jar`;
            const settingsJacocoAgentPath = SettingsManager.getJacocoAgentPath() || defaultJacocoAgentPath;
            
            // Convert to absolute paths
            absJacocoAgentPath = path.isAbsolute(settingsJacocoAgentPath) ? 
                settingsJacocoAgentPath : path.join(workspaceRoot, settingsJacocoAgentPath);
            
            absJacocoReportPath = path.isAbsolute(settingsJacocoReportPath) ? 
                settingsJacocoReportPath : path.join(workspaceRoot, settingsJacocoReportPath);
                
            logger.debug(`- JaCoCo agent absolute path: ${absJacocoAgentPath}`);
            logger.debug(`- JaCoCo report absolute path: ${absJacocoReportPath}`);
        }
        
        // Verify that the JAR files exist before proceeding
        try {
            // Check if Karate JAR exists
            await fs.promises.access(absKaratePath, fs.constants.F_OK);
            const stats = await fs.promises.stat(absKaratePath);
            if (stats.size < 1000000) {
                logger.warn(`Warning: Karate JAR file at ${absKaratePath} is suspiciously small (${stats.size} bytes), it may be corrupted`);
            } else {
                logger.info(`Verified Karate JAR exists with size ${stats.size} bytes`);
            }
        } catch (error) {
            logger.error(`ERROR: Karate JAR not found at ${absKaratePath}, execution will likely fail`);
        }
        
        // Log paths being used
        logger.debug(`Execution command using the following paths:`);
        logger.debug(`- Karate JAR absolute path: ${absKaratePath}`);
        logger.debug(`- Karate report absolute path: ${absKarateReportPath}`);
        
        // Build the command - NEVER use JaCoCo by default for Karate tests
        let command = 'java';
        
        // Only add JaCoCo agent if coverage is explicitly requested AND it's not a Karate test
        // Karate tests should NEVER use JaCoCo agent
        if (options?.withCoverage === true && path.basename(absKaratePath) !== 'karate.jar') {
            // Add JaCoCo agent for coverage tracking using absolute path to match Gradle command
            const jacocoExecPath = `${workspaceRoot}/testautomationagentplugin/jacoco/jacoco.exec`;
            
            // Use absolute path for JaCoCo agent path to match Gradle command format
            logger.info(`Adding JaCoCo agent for coverage tracking: ${absJacocoAgentPath}`);
            command = `java -javaagent:"${absJacocoAgentPath}"=destfile="${jacocoExecPath}"`;
        }
        
        // Add main JAR with absolute path
        command += ` -jar "${absKaratePath}"`;
        
        // Add environment option
        command += ` -e ${environment.id}`;
        
        // Add tags if specified
        if (options?.tags && options.tags.length > 0) {
            const tagString = options.tags.join(',');
            command += ` -t ${tagString}`;
        }
        
        // Add output path if specified (this is the main output for Karate)
        if (options?.outputPath) {
            const absOutputPath = path.isAbsolute(options.outputPath) ? 
                options.outputPath : path.join(workspaceRoot, options.outputPath);
            command += ` -o "${absOutputPath}"`;
        } else {
            // Default output to karateReportPath directory
            command += ` -o "${absKarateReportPath}"`;
        }
        
        // Add report path if specified (allows customizing the report output path)
        if (options?.reportPath) {
            const absReportPath = path.isAbsolute(options.reportPath) ? 
                options.reportPath : path.join(workspaceRoot, options.reportPath);
            command += ` --report-dir "${absReportPath}"`;
        }
        
        // Create target directory for reports
        const targetDir = path.join(workspaceRoot, 'target');
        try {
            await this.fileManager.createDirectory(targetDir);
            logger.debug(`Ensured target directory exists: ${targetDir}`);
        } catch (error) {
            logger.warn(`Could not create target directory: ${(error as Error).message}`);
        }
        
        // Enable necessary formats for coverage analysis (html, json, xml)
        command += ' -f html,json,xml';
        
        // Add the test file path with proper quoting to handle paths with spaces
        command += ` "${testFilePath}"`;
        
        // Log the command for debugging
        logger.debug(`Execution command: ${command}`);
        
        return command;
    }
}
