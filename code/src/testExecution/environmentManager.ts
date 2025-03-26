import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StatusBarManager } from '../core/statusBar';
import { FileManager } from '../fileSystem/fileManager';
import { SettingsManager } from '../core/settings';

/**
 * Test environment configuration
 */
export interface TestEnvironment {
    id: string;
    name: string;
    description?: string;
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
    variables?: Record<string, string>;
    timeoutMs?: number;
    retryCount?: number;
    tags?: string[];
    isDefault?: boolean;
}

/**
 * Class for managing test execution environments
 */
export class EnvironmentManager {
    private static instance: EnvironmentManager;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;
    private environments: Map<string, TestEnvironment> = new Map();
    private currentEnvironment?: string;

    private constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the singleton instance of the EnvironmentManager
     * @returns The EnvironmentManager instance
     */
    public static getInstance(): EnvironmentManager {
        if (!EnvironmentManager.instance) {
            EnvironmentManager.instance = new EnvironmentManager();
        }
        return EnvironmentManager.instance;
    }

    /**
     * Initializes the environment manager
     */
    public async initialize(): Promise<void> {
        try {
            // Load environments from settings
            await this.loadEnvironmentsFromSettings();
            
            // If no environments were loaded, add default environments
            if (this.environments.size === 0) {
                this.addDefaultEnvironments();
            }
            
            // Set the default environment
            this.setDefaultEnvironment();
        } catch (error) {
            console.error('Error initializing environment manager:', error);
        }
    }

    /**
     * Gets all test environments
     * @returns Map of environment IDs to environments
     */
    public getEnvironments(): Map<string, TestEnvironment> {
        return new Map(this.environments);
    }

    /**
     * Gets all test environments as an array
     * @returns Array of environments
     */
    public getEnvironmentsArray(): TestEnvironment[] {
        return Array.from(this.environments.values());
    }

    /**
     * Gets a test environment by ID
     * @param id The environment ID
     * @returns The test environment or undefined if not found
     */
    public getEnvironment(id: string): TestEnvironment | undefined {
        return this.environments.get(id);
    }

    /**
     * Gets the current test environment
     * @returns The current test environment or undefined if none is set
     */
    public getCurrentEnvironment(): TestEnvironment | undefined {
        if (this.currentEnvironment) {
            return this.environments.get(this.currentEnvironment);
        }
        return undefined;
    }

    /**
     * Sets the current test environment
     * @param id The environment ID
     */
    public setCurrentEnvironment(id: string): void {
        if (this.environments.has(id)) {
            this.currentEnvironment = id;
            this.statusBarManager.showSuccess(`Environment: ${this.environments.get(id)?.name}`);
        } else {
            throw new Error(`Environment "${id}" not found`);
        }
    }

    /**
     * Adds a test environment
     * @param environment The test environment to add
     */
    public async addEnvironment(environment: TestEnvironment): Promise<void> {
        // Ensure the environment has an ID
        if (!environment.id) {
            environment.id = `env-${Date.now()}`;
        }
        
        // Add the environment
        this.environments.set(environment.id, environment);
        
        // If this is the first environment, set it as the current environment
        if (this.environments.size === 1) {
            this.currentEnvironment = environment.id;
        }
        
        // If this environment is marked as default, set it as the current environment
        if (environment.isDefault) {
            this.currentEnvironment = environment.id;
        }
        
        // Save the environments to settings
        await this.saveEnvironmentsToSettings();
        
        this.statusBarManager.showSuccess(`Added environment: ${environment.name}`);
    }

    /**
     * Updates a test environment
     * @param id The environment ID
     * @param environment The updated test environment
     */
    public async updateEnvironment(id: string, environment: Partial<TestEnvironment>): Promise<void> {
        const existingEnvironment = this.environments.get(id);
        
        if (existingEnvironment) {
            // Update the environment
            const updatedEnvironment: TestEnvironment = {
                ...existingEnvironment,
                ...environment,
                id // Ensure the ID doesn't change
            };
            
            // Update the environment
            this.environments.set(id, updatedEnvironment);
            
            // Save the environments to settings
            await this.saveEnvironmentsToSettings();
            
            this.statusBarManager.showSuccess(`Updated environment: ${updatedEnvironment.name}`);
        } else {
            throw new Error(`Environment "${id}" not found`);
        }
    }

    /**
     * Removes a test environment
     * @param id The environment ID
     */
    public async removeEnvironment(id: string): Promise<void> {
        if (this.environments.has(id)) {
            // Get the environment name before removing it
            const environmentName = this.environments.get(id)?.name;
            
            // Remove the environment
            this.environments.delete(id);
            
            // If the current environment was removed, set a new current environment
            if (this.currentEnvironment === id) {
                this.setDefaultEnvironment();
            }
            
            // Save the environments to settings
            await this.saveEnvironmentsToSettings();
            
            this.statusBarManager.showSuccess(`Removed environment: ${environmentName}`);
        } else {
            throw new Error(`Environment "${id}" not found`);
        }
    }

    /**
     * Loads environments from VSCode settings
     */
    private async loadEnvironmentsFromSettings(): Promise<void> {
        try {
            // Get the test environments from settings
            const environmentsObj = SettingsManager.getTestEnvironments();
            
            // Clear existing environments
            this.environments.clear();
            
            // Parse the environments
            for (const [id, env] of Object.entries(environmentsObj)) {
                if (typeof env === 'object' && env !== null) {
                    const environment: TestEnvironment = {
                        id,
                        name: env.name || id,
                        description: env.description,
                        baseUrl: env.baseUrl || '',
                        apiKey: env.apiKey,
                        headers: env.headers,
                        variables: env.variables,
                        timeoutMs: env.timeoutMs,
                        retryCount: env.retryCount,
                        tags: env.tags,
                        isDefault: env.isDefault
                    };
                    
                    this.environments.set(id, environment);
                }
            }
        } catch (error) {
            console.error('Error loading environments from settings:', error);
        }
    }

    /**
     * Saves environments to VSCode settings
     */
    private async saveEnvironmentsToSettings(): Promise<void> {
        try {
            // Convert the environments to an object
            const environmentsObj: Record<string, any> = {};
            
            for (const [id, env] of this.environments.entries()) {
                environmentsObj[id] = {
                    name: env.name,
                    description: env.description,
                    baseUrl: env.baseUrl,
                    apiKey: env.apiKey,
                    headers: env.headers,
                    variables: env.variables,
                    timeoutMs: env.timeoutMs,
                    retryCount: env.retryCount,
                    tags: env.tags,
                    isDefault: env.isDefault
                };
            }
            
            // Save the environments to settings
            await SettingsManager.updateSetting('testEnvironments', environmentsObj);
        } catch (error) {
            console.error('Error saving environments to settings:', error);
        }
    }

    /**
     * Adds default environments
     */
    private addDefaultEnvironments(): void {
        // Add development environment
        this.environments.set('dev', {
            id: 'dev',
            name: 'Development',
            description: 'Development environment for testing',
            baseUrl: 'http://localhost:8080',
            timeoutMs: 5000,
            retryCount: 1,
            isDefault: true
        });
        
        // Add testing environment
        this.environments.set('test', {
            id: 'test',
            name: 'Testing',
            description: 'Testing environment',
            baseUrl: 'https://test-api.example.com',
            timeoutMs: 10000,
            retryCount: 2
        });
        
        // Add production environment
        this.environments.set('prod', {
            id: 'prod',
            name: 'Production',
            description: 'Production environment',
            baseUrl: 'https://api.example.com',
            timeoutMs: 15000,
            retryCount: 3
        });
    }

    /**
     * Sets the default environment
     */
    private setDefaultEnvironment(): void {
        // Check if there are any environments
        if (this.environments.size === 0) {
            this.currentEnvironment = undefined;
            return;
        }
        
        // Find the default environment
        for (const [id, env] of this.environments.entries()) {
            if (env.isDefault) {
                this.currentEnvironment = id;
                return;
            }
        }
        
        // If no default environment was found, use the first one
        this.currentEnvironment = Array.from(this.environments.keys())[0];
    }

    /**
     * Creates a Karate configuration file for the current environment
     * @param outputPath Path to write the configuration file
     * @returns Promise resolving to the file path
     */
    public async createKarateConfig(outputPath?: string): Promise<string> {
        try {
            const currentEnv = this.getCurrentEnvironment();
            
            if (!currentEnv) {
                throw new Error('No current environment set');
            }
            
            // Create the Karate configuration content
            const configContent = this.generateKarateConfig();
            
            // Determine the output path
            const configPath = outputPath || 'karate-config.js';
            
            // Write the configuration to a file
            await this.fileManager.writeFile(configPath, configContent);
            
            return configPath;
        } catch (error) {
            console.error('Error creating Karate configuration:', error);
            throw error;
        }
    }

    /**
     * Generates Karate configuration content
     * @returns Karate configuration content
     */
    private generateKarateConfig(): string {
        // Get all environments
        const environments = Array.from(this.environments.entries());
        
        // Generate the configuration content
        let configContent = `function fn() {\n`;
        configContent += `  var env = karate.env || '${this.currentEnvironment || 'dev'}';\n`;
        configContent += `  karate.log('karate.env:', env);\n\n`;
        
        // Add default configuration
        configContent += `  var config = {\n`;
        configContent += `    baseUrl: 'http://localhost:8080',\n`;
        configContent += `    timeoutMs: 5000,\n`;
        configContent += `    headers: { 'Content-Type': 'application/json' }\n`;
        configContent += `  };\n\n`;
        
        // Add environment-specific configurations
        if (environments.length > 0) {
            configContent += `  // Environment-specific configurations\n`;
            
            for (const [id, env] of environments) {
                configContent += `  if (env === '${id}') {\n`;
                configContent += `    config.baseUrl = '${env.baseUrl}';\n`;
                
                if (env.timeoutMs) {
                    configContent += `    config.timeoutMs = ${env.timeoutMs};\n`;
                }
                
                if (env.apiKey) {
                    configContent += `    config.apiKey = '${env.apiKey}';\n`;
                }
                
                if (env.headers && Object.keys(env.headers).length > 0) {
                    configContent += `    config.headers = {\n`;
                    for (const [key, value] of Object.entries(env.headers)) {
                        configContent += `      '${key}': '${value}',\n`;
                    }
                    configContent += `    };\n`;
                }
                
                if (env.variables && Object.keys(env.variables).length > 0) {
                    for (const [key, value] of Object.entries(env.variables)) {
                        configContent += `    config.${key} = '${value}';\n`;
                    }
                }
                
                configContent += `  }\n\n`;
            }
        }
        
        // Add Karate configuration
        configContent += `  // Configure Karate settings\n`;
        configContent += `  karate.configure('connectTimeout', config.timeoutMs);\n`;
        configContent += `  karate.configure('readTimeout', config.timeoutMs);\n`;
        configContent += `  karate.configure('headers', config.headers);\n\n`;
        
        configContent += `  return config;\n`;
        configContent += `}\n`;
        
        return configContent;
    }
}
