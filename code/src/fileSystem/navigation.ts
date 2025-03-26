import * as vscode from 'vscode';
import * as path from 'path';
import { FileManager } from './fileManager';
import { ProjectAnalyzer, ProjectComponent, ProjectFile } from './projectAnalyzer';

/**
 * Result of a file search
 */
export interface SearchResult {
    file: ProjectFile;
    lineNumber?: number;
    columnNumber?: number;
    matchText?: string;
    context?: string;
}

/**
 * Class for navigating the project structure
 */
export class ProjectNavigator {
    private static instance: ProjectNavigator;
    private fileManager: FileManager;
    private projectAnalyzer: ProjectAnalyzer;

    private constructor() {
        this.fileManager = FileManager.getInstance();
        this.projectAnalyzer = ProjectAnalyzer.getInstance();
    }

    /**
     * Gets the singleton instance of the ProjectNavigator
     * @returns The ProjectNavigator instance
     */
    public static getInstance(): ProjectNavigator {
        if (!ProjectNavigator.instance) {
            ProjectNavigator.instance = new ProjectNavigator();
        }
        return ProjectNavigator.instance;
    }

    /**
     * Finds files by name
     * @param name File name to search for
     * @param exactMatch Whether to require an exact match
     * @returns Promise resolving to an array of matching files
     */
    public async findFilesByName(name: string, exactMatch: boolean = false): Promise<ProjectFile[]> {
        // Make sure we have analyzed the project
        const projectStructure = this.projectAnalyzer.getProjectStructure();
        if (!projectStructure) {
            await this.projectAnalyzer.analyzeProject();
        }
        
        const updatedProjectStructure = this.projectAnalyzer.getProjectStructure();
        if (!updatedProjectStructure) {
            return [];
        }
        
        // Search for files by name
        return updatedProjectStructure.files.filter(file => {
            if (exactMatch) {
                return file.name === name;
            } else {
                return file.name.toLowerCase().includes(name.toLowerCase());
            }
        });
    }

    /**
     * Finds files by content
     * @param searchText Text to search for in file contents
     * @param filePattern Optional file pattern to restrict search
     * @returns Promise resolving to an array of search results
     */
    public async findFilesByContent(searchText: string, filePattern?: string): Promise<SearchResult[]> {
        // Make sure we have analyzed the project
        const projectStructure = this.projectAnalyzer.getProjectStructure();
        if (!projectStructure) {
            await this.projectAnalyzer.analyzeProject();
        }
        
        const updatedProjectStructure = this.projectAnalyzer.getProjectStructure();
        if (!updatedProjectStructure) {
            return [];
        }
        
        // Filter files by pattern if provided
        let filesToSearch = updatedProjectStructure.files;
        if (filePattern) {
            const patternRegex = new RegExp(this.globToRegExp(filePattern));
            filesToSearch = filesToSearch.filter(file => patternRegex.test(file.path));
        }
        
        const results: SearchResult[] = [];
        
        // Search each file for the content
        for (const file of filesToSearch) {
            try {
                const content = await this.fileManager.readFile(file.path);
                const lines = content.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.includes(searchText)) {
                        // Calculate column number (character position in the line)
                        const columnNumber = line.indexOf(searchText);
                        
                        // Get context (previous and next line if available)
                        let context = '';
                        if (i > 0) {
                            context += lines[i - 1] + '\n';
                        }
                        context += line + '\n';
                        if (i < lines.length - 1) {
                            context += lines[i + 1];
                        }
                        
                        results.push({
                            file,
                            lineNumber: i + 1, // 1-based line number
                            columnNumber,
                            matchText: line,
                            context
                        });
                    }
                }
            } catch (error) {
                console.error(`Error searching file ${file.path}:`, error);
            }
        }
        
        return results;
    }

    /**
     * Finds related files to a given file
     * @param filePath Path of the file to find related files for
     * @returns Promise resolving to an array of related files
     */
    public async findRelatedFiles(filePath: string): Promise<ProjectFile[]> {
        // Get file info
        const baseName = path.basename(filePath, path.extname(filePath));
        const dirName = path.dirname(filePath);
        
        // Make sure we have analyzed the project
        const projectStructure = this.projectAnalyzer.getProjectStructure();
        if (!projectStructure) {
            await this.projectAnalyzer.analyzeProject();
        }
        
        const updatedProjectStructure = this.projectAnalyzer.getProjectStructure();
        if (!updatedProjectStructure) {
            return [];
        }
        
        // Find related files based on name and location
        return updatedProjectStructure.files.filter(file => {
            // Skip the original file
            if (file.path === filePath) {
                return false;
            }
            
            // Check if it's in the same directory and has a related name
            const fileBaseName = path.basename(file.path, path.extname(file.path));
            const fileDirName = path.dirname(file.path);
            
            return (
                // Files in the same directory with similar names
                (fileDirName === dirName && (
                    fileBaseName.includes(baseName) || 
                    baseName.includes(fileBaseName)
                )) ||
                // Test files for implementation files
                (fileBaseName === `${baseName}.test` || 
                 fileBaseName === `${baseName}.spec` || 
                 fileBaseName === `${baseName}Test` || 
                 fileBaseName === `Test${baseName}`) ||
                // Implementation files for test files
                (baseName === `${fileBaseName}.test` || 
                 baseName === `${fileBaseName}.spec` || 
                 baseName === `${fileBaseName}Test` || 
                 baseName === `Test${fileBaseName}`)
            );
        });
    }

    /**
     * Finds components in the project
     * @param componentName Component name to search for
     * @param componentType Optional component type to filter by
     * @returns Promise resolving to an array of matching components
     */
    public async findComponents(componentName: string, componentType?: string): Promise<ProjectComponent[]> {
        // Make sure we have analyzed the project
        const projectStructure = this.projectAnalyzer.getProjectStructure();
        if (!projectStructure) {
            await this.projectAnalyzer.analyzeProject();
        }
        
        // Extract components from all files
        const components: ProjectComponent[] = [];
        
        for (const file of projectStructure?.files || []) {
            const fileComponents = await this.projectAnalyzer.extractComponents(file.path);
            components.push(...fileComponents);
        }
        
        // Filter components by name and type
        return components.filter(component => {
            if (!component.name.toLowerCase().includes(componentName.toLowerCase())) {
                return false;
            }
            
            if (componentType && component.type !== componentType) {
                return false;
            }
            
            return true;
        });
    }

    /**
     * Opens a file in the editor
     * @param filePath Path of the file to open
     * @param lineNumber Optional line number to navigate to
     * @param columnNumber Optional column number to navigate to
     * @returns Promise resolving when the file is opened
     */
    public async openFile(filePath: string, lineNumber?: number, columnNumber?: number): Promise<void> {
        try {
            // Check if file exists
            const fileExists = await this.fileManager.fileExists(filePath);
            if (!fileExists) {
                throw new Error(`File not found: ${filePath}`);
            }
            
            // Create a URI for the file
            const uri = vscode.Uri.file(filePath);
            
            // Open the document
            const document = await vscode.workspace.openTextDocument(uri);
            
            // Show the document in an editor
            const editor = await vscode.window.showTextDocument(document);
            
            // Navigate to specific position if provided
            if (lineNumber !== undefined) {
                // Convert to 0-based line and column numbers
                const line = Math.max(0, lineNumber - 1);
                const column = columnNumber !== undefined ? columnNumber : 0;
                
                // Create a selection at the specified position
                const position = new vscode.Position(line, column);
                const selection = new vscode.Selection(position, position);
                
                // Set the selection and reveal the position
                editor.selection = selection;
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
            }
        } catch (error) {
            console.error(`Error opening file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Gets a file's import dependencies
     * @param filePath Path of the file to analyze
     * @returns Promise resolving to an array of import dependencies
     */
    public async getFileDependencies(filePath: string): Promise<string[]> {
        try {
            const content = await this.fileManager.readFile(filePath);
            const dependencies: string[] = [];
            
            // Extract import statements based on file type
            const extension = path.extname(filePath);
            
            switch (extension) {
                case '.js':
                case '.jsx':
                case '.ts':
                case '.tsx':
                    // JavaScript/TypeScript imports
                    this.extractJsImports(content, dependencies);
                    break;
                    
                case '.java':
                    // Java imports
                    this.extractJavaImports(content, dependencies);
                    break;
                    
                case '.py':
                    // Python imports
                    this.extractPythonImports(content, dependencies);
                    break;
                    
                default:
                    // Generic import extraction
                    this.extractGenericImports(content, dependencies);
            }
            
            return dependencies;
        } catch (error) {
            console.error(`Error getting file dependencies for ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Extracts JavaScript/TypeScript imports
     * @param content File content
     * @param dependencies Array to populate with dependencies
     */
    private extractJsImports(content: string, dependencies: string[]): void {
        // ES6 imports
        const es6ImportRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
        let match;
        
        while ((match = es6ImportRegex.exec(content)) !== null) {
            dependencies.push(match[1]);
        }
        
        // CommonJS require
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            dependencies.push(match[1]);
        }
    }

    /**
     * Extracts Java imports
     * @param content File content
     * @param dependencies Array to populate with dependencies
     */
    private extractJavaImports(content: string, dependencies: string[]): void {
        const importRegex = /import\s+([^;]+);/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            dependencies.push(match[1].trim());
        }
    }

    /**
     * Extracts Python imports
     * @param content File content
     * @param dependencies Array to populate with dependencies
     */
    private extractPythonImports(content: string, dependencies: string[]): void {
        // import module
        const importRegex = /import\s+(\w+)/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            dependencies.push(match[1]);
        }
        
        // from module import name
        const fromImportRegex = /from\s+(\w+)(?:\.\w+)*\s+import/g;
        while ((match = fromImportRegex.exec(content)) !== null) {
            dependencies.push(match[1]);
        }
    }

    /**
     * Extracts generic imports
     * @param content File content
     * @param dependencies Array to populate with dependencies
     */
    private extractGenericImports(content: string, dependencies: string[]): void {
        // Generic import/include/require patterns
        const genericImportRegex = /(?:import|include|require)\s+['"]?([^'"\s;)]+)['"]?/g;
        let match;
        
        while ((match = genericImportRegex.exec(content)) !== null) {
            dependencies.push(match[1]);
        }
    }

    /**
     * Converts a glob pattern to a regular expression
     * @param pattern The glob pattern
     * @returns The regular expression
     */
    private globToRegExp(pattern: string): string {
        let regExpPattern = pattern
            .replace(/\./g, '\\.')   // Escape dots
            .replace(/\*/g, '.*')    // * becomes .*
            .replace(/\?/g, '.');    // ? becomes .
        
        return `^${regExpPattern}$`;
    }
}
