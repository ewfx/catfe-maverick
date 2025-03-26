import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestScenario } from '../scenario/scenarioGenerator';
import { StatusBarManager } from '../../core/statusBar';
import { FileManager } from '../../fileSystem/fileManager';

/**
 * Interface for test data item
 */
export interface TestDataItem {
    id: string;
    name?: string;
    description?: string;
    data: Record<string, any>;
}

/**
 * Interface for test data set
 */
export interface TestDataSet {
    id: string;
    name: string;
    description?: string;
    scenario?: string;
    items: TestDataItem[];
}

/**
 * Class for managing test data
 */
export class TestDataManager {
    private static instance: TestDataManager;
    private statusBarManager: StatusBarManager;
    private fileManager: FileManager;
    private dataSets: Map<string, TestDataSet> = new Map();

    private constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the singleton instance of the TestDataManager
     * @returns The TestDataManager instance
     */
    public static getInstance(): TestDataManager {
        if (!TestDataManager.instance) {
            TestDataManager.instance = new TestDataManager();
        }
        return TestDataManager.instance;
    }

    /**
     * Generates test data for a scenario
     * @param scenario The test scenario
     * @returns The generated test data set
     */
    public async generateTestData(scenario: TestScenario): Promise<TestDataSet> {
        try {
            this.statusBarManager.showBusy(`Generating test data for ${scenario.title}`);
            
            // Check if we already have data for this scenario
            const existingDataSet = this.getDataSetByScenario(scenario.id);
            if (existingDataSet) {
                return existingDataSet;
            }
            
            // Generate new data set
            const dataSet: TestDataSet = {
                id: `DS-${Date.now()}`,
                name: `Test Data for ${scenario.title}`,
                description: `Generated test data for scenario: ${scenario.title}`,
                scenario: scenario.id,
                items: []
            };
            
            // Generate test data items based on scenario
            const items = await this.generateTestDataItems(scenario);
            dataSet.items = items;
            
            // Store the data set
            this.dataSets.set(dataSet.id, dataSet);
            
            // Save to file
            await this.saveTestDataToFile(dataSet);
            
            this.statusBarManager.showSuccess('Test data generation complete');
            
            return dataSet;
        } catch (error) {
            this.statusBarManager.showError(`Error generating test data: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Gets a test data set by ID
     * @param id The test data set ID
     * @returns The test data set or undefined if not found
     */
    public getDataSet(id: string): TestDataSet | undefined {
        return this.dataSets.get(id);
    }

    /**
     * Gets a test data set by scenario ID
     * @param scenarioId The scenario ID
     * @returns The test data set or undefined if not found
     */
    public getDataSetByScenario(scenarioId: string): TestDataSet | undefined {
        for (const dataSet of this.dataSets.values()) {
            if (dataSet.scenario === scenarioId) {
                return dataSet;
            }
        }
        return undefined;
    }

    /**
     * Gets all test data sets
     * @returns Array of all test data sets
     */
    public getAllDataSets(): TestDataSet[] {
        return Array.from(this.dataSets.values());
    }

    /**
     * Updates a test data set
     * @param dataSet The test data set to update
     */
    public async updateDataSet(dataSet: TestDataSet): Promise<void> {
        this.dataSets.set(dataSet.id, dataSet);
        await this.saveTestDataToFile(dataSet);
    }

    /**
     * Deletes a test data set
     * @param id The test data set ID to delete
     */
    public async deleteDataSet(id: string): Promise<void> {
        const dataSet = this.dataSets.get(id);
        if (dataSet) {
            this.dataSets.delete(id);
            
            try {
                // Delete the data file
                const filePath = this.getTestDataFilePath(dataSet);
                if (await this.fileManager.fileExists(filePath)) {
                    await this.fileManager.deleteFile(filePath);
                }
            } catch (error) {
                console.error(`Error deleting test data file: ${error}`);
            }
        }
    }

    /**
     * Generates test data items from a scenario
     * @param scenario The test scenario
     * @returns Array of test data items
     */
    private async generateTestDataItems(scenario: TestScenario): Promise<TestDataItem[]> {
        const items: TestDataItem[] = [];
        
        // Generate happy path test data
        items.push({
            id: `TDI-${Date.now()}-1`,
            name: 'Happy Path',
            description: 'Test data for successful scenario execution',
            data: this.generateHappyPathData(scenario)
        });
        
        // Generate boundary test data
        items.push({
            id: `TDI-${Date.now()}-2`,
            name: 'Boundary Conditions',
            description: 'Test data for boundary conditions',
            data: this.generateBoundaryData(scenario)
        });
        
        // Generate negative test data
        items.push({
            id: `TDI-${Date.now()}-3`,
            name: 'Negative Path',
            description: 'Test data for error conditions',
            data: this.generateNegativeData(scenario)
        });
        
        return items;
    }

    /**
     * Generates happy path test data from a scenario
     * @param scenario The test scenario
     * @returns Test data
     */
    private generateHappyPathData(scenario: TestScenario): Record<string, any> {
        // Extract potential data fields from scenario
        const data: Record<string, any> = {};
        
        // Add scenario-related fields
        if (scenario.title.toLowerCase().includes('user')) {
            data.userId = 'user123';
            data.username = 'testuser';
            data.email = 'test@example.com';
            data.password = 'Password123!';
        }
        
        if (scenario.title.toLowerCase().includes('login') || 
            scenario.steps.some(step => step.toLowerCase().includes('login'))) {
            data.credentials = {
                username: 'validuser',
                password: 'ValidPassword123!'
            };
        }
        
        if (scenario.title.toLowerCase().includes('product') || 
            scenario.steps.some(step => step.toLowerCase().includes('product'))) {
            data.productId = 'prod123';
            data.productName = 'Test Product';
            data.price = 99.99;
            data.quantity = 1;
        }
        
        if (scenario.title.toLowerCase().includes('order') || 
            scenario.steps.some(step => step.toLowerCase().includes('order'))) {
            data.orderId = 'order123';
            data.orderItems = [
                { id: 'item1', name: 'Item 1', price: 10.99, quantity: 2 },
                { id: 'item2', name: 'Item 2', price: 5.99, quantity: 1 }
            ];
            data.orderTotal = 27.97;
        }
        
        // Add API-related data
        if (scenario.steps.some(step => 
            step.toLowerCase().includes('api') || 
            step.toLowerCase().includes('endpoint') || 
            step.toLowerCase().includes('request')
        )) {
            data.apiRequest = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer valid-token'
                },
                body: {
                    key1: 'value1',
                    key2: 'value2'
                }
            };
            
            data.apiResponse = {
                status: 200,
                body: {
                    success: true,
                    data: {
                        id: 'response123',
                        timestamp: new Date().toISOString()
                    }
                }
            };
        }
        
        // Default data if nothing specific was detected
        if (Object.keys(data).length === 0) {
            data.defaultField1 = 'defaultValue1';
            data.defaultField2 = 'defaultValue2';
            data.defaultNumber = 42;
            data.defaultBoolean = true;
            data.defaultTimestamp = new Date().toISOString();
        }
        
        return data;
    }

    /**
     * Generates boundary test data from a scenario
     * @param scenario The test scenario
     * @returns Test data
     */
    private generateBoundaryData(scenario: TestScenario): Record<string, any> {
        // Extract potential boundary cases from scenario
        const data: Record<string, any> = {};
        
        // Add boundary user data
        if (scenario.title.toLowerCase().includes('user')) {
            data.minLengthUser = {
                userId: 'u1',
                username: 'a',  // Minimum length
                email: 'a@b.co', // Minimum valid email
                password: 'P1!x'  // Minimum length password with all required chars
            };
            
            data.maxLengthUser = {
                userId: 'u' + '1'.repeat(50), // Very long ID
                username: 'a'.repeat(100),    // Very long username
                email: 'a'.repeat(100) + '@example.com', // Long email
                password: 'P' + '1'.repeat(50) + '!' // Long password
            };
        }
        
        // Add boundary numeric values
        if (scenario.title.toLowerCase().includes('product') || 
            scenario.steps.some(step => step.toLowerCase().includes('product'))) {
            data.minValues = {
                productId: 'p0',
                productName: 'P',
                price: 0.01,  // Minimum price
                quantity: 1    // Minimum quantity
            };
            
            data.maxValues = {
                productId: 'p999999',
                productName: 'P'.repeat(100),
                price: 9999999.99, // Very high price
                quantity: 999999   // Very high quantity
            };
            
            data.zeroValues = {
                price: 0,
                quantity: 0
            };
        }
        
        // Default boundary data if nothing specific was detected
        if (Object.keys(data).length === 0) {
            data.minValues = {
                stringField: '',         // Empty string
                numberField: 0,          // Zero
                arrayField: []           // Empty array
            };
            
            data.maxValues = {
                stringField: 'a'.repeat(1000), // Very long string
                numberField: Number.MAX_SAFE_INTEGER, // Max safe int
                arrayField: Array(1000).fill('item') // Large array
            };
        }
        
        return data;
    }

    /**
     * Generates negative test data from a scenario
     * @param scenario The test scenario
     * @returns Test data
     */
    private generateNegativeData(scenario: TestScenario): Record<string, any> {
        // Extract potential negative cases from scenario
        const data: Record<string, any> = {};
        
        // Add invalid user data
        if (scenario.title.toLowerCase().includes('user')) {
            data.invalidUser = {
                userId: '', // Empty ID
                username: '',  // Empty username
                email: 'not-an-email',  // Invalid email format
                password: '12345'  // Too simple password
            };
            
            data.malformedUser = {
                userId: '<script>alert("XSS")</script>', // Injection attempt
                username: null,  // Null value
                email: undefined,  // Undefined value
                password: { nested: 'object' }  // Wrong type
            };
        }
        
        // Add invalid login data
        if (scenario.title.toLowerCase().includes('login') || 
            scenario.steps.some(step => step.toLowerCase().includes('login'))) {
            data.invalidCredentials = {
                username: 'nonexistentuser',
                password: 'WrongPassword123!'
            };
            
            data.emptyCredentials = {
                username: '',
                password: ''
            };
        }
        
        // Add invalid API data
        if (scenario.steps.some(step => 
            step.toLowerCase().includes('api') || 
            step.toLowerCase().includes('endpoint') || 
            step.toLowerCase().includes('request')
        )) {
            data.invalidRequest = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer invalid-token'
                },
                body: {
                    key1: null,
                    key2: undefined
                }
            };
            
            data.errorResponse = {
                status: 400,
                body: {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid input data'
                    }
                }
            };
            
            data.serverErrorResponse = {
                status: 500,
                body: {
                    success: false,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Internal server error'
                    }
                }
            };
        }
        
        // Default negative data if nothing specific was detected
        if (Object.keys(data).length === 0) {
            data.invalidValues = {
                stringField: null,
                numberField: 'not-a-number',
                booleanField: 'not-a-boolean',
                dateField: 'not-a-date'
            };
            
            data.malformedInput = {
                nested: { very: { deep: { structure: null } } },
                injection: '<script>alert("XSS")</script>'
            };
        }
        
        return data;
    }

    /**
     * Gets the file path for a test data set
     * @param dataSet The test data set
     * @returns The file path
     */
    private getTestDataFilePath(dataSet: TestDataSet): string {
        // Create a directory for test data if it doesn't exist
        const dataDir = 'test-data';
        
        return path.join(dataDir, `${dataSet.id}.json`);
    }

    /**
     * Saves a test data set to a file
     * @param dataSet The test data set to save
     */
    private async saveTestDataToFile(dataSet: TestDataSet): Promise<void> {
        try {
            // Ensure the test-data directory exists
            const dataDir = 'test-data';
            
            if (!await this.fileManager.directoryExists(dataDir)) {
                await this.fileManager.createDirectory(dataDir);
            }
            
            // Get the file path
            const filePath = this.getTestDataFilePath(dataSet);
            
            // Save the data set to the file
            await this.fileManager.writeFile(
                filePath,
                JSON.stringify(dataSet, null, 2)
            );
        } catch (error) {
            console.error(`Error saving test data to file: ${error}`);
            throw error;
        }
    }

    /**
     * Loads test data sets from files
     */
    public async loadTestDataFromFiles(): Promise<void> {
        try {
            // Ensure the test-data directory exists
            const dataDir = 'test-data';
            
            if (!await this.fileManager.directoryExists(dataDir)) {
                return;
            }
            
            // Get the list of files in the directory
            const files = await this.fileManager.listFiles(dataDir);
            
            // Load each file
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        // Read the file
                        const filePath = path.join(dataDir, file);
                        const content = await this.fileManager.readFile(filePath);
                        
                        // Parse the JSON content
                        const dataSet = JSON.parse(content) as TestDataSet;
                        
                        // Store the data set
                        this.dataSets.set(dataSet.id, dataSet);
                    } catch (error) {
                        console.error(`Error loading test data from file ${file}: ${error}`);
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading test data from files: ${error}`);
        }
    }
}
