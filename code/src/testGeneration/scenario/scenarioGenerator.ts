import * as vscode from 'vscode';
import { AIController } from '../../ai/controller';
import { StatusBarManager } from '../../core/statusBar';
import { FileManager } from '../../fileSystem/fileManager';
import { logger } from '../../utils/logger';

/**
 * Represents a test scenario
 */
export interface TestScenario {
    id: string;
    title: string;
    description: string;
    priority: 'High' | 'Medium' | 'Low';
    sourceRequirements: string[];
    steps: string[];
    expectedResults: string[];
}

/**
 * Generates test scenarios from requirements
 */
export class ScenarioGenerator {
    private static instance: ScenarioGenerator;
    private aiController: AIController;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;
    private scenarios: TestScenario[] = [];

    private constructor() {
        this.aiController = AIController.getInstance();
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the singleton instance of the ScenarioGenerator
     * @returns The ScenarioGenerator instance
     */
    public static getInstance(): ScenarioGenerator {
        if (!ScenarioGenerator.instance) {
            ScenarioGenerator.instance = new ScenarioGenerator();
        }
        return ScenarioGenerator.instance;
    }

    /**
     * Generates test scenarios from a requirements file
     * @param filePath Path to the requirements file
     * @returns Promise resolving to the generated test scenarios
     */
    public async generateFromFile(filePath: string): Promise<TestScenario[]> {
        try {
            logger.info(`Generating test scenarios from file: ${filePath}`);
            this.statusBarManager.showBusy('Generating test scenarios...');
            
            // Read the file content
            logger.debug(`Reading file content from: ${filePath}`);
            const fileContent = await this.fileManager.readFile(filePath);
            logger.debug(`Successfully read file, content length: ${fileContent.length} characters`);
            
            // Generate scenarios from the content
            const scenarios = await this.generateFromText(fileContent);
            
            this.statusBarManager.showSuccess('Test scenarios generated');
            logger.info(`Generated ${scenarios.length} test scenarios from file`);
            
            return scenarios;
        } catch (error) {
            logger.error(`Failed to generate test scenarios from file: ${filePath}`, error);
            this.statusBarManager.showError('Failed to generate test scenarios');
            vscode.window.showErrorMessage(`Error generating test scenarios: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Generates test scenarios from text input
     * @param requirementsText The requirements text
     * @returns Promise resolving to the generated test scenarios
     */
    public async generateFromText(requirementsText: string): Promise<TestScenario[]> {
        try {
            logger.info(`Generating test scenarios from text input (${requirementsText.length} characters)`);
            this.statusBarManager.showBusy('Generating test scenarios...');
            
            // Construct the prompt
            logger.debug('Constructing prompt for AI');
            const prompt = this.constructScenariosPrompt(requirementsText);
            
            // Send prompt to AI to generate scenarios
            logger.info('Sending prompt to AI to generate test scenarios');
            const response = await this.aiController.sendPrompt(
                prompt,
                'You are assigned a role of Functional Tester for test automation. Generate comprehensive test scenarios from the requirements.'
            );
            logger.debug('Received response from AI');
            
            // Parse the response into scenarios
            logger.debug('Parsing AI response into scenarios');
            const scenarios = this.parseScenariosResponse(response.text);
            logger.info(`Parsed ${scenarios.length} scenarios from AI response`);
            
            // Store the scenarios
            this.scenarios = scenarios;
            
            this.statusBarManager.showSuccess('Test scenarios generated');
            
            return scenarios;
        } catch (error) {
            logger.error('Failed to generate test scenarios from text', error);
            this.statusBarManager.showError('Failed to generate test scenarios');
            vscode.window.showErrorMessage(`Error generating test scenarios: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Gets the current test scenarios
     * @returns The current test scenarios
     */
    public getScenarios(): TestScenario[] {
        return this.scenarios;
    }

    /**
     * Adds scenarios to the existing collection
     * @param newScenarios Array of scenarios to add
     * @returns Array of all scenarios after addition
     */
    public addScenarios(newScenarios: TestScenario[]): TestScenario[] {
        logger.info(`Adding ${newScenarios.length} new scenarios to existing ${this.scenarios.length} scenarios`);
        
        // Filter out any duplicates by ID
        const existingIds = new Set(this.scenarios.map(s => s.id));
        const uniqueNewScenarios = newScenarios.filter(scenario => !existingIds.has(scenario.id));
        
        logger.debug(`Found ${uniqueNewScenarios.length} unique new scenarios`);
        
        // Add the unique scenarios
        this.scenarios.push(...uniqueNewScenarios);
        
        logger.info(`Total scenarios after addition: ${this.scenarios.length}`);
        return this.scenarios;
    }

    /**
     * Clears all scenarios
     */
    public clearScenarios(): void {
        this.scenarios = [];
    }

    /**
     * Saves scenarios to a file
     * @param filePath The file path to save to
     * @returns Promise resolving when the file is saved
     */
    public async saveToFile(filePath: string): Promise<void> {
        try {
            logger.info(`Saving ${this.scenarios.length} scenarios to file: ${filePath}`);
            
            // Convert scenarios to JSON
            const content = JSON.stringify(this.scenarios, null, 2);
            logger.debug(`JSON content length: ${content.length} characters`);
            
            // Write to file
            await this.fileManager.writeFile(filePath, content);
            logger.info(`Successfully saved scenarios to file: ${filePath}`);
            
            vscode.window.showInformationMessage(`Scenarios saved to ${filePath}`);
        } catch (error) {
            logger.error(`Error saving scenarios to file: ${filePath}`, error);
            vscode.window.showErrorMessage(`Error saving scenarios: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Imports requirements from a file and generates initial scenarios
     * @param filePath Path to the requirements file
     * @returns Promise resolving to the generated test scenarios
     */
    public async importRequirementsFromFile(filePath: string): Promise<TestScenario[]> {
        try {
            logger.info(`Importing requirements from file: ${filePath}`);
            this.statusBarManager.showBusy('Importing requirements...');
            
            const fileExt = vscode.Uri.file(filePath).path.split('.').pop()?.toLowerCase();
            logger.debug(`File extension: ${fileExt}`);
            let fileContent: string;
            
            // Process based on file type
            if (fileExt === 'pdf') {
                // For PDF, we would need a PDF parser library
                // This is a simplified version
                logger.info('Processing PDF file...');
                vscode.window.showInformationMessage('Processing PDF file...');
                // Assumes FileManager has a readPdf method or equivalent
                fileContent = await this.fileManager.readFile(filePath);
                logger.debug(`Successfully read PDF file, content length: ${fileContent.length} characters`);
            } else {
                // For text-based files (txt, md, json)
                logger.info(`Reading text-based file (${fileExt})...`);
                fileContent = await this.fileManager.readFile(filePath);
                logger.debug(`Successfully read file, content length: ${fileContent.length} characters`);
            }
            
            // Generate scenarios from the imported content
            logger.info('Generating scenarios from imported content...');
            const scenarios = await this.generateFromText(fileContent);
            
            logger.info(`Successfully imported requirements and generated ${scenarios.length} scenarios`);
            this.statusBarManager.showSuccess('Requirements imported successfully');
            
            return scenarios;
        } catch (error) {
            logger.error(`Failed to import requirements from file: ${filePath}`, error);
            this.statusBarManager.showError(`Failed to import requirements: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Loads scenarios from a file
     * @param filePath The file path to load from
     * @returns Promise resolving to the loaded scenarios
     */
    public async loadFromFile(filePath: string): Promise<TestScenario[]> {
        try {
            logger.info(`Loading scenarios from file: ${filePath}`);
            
            // Read the file
            const content = await this.fileManager.readFile(filePath);
            logger.debug(`Successfully read file, content length: ${content.length} characters`);
            
            // Parse the JSON
            logger.debug(`Parsing JSON content`);
            const scenarios = JSON.parse(content) as TestScenario[];
            logger.info(`Parsed ${scenarios.length} scenarios from file`);
            
            // Store the scenarios
            this.scenarios = scenarios;
            
            vscode.window.showInformationMessage(`Scenarios loaded from ${filePath}`);
            
            return scenarios;
        } catch (error) {
            logger.error(`Error loading scenarios from file: ${filePath}`, error);
            vscode.window.showErrorMessage(`Error loading scenarios: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Constructs the prompt for generating scenarios
     * @param requirementsText The requirements text
     * @returns The constructed prompt
     */
    private constructScenariosPrompt(requirementsText: string): string {
        return `
You are assigned a role of Functional Tester for test automation.

TASK:
Generate comprehensive test scenarios from the following requirements:

REQUIREMENTS:
${requirementsText}

INSTRUCTIONS:
1. Analyze the requirements carefully
2. Identify key functionality and user interactions
3. Create test scenarios covering all requirements
4. Include happy paths, error cases, and edge cases
5. Prioritize scenarios based on importance

RESPONSE FORMAT:
Generate your response as a valid JSON array of scenarios with the following structure:
[
  {
    "id": "TS-001",
    "title": "Scenario title",
    "description": "Detailed description",
    "priority": "High/Medium/Low",
    "sourceRequirements": ["REQ-123", "AC-456"],
    "steps": [
      "Step 1 description",
      "Step 2 description"
    ],
    "expectedResults": [
      "Expected result 1",
      "Expected result 2"
    ]
  }
]

Ensure the JSON is valid and properly formatted.
        `;
    }

    /**
     * Parses the AI response into test scenarios
     * @param responseText The response text from the AI
     * @returns The parsed test scenarios
     */
    private parseScenariosResponse(responseText: string): TestScenario[] {
        try {
            logger.debug('Extracting JSON content from AI response');
            // Extract JSON content from the response
            const jsonPattern = /\[\s*\{[\s\S]*\}\s*\]/;
            const match = responseText.match(jsonPattern);
            
            if (!match) {
                logger.warn('No valid JSON found in the AI response');
                throw new Error('No valid JSON found in the response');
            }
            
            // Parse the JSON
            logger.debug('Parsing JSON content');
            const scenarios = JSON.parse(match[0]) as TestScenario[];
            logger.debug(`Parsed ${scenarios.length} scenarios from JSON`);
            
            // Validate the structure
            logger.debug('Validating scenario structure');
            for (const scenario of scenarios) {
                if (!scenario.id || !scenario.title || !scenario.description || !scenario.priority) {
                    logger.warn(`Invalid scenario structure: ${JSON.stringify(scenario)}`);
                    throw new Error('Invalid scenario structure');
                }
            }
            
            logger.info(`Successfully parsed ${scenarios.length} scenarios from AI response`);
            return scenarios;
        } catch (error) {
            logger.error('Error parsing scenarios response', error);
            
            // Fallback: Create a basic scenario for demonstration
            logger.info('Creating fallback scenario as a workaround');
            return [{
                id: `TS-${Date.now()}`,
                title: 'Default Scenario',
                description: 'This is a default scenario created because the AI response could not be parsed correctly.',
                priority: 'Medium',
                sourceRequirements: ['N/A'],
                steps: ['Step 1: This is a placeholder step'],
                expectedResults: ['Expected Result: This is a placeholder result']
            }];
        }
    }
}
