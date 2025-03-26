import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIController } from '../../ai/controller';
import { StatusBarManager } from '../../core/statusBar';
import { FileManager } from '../../fileSystem/fileManager';
import { TestScenario } from '../scenario/scenarioGenerator';
import { logger } from '../../utils/logger';

/**
 * Test case template type
 */
export enum TestCaseTemplate {
    KARATE_BDD = 'karate',
    CUCUMBER = 'cucumber',
    CUSTOM = 'custom'
}

/**
 * Represents a BDD test case
 */
export interface TestCase {
    id: string;
    scenarioId: string;
    template: TestCaseTemplate;
    content: string;
    path?: string;
}

/**
 * Generates BDD test cases from scenarios
 */
export class TestCaseGenerator {
    private static instance: TestCaseGenerator;
    private aiController: AIController;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;
    private testCases: TestCase[] = [];

    private constructor() {
        this.aiController = AIController.getInstance();
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the singleton instance of the TestCaseGenerator
     * @returns The TestCaseGenerator instance
     */
    public static getInstance(): TestCaseGenerator {
        if (!TestCaseGenerator.instance) {
            TestCaseGenerator.instance = new TestCaseGenerator();
        }
        return TestCaseGenerator.instance;
    }

    /**
     * Gets available test files
     * @returns Promise resolving to array of available test file paths
     */
    public async getAvailableTestFiles(): Promise<string[]> {
        try {
            logger.info('Getting available test files');
            const testFiles: string[] = [];
            
            // Get test cases with paths
            const casesWithPaths = this.testCases.filter(tc => tc.path);
            logger.debug(`Found ${casesWithPaths.length} test cases with paths`);
            
            // Add paths to test files
            for (const testCase of casesWithPaths) {
                if (testCase.path) {
                    testFiles.push(testCase.path);
                    logger.debug(`Added test file: ${testCase.path}`);
                }
            }
            
            // Look for test files in workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            
            if (workspaceFolders) {
                logger.debug(`Searching ${workspaceFolders.length} workspace folders for test files`);
                for (const folder of workspaceFolders) {
                    logger.debug(`Searching folder: ${folder.uri.fsPath}`);
                    const files = await this.findTestFilesInDirectory(folder.uri.fsPath);
                    logger.debug(`Found ${files.length} test files in ${folder.uri.fsPath}`);
                    testFiles.push(...files);
                }
            }
            
            // Remove duplicates
            const uniqueFiles = [...new Set(testFiles)];
            logger.info(`Found ${uniqueFiles.length} unique test files`);
            return uniqueFiles;
        } catch (error) {
            logger.error('Error getting test files', error);
            vscode.window.showErrorMessage(`Error getting test files: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Generates a test case from a scenario
     * @param scenario The test scenario
     * @param template The test case template to use
     * @param openApiSpec Optional OpenAPI specification JSON 
     * @returns Promise resolving to the generated test case
     */
    public async generateTestCase(
        scenario: TestScenario, 
        template: TestCaseTemplate = TestCaseTemplate.KARATE_BDD,
        openApiSpec?: string
    ): Promise<TestCase> {
        try {
            logger.info(`Generating test case for scenario: ${scenario.id} (${scenario.title})`);
            logger.debug(`Using template: ${template}`);
            this.statusBarManager.showBusy(`Generating test case for ${scenario.title}...`);
            
            // Construct the prompt with OpenAPI spec if provided
            const prompt = openApiSpec 
                ? this.constructTestCasePromptWithOpenApi(scenario, template, openApiSpec)
                : this.constructTestCasePrompt(scenario, template);
            logger.debug('Constructed prompt for AI');
            
            // Send prompt to AI to generate test case
            logger.info('Sending prompt to AI to generate test case');
            const response = await this.aiController.sendPrompt(
                prompt,
                'You are assigned a role of Functional Tester for test automation. Generate a BDD test case from the scenario and OpenAPI spec provided.'
            );
            logger.debug('Received response from AI');
            
            // Create the test case
            const content = this.extractTestCaseContent(response.text);
            const testCase: TestCase = {
                id: `TC-${Date.now()}`,
                scenarioId: scenario.id,
                template,
                content
            };
            
            logger.info(`Test case generated with ID: ${testCase.id}`);
            logger.debug(`Test case content length: ${content.length} characters`);
            
            // Store the test case
            this.testCases.push(testCase);
            
            this.statusBarManager.showSuccess('Test case generated');
            
            return testCase;
        } catch (error) {
            logger.error(`Error generating test case for scenario ${scenario.id}`, error);
            this.statusBarManager.showError('Failed to generate test case');
            vscode.window.showErrorMessage(`Error generating test case: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Generates test cases from multiple scenarios
     * @param scenarios The test scenarios
     * @param template The test case template to use
     * @param openApiSpecPath Optional path to OpenAPI specification JSON file
     * @returns Promise resolving to the generated test cases
     */
    public async generateTestCases(
        scenarios: TestScenario[], 
        template: TestCaseTemplate = TestCaseTemplate.KARATE_BDD,
        openApiSpecPath?: string
    ): Promise<TestCase[]> {
        logger.info(`Generating test cases for ${scenarios.length} scenarios`);
        const testCases: TestCase[] = [];
        
        // Load OpenAPI spec if path is provided
        let openApiSpec: string | undefined;
        if (openApiSpecPath) {
            try {
                logger.info(`Loading OpenAPI spec from ${openApiSpecPath}`);
                openApiSpec = await fs.promises.readFile(openApiSpecPath, 'utf-8');
                logger.debug('OpenAPI spec loaded successfully');
            } catch (error) {
                logger.warn(`Failed to load OpenAPI spec: ${error}`);
                vscode.window.showWarningMessage(`Failed to load OpenAPI spec: ${(error as Error).message}`);
            }
        }
        
        for (const scenario of scenarios) {
            logger.debug(`Generating test case for scenario ${scenario.id}`);
            const testCase = await this.generateTestCase(scenario, template, openApiSpec);
            testCases.push(testCase);
        }
        
        logger.info(`Generated ${testCases.length} test cases`);
        return testCases;
    }

    /**
     * Gets the current test cases
     * @returns The current test cases
     */
    public getTestCases(): TestCase[] {
        return this.testCases;
    }

    /**
     * Clears all test cases
     */
    public clearTestCases(): void {
        this.testCases = [];
    }

    /**
     * Saves a test case to a file
     * @param testCase The test case to save
     * @param filePath The file path to save to
     * @returns Promise resolving when the file is saved
     */
    public async saveTestCaseToFile(testCase: TestCase, filePath: string): Promise<void> {
        try {
            logger.info(`Saving test case ${testCase.id} to ${filePath}`);
            
            // Write to file
            await this.fileManager.writeFile(filePath, testCase.content);
            logger.debug(`File written successfully`);
            
            // Update the test case with the path
            testCase.path = filePath;
            logger.debug(`Updated test case with path: ${filePath}`);
            
            vscode.window.showInformationMessage(`Test case saved to ${filePath}`);
        } catch (error) {
            logger.error(`Error saving test case to ${filePath}`, error);
            vscode.window.showErrorMessage(`Error saving test case: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Saves all test cases to files
     * @param baseDirectory The base directory to save to
     * @returns Promise resolving when all files are saved
     */
    public async saveAllTestCases(baseDirectory: string): Promise<void> {
        try {
            logger.info(`Saving all test cases to directory: ${baseDirectory}`);
            
            // Ensure the directory exists
            await this.fileManager.createDirectory(baseDirectory);
            logger.debug(`Directory created/verified: ${baseDirectory}`);
            
            // Save each test case
            logger.debug(`Saving ${this.testCases.length} test cases`);
            for (const testCase of this.testCases) {
                const fileName = `${testCase.scenarioId.replace(/\s+/g, '_')}.feature`;
                const filePath = `${baseDirectory}/${fileName}`;
                
                logger.debug(`Saving test case ${testCase.id} to ${filePath}`);
                await this.saveTestCaseToFile(testCase, filePath);
            }
            
            logger.info(`Successfully saved ${this.testCases.length} test cases to ${baseDirectory}`);
            vscode.window.showInformationMessage(`All test cases saved to ${baseDirectory}`);
        } catch (error) {
            logger.error(`Error saving test cases to ${baseDirectory}`, error);
            vscode.window.showErrorMessage(`Error saving test cases: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Finds test files in a directory
     * @param directory The directory to search
     * @returns Promise resolving to array of test file paths
     */
    private async findTestFilesInDirectory(directory: string): Promise<string[]> {
        try {
            logger.debug(`Searching for test files in directory: ${directory}`);
            const testFiles: string[] = [];
            const fileEntries = await fs.promises.readdir(directory, { withFileTypes: true });
            logger.debug(`Found ${fileEntries.length} entries in directory`);
            
            for (const entry of fileEntries) {
                const fullPath = path.join(directory, entry.name);
                
                if (entry.isDirectory()) {
                    // Recursively search subdirectories
                    const subDirFiles = await this.findTestFilesInDirectory(fullPath);
                    testFiles.push(...subDirFiles);
                } else if (this.isTestFile(entry.name)) {
                    // Add test file
                    testFiles.push(fullPath);
                }
            }
            
            logger.debug(`Found ${testFiles.length} test files in directory: ${directory}`);
            return testFiles;
        } catch (error) {
            logger.warn(`Error searching directory ${directory}: ${error}`);
            return [];
        }
    }

    /**
     * Checks if a file is a test file
     * @param fileName The file name to check
     * @returns True if the file is a test file, false otherwise
     */
    private isTestFile(fileName: string): boolean {
        // Check file extension
        const ext = path.extname(fileName).toLowerCase();
        
        if (ext === '.feature') {
            return true;
        }
        
        // Check for test file naming patterns
        const baseName = path.basename(fileName, ext).toLowerCase();
        
        return (
            baseName.includes('test') ||
            baseName.includes('spec') ||
            baseName.startsWith('it_') ||
            baseName.endsWith('_test') ||
            baseName.endsWith('_spec')
        );
    }

    /**
     * Constructs the prompt for generating a test case
     * @param scenario The test scenario
     * @param template The test case template to use
     * @returns The constructed prompt
     */
    private constructTestCasePrompt(scenario: TestScenario, template: TestCaseTemplate): string {
        let templateInstructions = '';
        
        switch (template) {
            case TestCaseTemplate.KARATE_BDD:
                templateInstructions = `
Generate a Karate BDD test case with the following structure:
\`\`\`gherkin
Feature: [Feature Name]

Background:
  * url baseUrl
  # No auth token required since this is for local testing
  * def testData = 
  """
  {
    "sourceAccount": "ACC1001",
    "destinationAccount": "ACC1002",
    "currency": "USD",
    "amount": 10000
  }
  """

Scenario: [Scenario Name]
  Given [step]
  And request
  """
  {
    "key": "value"
  }
  """
  When [step]
  Then status 200
  # Focus on simple status validation and maybe 1-2 key fields, not full response
  And match response.success == true
\`\`\`

For API tests:
1. Include appropriate requests with data that matches expected types
2. Use simple assertions focusing on status code only
3. Always use triple quotes for JSON request/response blocks instead of inline JSON
4. Ensure transactionId is there for transaction request, use the test scenario ID (${scenario.id}) value for the same
5. Include comments explaining key parts of the test
                `;
                break;
                
            case TestCaseTemplate.CUCUMBER:
                templateInstructions = `
Generate a Cucumber test case with the following structure:
\`\`\`gherkin
Feature: [Feature Name]

  Scenario: [Scenario Name]
    Given [step]
    When [step]
    Then [step]
\`\`\`

Use simple Gherkin syntax and include step definitions as comments.
                `;
                break;
                
            case TestCaseTemplate.CUSTOM:
                templateInstructions = `
Generate a custom BDD-style test case with appropriate Given/When/Then steps.
Include detailed steps and assertions based on the scenario.
                `;
                break;
        }
        
        return `
You are assigned a role of Functional Tester for test automation.

TASK:
Generate a BDD test case from the following scenario:

SCENARIO:
ID: ${scenario.id}
Title: ${scenario.title}
Description: ${scenario.description}
Priority: ${scenario.priority}
Source Requirements: ${scenario.sourceRequirements.join(', ')}

Steps:
${scenario.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Expected Results:
${scenario.expectedResults.map((result, index) => `${index + 1}. ${result}`).join('\n')}

INSTRUCTIONS:
${templateInstructions}

Ensure the test case:
1. Covers all steps in the scenario
2. Includes all expected results as assertions
3. Follows best practices for ${template} testing
4. Is executable and well-structured
        `;
    }
    
    /**
     * Constructs the prompt for generating a test case with OpenAPI spec
     * @param scenario The test scenario
     * @param template The test case template to use
     * @param openApiSpec The OpenAPI specification in JSON format
     * @returns The constructed prompt
     */
    private constructTestCasePromptWithOpenApi(scenario: TestScenario, template: TestCaseTemplate, openApiSpec: string): string {
        let templateInstructions = '';
        
        switch (template) {
            case TestCaseTemplate.KARATE_BDD:
                templateInstructions = `
Generate a Karate BDD test case with the following structure:
\`\`\`gherkin
Feature: [Feature Name]

Background:
  * url baseUrl
  # No auth token required since this is for local testing
  * def testData = 
  """
  {
    "sourceAccount": "ACC1001",
    "destinationAccount": "ACC1002",
    "currency": "USD",
    "amount": 10000
  }
  """

Scenario: [Scenario Name]
  Given [step]
  And request
  """
  {
    "key": "value"
  }
  """
  When [step]
  Then status 200
  # Focus on simple status validation and maybe 1-2 key fields, not full response
  And match response.success == true
\`\`\`

For API tests:
1. Use appropriate HTTP methods (GET, POST, PUT, DELETE) based on the OpenAPI spec
2. Generate sample data that strictly follows the data types defined in the OpenAPI spec
3. ALWAYS use triple quotes for JSON request/response blocks instead of inline JSON format
4. For assertions, focus primarily on status code only
5. Ensure transactionId is there for transaction request, use the test scenario ID (${scenario.id}) value for the same
6. Add comments explaining key parts of the test

The OpenAPI specification should be used to ensure request data types match exactly what's expected by the API. Follow the schemas defined in the spec for generating all request payloads and validating response formats.

Ensure the test is executable with Karate and follows best practices for API testing.
                `;
                break;
                
            case TestCaseTemplate.CUCUMBER:
                templateInstructions = `
Generate a Cucumber test case with the following structure:
\`\`\`gherkin
Feature: [Feature Name]

  Scenario: [Scenario Name]
    Given [step]
    When [step]
    Then [step]
\`\`\`

Use simple Gherkin syntax and include step definitions as comments.
Align the API calls with the endpoints and parameters defined in the OpenAPI spec.
                `;
                break;
                
            case TestCaseTemplate.CUSTOM:
                templateInstructions = `
Generate a custom BDD-style test case with appropriate Given/When/Then steps.
Include detailed steps and assertions based on the scenario and the provided OpenAPI spec.
                `;
                break;
        }
        
        // Try to parse OpenAPI spec to extract relevant information
        let openApiContext = "OpenAPI specification is provided in JSON format.";
        try {
            const openApiJson = JSON.parse(openApiSpec);
            const apiInfo = openApiJson.info || {};
            const paths = Object.keys(openApiJson.paths || {});
            
            openApiContext = `
OpenAPI specification details:
- API Title: ${apiInfo.title || 'Not specified'}
- Version: ${apiInfo.version || 'Not specified'}
- Description: ${apiInfo.description || 'Not provided'}
- Available endpoints: ${paths.length > 0 ? paths.join(', ') : 'None specified'}

The OpenAPI specification contains detailed information about endpoints, request parameters, response schemas, and status codes.
Use this information to create accurate and relevant test cases that match the API's actual behavior.
            `;
        } catch (error) {
            logger.warn('Failed to parse OpenAPI spec for prompt context');
        }
        
        return `
You are assigned a role of Functional Tester for test automation.

TASK:
Generate a BDD test case from the following scenario using the provided OpenAPI specification:

SCENARIO:
ID: ${scenario.id}
Title: ${scenario.title}
Description: ${scenario.description}
Priority: ${scenario.priority}
Source Requirements: ${scenario.sourceRequirements.join(', ')}

Steps:
${scenario.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Expected Results:
${scenario.expectedResults.map((result, index) => `${index + 1}. ${result}`).join('\n')}

${openApiContext}

OPENAPI SPECIFICATION:
${openApiSpec}

INSTRUCTIONS:
${templateInstructions}

Ensure the test case:
1. Aligns with the OpenAPI specification details (endpoints, request/response formats, status codes)
2. Covers all steps in the scenario
3. Includes all expected results as assertions
4. Follows best practices for ${template} testing
5. Is executable and well-structured
        `;
    }

    /**
     * Extracts the test case content from the AI response
     * @param responseText The response text from the AI
     * @returns The extracted test case content
     */
    private extractTestCaseContent(responseText: string): string {
        // Look for content inside code blocks
        const codeBlockPattern = /```(?:gherkin|feature)?\s*([\s\S]*?)```/;
        const match = responseText.match(codeBlockPattern);
        
        if (match && match[1]) {
            // Ensure content ends with a newline to prevent EOF parsing issues
            let content = match[1].trim();
            if (!content.endsWith('\n')) {
                content += '\n';
            }
            return content;
        }
        
        // If no code block found, return the whole response with a trailing newline
        let content = responseText.trim();
        if (!content.endsWith('\n')) {
            content += '\n';
        }
        return content;
    }
}
