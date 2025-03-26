import * as vscode from 'vscode';
import { AIController, AIMode } from '../controller';
import { StatusBarManager } from '../../core/statusBar';

/**
 * Represents a single step in a plan
 */
export interface PlanStep {
    id: string;
    description: string;
    reasoning?: string;
    completed: boolean;
}

/**
 * Represents a complete plan
 */
export interface Plan {
    id: string;
    title: string;
    objective: string;
    steps: PlanStep[];
    createdAt: Date;
    approved: boolean;
}

/**
 * Manages the planning mode functionality
 */
export class Planner {
    private static instance: Planner;
    private currentPlan: Plan | null = null;
    private aiController: AIController;
    private statusBarManager: StatusBarManager;

    private constructor() {
        this.aiController = AIController.getInstance();
        this.statusBarManager = StatusBarManager.getInstance();
    }

    /**
     * Gets the singleton instance of the Planner
     * @returns The Planner instance
     */
    public static getInstance(): Planner {
        if (!Planner.instance) {
            Planner.instance = new Planner();
        }
        return Planner.instance;
    }

    /**
     * Creates a new plan for a given task
     * @param taskObjective The objective of the task
     * @param projectContext Optional context about the project
     * @returns Promise resolving to the created plan
     */
    public async createPlan(taskObjective: string, projectContext?: string): Promise<Plan> {
        try {
            // Ensure we're in planning mode
            this.aiController.setMode(AIMode.PLAN);
            this.statusBarManager.showBusy('Creating plan...');

            // Construct the prompt for plan generation
            const planPrompt = this.constructPlanPrompt(taskObjective, projectContext);
            
            // Send prompt to AI to generate a plan
            const response = await this.aiController.sendPrompt(
                planPrompt,
                'You are TestAutomationAgent MVP, a VSCode plugin assistant for test automation. Create a detailed step-by-step plan.'
            );
            
            // Parse the response into a structured plan
            const plan = this.parsePlanResponse(response.text, taskObjective);
            
            // Store the plan
            this.currentPlan = plan;
            
            // Update status
            this.statusBarManager.showSuccess('Plan created');
            
            return plan;
        } catch (error) {
            this.statusBarManager.showError('Failed to create plan');
            vscode.window.showErrorMessage(`Error creating plan: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Gets the current plan
     * @returns The current plan or null if none exists
     */
    public getCurrentPlan(): Plan | null {
        return this.currentPlan;
    }

    /**
     * Approves the current plan
     * @returns The approved plan
     */
    public approvePlan(): Plan | null {
        if (this.currentPlan) {
            this.currentPlan.approved = true;
            return this.currentPlan;
        }
        return null;
    }

    /**
     * Rejects the current plan
     */
    public rejectPlan(): void {
        this.currentPlan = null;
    }

    /**
     * Modifies the current plan
     * @param modifiedPlan The modified plan
     * @returns The updated plan
     */
    public modifyPlan(modifiedPlan: Plan): Plan {
        this.currentPlan = modifiedPlan;
        return modifiedPlan;
    }

    /**
     * Constructs the prompt for plan generation
     * @param taskObjective The objective of the task
     * @param projectContext Optional context about the project
     * @returns The constructed prompt
     */
    private constructPlanPrompt(taskObjective: string, projectContext?: string): string {
        return `
You are TestAutomationAgent MVP, a VSCode plugin assistant for test automation.

CONTEXT:
${projectContext || 'No specific project context provided.'}

TASK:
I need you to help me create a plan for: ${taskObjective}

INSTRUCTIONS:
1. Analyze the requirements and project context
2. Create a step-by-step plan to accomplish the task
3. For each step, explain your reasoning
4. Consider potential challenges and mitigations
5. Identify any prerequisites or dependencies

Please format your response as a numbered list of steps with explanations.
        `;
    }

    /**
     * Parses the AI response into a structured plan
     * @param responseText The response text from the AI
     * @param taskObjective The original task objective
     * @returns The parsed plan
     */
    private parsePlanResponse(responseText: string, taskObjective: string): Plan {
        // This is a simplified parser for demonstration
        // In a production version, this would use more robust parsing
        
        const lines = responseText.split('\n');
        const steps: PlanStep[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Look for numbered steps like "1." or "1)"
            const stepMatch = line.match(/^(\d+)[.)\]]\s+(.+)$/);
            
            if (stepMatch) {
                const stepNumber = stepMatch[1];
                const description = stepMatch[2];
                
                // Look for reasoning in the next lines (until next step or empty line)
                let reasoning = '';
                let j = i + 1;
                
                while (j < lines.length) {
                    const nextLine = lines[j].trim();
                    
                    // Stop if we hit another step or empty line
                    if (nextLine.match(/^\d+[.)\]]\s+/) || nextLine === '') {
                        break;
                    }
                    
                    reasoning += nextLine + ' ';
                    j++;
                }
                
                steps.push({
                    id: `step-${stepNumber}`,
                    description,
                    reasoning: reasoning.trim(),
                    completed: false
                });
            }
        }
        
        return {
            id: `plan-${Date.now()}`,
            title: `Plan for ${taskObjective.substring(0, 30)}...`,
            objective: taskObjective,
            steps,
            createdAt: new Date(),
            approved: false
        };
    }
}
