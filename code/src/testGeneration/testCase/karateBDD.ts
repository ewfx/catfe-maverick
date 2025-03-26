import * as vscode from 'vscode';
import { TestScenario } from '../scenario/scenarioGenerator';
import { StatusBarManager } from '../../core/statusBar';
import { TestCase, TestCaseTemplate } from './testCaseGenerator';

/**
 * Karate BDD Feature file structure
 */
export interface KarateFeature {
    name: string;
    description?: string;
    background?: KarateBackground;
    scenarios: KarateScenario[];
}

/**
 * Karate BDD Background section
 */
export interface KarateBackground {
    steps: string[];
}

/**
 * Karate BDD Scenario
 */
export interface KarateScenario {
    name: string;
    description?: string;
    steps: KarateStep[];
    examples?: KarateExample[];
}

/**
 * Karate BDD Step
 */
export interface KarateStep {
    type: 'Given' | 'When' | 'Then' | 'And' | 'But' | '*';
    text: string;
}

/**
 * Karate BDD Example for Scenario Outline
 */
export interface KarateExample {
    name?: string;
    table: {
        headers: string[];
        rows: string[][];
    };
}

/**
 * Class for generating Karate BDD test cases
 */
export class KarateBDDGenerator {
    private static instance: KarateBDDGenerator;
    private statusBarManager: StatusBarManager;

    private constructor() {
        this.statusBarManager = StatusBarManager.getInstance();
    }

    /**
     * Gets the singleton instance of the KarateBDDGenerator
     * @returns The KarateBDDGenerator instance
     */
    public static getInstance(): KarateBDDGenerator {
        if (!KarateBDDGenerator.instance) {
            KarateBDDGenerator.instance = new KarateBDDGenerator();
        }
        return KarateBDDGenerator.instance;
    }

    /**
     * Generates a Karate BDD test case from a scenario
     * @param scenario The test scenario
     * @returns TestCase object with Karate BDD content
     */
    public generateTestCase(scenario: TestScenario): TestCase {
        try {
            this.statusBarManager.showBusy(`Generating Karate test for ${scenario.title}`);
            
            // Create a Karate feature
            const feature: KarateFeature = {
                name: scenario.title,
                description: scenario.description,
                background: this.createBackground(),
                scenarios: this.createScenarios(scenario)
            };
            
            // Generate Karate BDD content
            const content = this.generateKarateContent(feature);
            
            // Create test case
            const testCase: TestCase = {
                id: `TC-${Date.now()}`,
                scenarioId: scenario.id,
                template: TestCaseTemplate.KARATE_BDD,
                content
            };
            
            this.statusBarManager.showSuccess('Karate test case generated');
            
            return testCase;
        } catch (error) {
            this.statusBarManager.showError(`Error generating Karate test: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Creates a background section for the Karate feature
     * @returns KarateBackground object
     */
    private createBackground(): KarateBackground {
        // Default background with common setup steps
        return {
            steps: [
                '* url baseUrl',
                '* def testData = read(\'test-data.json\')',
                '* def utils = read(\'classpath:utils.js\')'
            ]
        };
    }

    /**
     * Creates scenarios from a test scenario
     * @param scenario The test scenario
     * @returns Array of KarateScenario objects
     */
    private createScenarios(scenario: TestScenario): KarateScenario[] {
        // Create steps from scenario steps and expected results
        const steps: KarateStep[] = [];
        
        // Add Given steps from scenario steps
        for (let i = 0; i < scenario.steps.length; i++) {
            const step = scenario.steps[i];
            
            // First step is a Given, subsequent steps are And
            if (i === 0) {
                steps.push({ type: 'Given', text: this.convertToKarateStep(step) });
            } else {
                steps.push({ type: 'And', text: this.convertToKarateStep(step) });
            }
        }
        
        // Add When step if not already present
        if (!steps.some(s => s.type === 'When')) {
            steps.push({ type: 'When', text: 'method post' });
        }
        
        // Add Then steps from expected results
        for (const result of scenario.expectedResults) {
            steps.push({ type: 'Then', text: this.convertToKarateAssertion(result) });
        }
        
        return [{
            name: scenario.title,
            description: scenario.description,
            steps
        }];
    }

    /**
     * Converts a scenario step to a Karate step
     * @param step The scenario step
     * @returns Karate step text
     */
    private convertToKarateStep(step: string): string {
        // Check for API requests
        if (step.toLowerCase().includes('request') || step.toLowerCase().includes('send')) {
            return 'request { "key": "value" }';
        }
        
        // Check for URL paths
        if (step.toLowerCase().includes('url') || step.toLowerCase().includes('endpoint')) {
            return 'path \'/api/endpoint\'';
        }
        
        // Check for parameters
        if (step.toLowerCase().includes('parameter') || step.toLowerCase().includes('param')) {
            return 'param name = \'value\'';
        }
        
        // Check for headers
        if (step.toLowerCase().includes('header')) {
            return 'header Content-Type = \'application/json\'';
        }
        
        // Default step
        return step;
    }

    /**
     * Converts an expected result to a Karate assertion
     * @param result The expected result
     * @returns Karate assertion text
     */
    private convertToKarateAssertion(result: string): string {
        // Check for status codes
        if (result.toLowerCase().includes('status') || result.toLowerCase().includes('code')) {
            return 'status 200';
        }
        
        // Check for JSON responses
        if (result.toLowerCase().includes('json') || result.toLowerCase().includes('response')) {
            return 'match response == { "success": true }';
        }
        
        // Check for specific fields
        if (result.toLowerCase().includes('field') || result.toLowerCase().includes('property')) {
            return 'match response.field == \'value\'';
        }
        
        // Default assertion
        return `assert response.success == true // ${result}`;
    }

    /**
     * Generates Karate BDD content from a feature
     * @param feature The Karate feature
     * @returns Karate BDD content as string
     */
    private generateKarateContent(feature: KarateFeature): string {
        let content = '';
        
        // Add feature
        content += `Feature: ${feature.name}\n`;
        
        // Add description if available
        if (feature.description) {
            content += `  ${feature.description.replace(/\n/g, '\n  ')}\n`;
        }
        
        // Add empty line
        content += '\n';
        
        // Add background if available
        if (feature.background) {
            content += 'Background:\n';
            
            for (const step of feature.background.steps) {
                content += `  ${step}\n`;
            }
            
            // Add empty line
            content += '\n';
        }
        
        // Add scenarios
        for (const scenario of feature.scenarios) {
            content += `Scenario: ${scenario.name}\n`;
            
            // Add description if available
            if (scenario.description) {
                content += `  # ${scenario.description.replace(/\n/g, '\n  # ')}\n`;
            }
            
            // Add steps
            for (const step of scenario.steps) {
                content += `  ${step.type} ${step.text}\n`;
            }
            
            // Add examples if available
            if (scenario.examples && scenario.examples.length > 0) {
                for (const example of scenario.examples) {
                    content += '\n  Examples:';
                    
                    // Add name if available
                    if (example.name) {
                        content += ` ${example.name}`;
                    }
                    
                    content += '\n';
                    
                    // Add table header
                    content += `    | ${example.table.headers.join(' | ')} |\n`;
                    
                    // Add table rows
                    for (const row of example.table.rows) {
                        content += `    | ${row.join(' | ')} |\n`;
                    }
                }
            }
            
            // Add empty line between scenarios
            content += '\n';
        }
        
        return content;
    }
}
