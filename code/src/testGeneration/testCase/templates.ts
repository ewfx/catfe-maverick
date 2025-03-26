import * as vscode from 'vscode';
import { TestScenario } from '../scenario/scenarioGenerator';
import { TestCase, TestCaseTemplate } from './testCaseGenerator';
import { KarateBDDGenerator } from './karateBDD';

/**
 * Template manager interface
 */
export interface TemplateManager {
    generateTestCase(scenario: TestScenario, template: TestCaseTemplate): TestCase;
    getTemplateDescription(template: TestCaseTemplate): string;
    getAvailableTemplates(): TestCaseTemplate[];
}

/**
 * Class for managing test case templates
 */
export class TestCaseTemplateManager implements TemplateManager {
    private static instance: TestCaseTemplateManager;
    private karateBDDGenerator: KarateBDDGenerator;

    private constructor() {
        this.karateBDDGenerator = KarateBDDGenerator.getInstance();
    }

    /**
     * Gets the singleton instance of the TestCaseTemplateManager
     * @returns The TestCaseTemplateManager instance
     */
    public static getInstance(): TestCaseTemplateManager {
        if (!TestCaseTemplateManager.instance) {
            TestCaseTemplateManager.instance = new TestCaseTemplateManager();
        }
        return TestCaseTemplateManager.instance;
    }

    /**
     * Generates a test case from a scenario using the specified template
     * @param scenario The test scenario
     * @param template The template to use
     * @returns The generated test case
     */
    public generateTestCase(scenario: TestScenario, template: TestCaseTemplate): TestCase {
        switch (template) {
            case TestCaseTemplate.KARATE_BDD:
                return this.karateBDDGenerator.generateTestCase(scenario);
                
            case TestCaseTemplate.CUCUMBER:
                return this.generateCucumberTestCase(scenario);
                
            case TestCaseTemplate.CUSTOM:
                return this.generateCustomTestCase(scenario);
                
            default:
                // Default to Karate BDD
                return this.karateBDDGenerator.generateTestCase(scenario);
        }
    }

    /**
     * Gets a description of the template
     * @param template The template to describe
     * @returns The template description
     */
    public getTemplateDescription(template: TestCaseTemplate): string {
        switch (template) {
            case TestCaseTemplate.KARATE_BDD:
                return 'Karate BDD is an API test automation framework that combines API test-automation, mocks, and performance-testing into a single framework.';
                
            case TestCaseTemplate.CUCUMBER:
                return 'Cucumber is a tool that supports Behavior-Driven Development (BDD) and runs tests written in a business-readable domain-specific language.';
                
            case TestCaseTemplate.CUSTOM:
                return 'Custom template allows you to define your own test case structure.';
                
            default:
                return 'Unknown template';
        }
    }

    /**
     * Gets the available templates
     * @returns Array of available templates
     */
    public getAvailableTemplates(): TestCaseTemplate[] {
        return [
            TestCaseTemplate.KARATE_BDD,
            TestCaseTemplate.CUCUMBER,
            TestCaseTemplate.CUSTOM
        ];
    }

    /**
     * Generates a Cucumber test case
     * @param scenario The test scenario
     * @returns The generated test case
     */
    private generateCucumberTestCase(scenario: TestScenario): TestCase {
        // Generate Cucumber content (simplified for MVP)
        let content = `Feature: ${scenario.title}\n`;
        
        if (scenario.description) {
            content += `  ${scenario.description.replace(/\n/g, '\n  ')}\n`;
        }
        
        content += '\n';
        content += `Scenario: ${scenario.title}\n`;
        
        // Add steps
        for (let i = 0; i < scenario.steps.length; i++) {
            const step = scenario.steps[i];
            if (i === 0) {
                content += `  Given ${step}\n`;
            } else {
                content += `  And ${step}\n`;
            }
        }
        
        // Add When step if none is present in the steps
        if (!scenario.steps.some(step => step.toLowerCase().startsWith('when'))) {
            content += `  When the action is performed\n`;
        }
        
        // Add Then steps for expected results
        for (let i = 0; i < scenario.expectedResults.length; i++) {
            const result = scenario.expectedResults[i];
            if (i === 0) {
                content += `  Then ${result}\n`;
            } else {
                content += `  And ${result}\n`;
            }
        }
        
        return {
            id: `TC-${Date.now()}`,
            scenarioId: scenario.id,
            template: TestCaseTemplate.CUCUMBER,
            content
        };
    }

    /**
     * Generates a custom test case
     * @param scenario The test scenario
     * @returns The generated test case
     */
    private generateCustomTestCase(scenario: TestScenario): TestCase {
        // Generate a simple custom template for MVP
        let content = `// Custom Test Case: ${scenario.title}\n`;
        content += `// Generated: ${new Date().toISOString()}\n\n`;
        
        if (scenario.description) {
            content += `// Description: ${scenario.description}\n\n`;
        }
        
        content += `test('${scenario.title}', async () => {\n`;
        content += `  // Setup\n`;
        
        // Add steps as comments
        content += `  // Steps:\n`;
        for (const step of scenario.steps) {
            content += `  // - ${step}\n`;
        }
        
        content += `\n  // Test implementation\n`;
        content += `  // TODO: Implement test\n\n`;
        
        // Add assertions for expected results
        content += `  // Assertions\n`;
        for (const result of scenario.expectedResults) {
            content += `  expect(true).toBe(true); // TODO: Implement assertion for: ${result}\n`;
        }
        
        content += `});\n`;
        
        return {
            id: `TC-${Date.now()}`,
            scenarioId: scenario.id,
            template: TestCaseTemplate.CUSTOM,
            content
        };
    }
}
