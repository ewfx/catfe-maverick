import * as vscode from 'vscode';
import { AIController, AIMode } from '../controller';
import { StatusBarManager } from '../../core/statusBar';
import { Plan, PlanStep } from './planner';

/**
 * Result type for step execution
 */
export interface StepExecutionResult {
    success: boolean;
    message: string;
    output?: string;
    error?: Error;
}

/**
 * Manages the action mode functionality
 */
export class Executor {
    private static instance: Executor;
    private currentPlan: Plan | null = null;
    private currentStepIndex: number = 0;
    private aiController: AIController;
    private statusBarManager: StatusBarManager;

    private constructor() {
        this.aiController = AIController.getInstance();
        this.statusBarManager = StatusBarManager.getInstance();
    }

    /**
     * Gets the singleton instance of the Executor
     * @returns The Executor instance
     */
    public static getInstance(): Executor {
        if (!Executor.instance) {
            Executor.instance = new Executor();
        }
        return Executor.instance;
    }

    /**
     * Sets the plan to execute
     * @param plan The plan to execute
     */
    public setPlan(plan: Plan): void {
        this.currentPlan = plan;
        this.currentStepIndex = 0;
    }

    /**
     * Gets the current plan
     * @returns The current plan
     */
    public getCurrentPlan(): Plan | null {
        return this.currentPlan;
    }

    /**
     * Gets the current step index
     * @returns The current step index
     */
    public getCurrentStepIndex(): number {
        return this.currentStepIndex;
    }

    /**
     * Gets the current step
     * @returns The current step or null if no plan is set
     */
    public getCurrentStep(): PlanStep | null {
        if (!this.currentPlan || this.currentStepIndex >= this.currentPlan.steps.length) {
            return null;
        }
        return this.currentPlan.steps[this.currentStepIndex];
    }

    /**
     * Executes the next step in the plan
     * @param projectContext Optional context about the project
     * @returns Promise resolving to the execution result
     */
    public async executeNextStep(projectContext?: string): Promise<StepExecutionResult> {
        if (!this.currentPlan) {
            return {
                success: false,
                message: 'No plan set. Please create and approve a plan first.'
            };
        }

        if (this.currentStepIndex >= this.currentPlan.steps.length) {
            return {
                success: false,
                message: 'All steps in the plan have been executed.'
            };
        }

        try {
            // Ensure we're in action mode
            this.aiController.setMode(AIMode.ACT);
            
            const currentStep = this.currentPlan.steps[this.currentStepIndex];
            this.statusBarManager.showBusy(`Executing step ${this.currentStepIndex + 1}: ${currentStep.description}`);

            // Construct the prompt for step execution
            const executionPrompt = this.constructExecutionPrompt(projectContext);
            
            // Send prompt to AI to execute the step
            const response = await this.aiController.sendPrompt(
                executionPrompt,
                'You are TestAutomationAgent MVP, a VSCode plugin assistant for test automation. Execute the current step efficiently and precisely.'
            );
            
            // Mark the step as completed
            currentStep.completed = true;
            
            // Increment the step index
            this.currentStepIndex++;
            
            // Update status
            this.statusBarManager.showSuccess(`Step ${this.currentStepIndex} completed`);
            
            return {
                success: true,
                message: `Step ${this.currentStepIndex} executed successfully`,
                output: response.text
            };
        } catch (error) {
            this.statusBarManager.showError('Failed to execute step');
            
            return {
                success: false,
                message: `Error executing step: ${(error as Error).message}`,
                error: error as Error
            };
        }
    }

    /**
     * Executes all remaining steps in the plan
     * @param projectContext Optional context about the project
     * @returns Promise resolving to an array of execution results
     */
    public async executeAllSteps(projectContext?: string): Promise<StepExecutionResult[]> {
        if (!this.currentPlan) {
            return [{
                success: false,
                message: 'No plan set. Please create and approve a plan first.'
            }];
        }

        const results: StepExecutionResult[] = [];
        
        while (this.currentStepIndex < this.currentPlan.steps.length) {
            const result = await this.executeNextStep(projectContext);
            results.push(result);
            
            // Stop execution if a step fails
            if (!result.success) {
                break;
            }
        }
        
        return results;
    }

    /**
     * Resets the execution state
     */
    public reset(): void {
        this.currentPlan = null;
        this.currentStepIndex = 0;
    }

    /**
     * Constructs the prompt for step execution
     * @param projectContext Optional context about the project
     * @returns The constructed prompt
     */
    private constructExecutionPrompt(projectContext?: string): string {
        if (!this.currentPlan || this.currentStepIndex >= this.currentPlan.steps.length) {
            throw new Error('No current step to execute');
        }

        const currentStep = this.currentPlan.steps[this.currentStepIndex];
        
        return `
You are TestAutomationAgent MVP, a VSCode plugin assistant for test automation.

CONTEXT:
${projectContext || 'No specific project context provided.'}
${this.constructPlanContext()}

TASK:
I need you to execute step ${this.currentStepIndex + 1} of the approved plan: "${currentStep.description}"

INSTRUCTIONS:
1. Focus only on executing the current step
2. Generate any necessary code or content
3. Explain your implementation
4. If you encounter unexpected issues, describe them and propose solutions

TOOLS AVAILABLE:
- File system operations
- Terminal commands
- API integrations
- Test frameworks

Please generate the implementation for this step now.
        `;
    }

    /**
     * Constructs the plan context for the execution prompt
     * @returns The constructed plan context
     */
    private constructPlanContext(): string {
        if (!this.currentPlan) {
            return '';
        }

        let context = `APPROVED PLAN: ${this.currentPlan.title}\n`;
        context += `OBJECTIVE: ${this.currentPlan.objective}\n\n`;
        context += 'STEPS:\n';
        
        this.currentPlan.steps.forEach((step, index) => {
            context += `${index + 1}. ${step.description}${step.completed ? ' [COMPLETED]' : ''}${index === this.currentStepIndex ? ' [CURRENT]' : ''}\n`;
        });
        
        return context;
    }
}
