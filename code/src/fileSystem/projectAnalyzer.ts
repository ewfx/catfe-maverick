import * as vscode from 'vscode';
import * as path from 'path';
import { FileManager } from './fileManager';

/**
 * Project file information
 */
export interface ProjectFile {
    path: string;
    name: string;
    extension: string;
    type: 'file' | 'directory';
    size?: number;
    lastModified?: Date;
    language?: string;
}

/**
 * Project structure type
 */
export interface ProjectStructure {
    root: string;
    files: ProjectFile[];
    directories: string[];
    languages: Record<string, number>;
    totalFiles: number;
    totalDirectories: number;
}

/**
 * Project component information
 */
export interface ProjectComponent {
    name: string;
    type: 'class' | 'function' | 'interface' | 'enum' | 'variable' | 'import' | 'export' | 'unknown';
    path: string;
    language: string;
    lineNumber?: number;
    dependencies?: string[];
}

/**
 * Class for analyzing project structure and code
 */
export class ProjectAnalyzer {
    private static instance: ProjectAnalyzer;
    private fileManager: FileManager;
    private projectStructure: ProjectStructure | null = null;
    private projectComponents: ProjectComponent[] = [];
    private languageMap: Record<string, string> = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.json': 'json',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.less': 'less',
        '.py': 'python',
        '.java': 'java',
        '.c': 'c',
        '.cpp': 'cpp',
        '.cs': 'csharp',
        '.go': 'go',
        '.rb': 'ruby',
        '.php': 'php',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.rs': 'rust',
        '.md': 'markdown',
        '.feature': 'gherkin'
    };

    private constructor() {
        this.fileManager = FileManager.getInstance();
    }

    /**
     * Gets the singleton instance of the ProjectAnalyzer
     * @returns The ProjectAnalyzer instance
     */
    public static getInstance(): ProjectAnalyzer {
        if (!ProjectAnalyzer.instance) {
            ProjectAnalyzer.instance = new ProjectAnalyzer();
        }
        return ProjectAnalyzer.instance;
    }

    /**
     * Analyzes the project structure
     * @param rootPath The root path to analyze (defaults to workspace root)
     * @param excludePatterns Patterns to exclude from analysis
     * @returns Promise resolving to the project structure
     */
    public async analyzeProject(
        rootPath?: string,
        excludePatterns: string[] = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode']
    ): Promise<ProjectStructure> {
        // Use workspace root if no root path provided
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const actualRootPath = rootPath || workspaceRoot;
        
        if (!actualRootPath) {
            throw new Error('No workspace or root path provided');
        }

        const files: ProjectFile[] = [];
        const directories: string[] = [];
        const languages: Record<string, number> = {};

        try {
            // Analyze the project recursively
            await this.analyzeDirectory(actualRootPath, files, directories, languages, excludePatterns);
            
            // Update project structure
            this.projectStructure = {
                root: actualRootPath,
                files,
                directories,
                languages,
                totalFiles: files.length,
                totalDirectories: directories.length
            };
            
            return this.projectStructure;
        } catch (error) {
            console.error('Error analyzing project:', error);
            throw error;
        }
    }

    /**
     * Gets the project structure
     * @returns The project structure or null if not analyzed
     */
    public getProjectStructure(): ProjectStructure | null {
        return this.projectStructure;
    }

    /**
     * Gets all files of a specific type
     * @param extension The file extension to filter by
     * @returns Array of matching files
     */
    public getFilesByType(extension: string): ProjectFile[] {
        if (!this.projectStructure) {
            return [];
        }
        
        return this.projectStructure.files.filter(file => file.extension === extension);
    }

    /**
     * Gets files by language
     * @param language The language to filter by
     * @returns Array of matching files
     */
    public getFilesByLanguage(language: string): ProjectFile[] {
        if (!this.projectStructure) {
            return [];
        }
        
        return this.projectStructure.files.filter(file => file.language === language);
    }

    /**
     * Finds all test files in the project
     * @returns Array of test files
     */
    public findTestFiles(): ProjectFile[] {
        if (!this.projectStructure) {
            return [];
        }
        
        // Common test file patterns
        const testPatterns = [
            /\.test\.\w+$/,
            /\.spec\.\w+$/,
            /_test\.\w+$/,
            /Test\.\w+$/,
            /\.feature$/
        ];
        
        return this.projectStructure.files.filter(file => 
            testPatterns.some(pattern => pattern.test(file.path))
        );
    }

    /**
     * Analyzes directory contents recursively
     * @param dirPath Directory path to analyze
     * @param files Array to populate with file information
     * @param directories Array to populate with directory paths
     * @param languages Record to populate with language counts
     * @param excludePatterns Patterns to exclude
     */
    private async analyzeDirectory(
        dirPath: string,
        files: ProjectFile[],
        directories: string[],
        languages: Record<string, number>,
        excludePatterns: string[]
    ): Promise<void> {
        try {
            // Check if directory should be excluded
            const dirName = path.basename(dirPath);
            if (excludePatterns.includes(dirName)) {
                return;
            }
            
            // List directory contents
            const entries = await this.fileManager.listFiles(dirPath);
            
            // Add directory to list
            directories.push(dirPath);
            
            // Process each entry
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry);
                
                // Check if entry is a directory
                const isDirectory = await this.fileManager.directoryExists(entryPath);
                
                if (isDirectory) {
                    // Recursively analyze subdirectory
                    await this.analyzeDirectory(entryPath, files, directories, languages, excludePatterns);
                } else {
                    // Process file
                    const fileInfo = this.analyzeFile(entryPath);
                    
                    // Update language statistics
                    if (fileInfo.language) {
                        languages[fileInfo.language] = (languages[fileInfo.language] || 0) + 1;
                    }
                    
                    files.push(fileInfo);
                }
            }
        } catch (error) {
            console.error(`Error analyzing directory ${dirPath}:`, error);
        }
    }

    /**
     * Analyzes a file to extract information
     * @param filePath The file path to analyze
     * @returns File information
     */
    private analyzeFile(filePath: string): ProjectFile {
        const name = path.basename(filePath);
        const extension = path.extname(filePath);
        const language = this.languageMap[extension] || undefined;
        
        return {
            path: filePath,
            name,
            extension,
            type: 'file',
            language
        };
    }

    /**
     * Extracts components from source code
     * @param filePath File path to analyze
     * @returns Array of project components
     */
    public async extractComponents(filePath: string): Promise<ProjectComponent[]> {
        try {
            // Read the file
            const content = await this.fileManager.readFile(filePath);
            
            // Get file extension
            const extension = path.extname(filePath);
            const language = this.languageMap[extension] || 'unknown';
            
            const components: ProjectComponent[] = [];
            
            // Extract components based on language
            switch (language) {
                case 'typescript':
                case 'javascript':
                    this.extractJsComponents(content, filePath, language, components);
                    break;
                    
                case 'java':
                    this.extractJavaComponents(content, filePath, language, components);
                    break;
                    
                case 'python':
                    this.extractPythonComponents(content, filePath, language, components);
                    break;
                    
                case 'gherkin':
                    this.extractGherkinComponents(content, filePath, language, components);
                    break;
                    
                default:
                    // Generic component extraction
                    this.extractGenericComponents(content, filePath, language, components);
            }
            
            // Store components
            this.projectComponents = [...this.projectComponents, ...components];
            
            return components;
        } catch (error) {
            console.error(`Error extracting components from ${filePath}:`, error);
            return [];
        }
    }

    /**
     * Extracts JavaScript/TypeScript components
     * @param content File content
     * @param filePath File path
     * @param language Language
     * @param components Array to populate with components
     */
    private extractJsComponents(content: string, filePath: string, language: string, components: ProjectComponent[]): void {
        // Extract classes
        const classRegex = /class\s+(\w+)/g;
        let match;
        
        while ((match = classRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'class',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
        
        // Extract functions
        const functionRegex = /function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(\s*[^)]*\s*\)\s*=>/g;
        while ((match = functionRegex.exec(content)) !== null) {
            components.push({
                name: match[1] || match[2],
                type: 'function',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
        
        // Extract interfaces (TypeScript)
        const interfaceRegex = /interface\s+(\w+)/g;
        while ((match = interfaceRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'interface',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
    }

    /**
     * Extracts Java components
     * @param content File content
     * @param filePath File path
     * @param language Language
     * @param components Array to populate with components
     */
    private extractJavaComponents(content: string, filePath: string, language: string, components: ProjectComponent[]): void {
        // Extract classes
        const classRegex = /class\s+(\w+)/g;
        let match;
        
        while ((match = classRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'class',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
        
        // Extract methods
        const methodRegex = /(?:public|private|protected|static|\s) +[\w<>[\]]+\s+(\w+) *\([^)]*\) *(?:{|throws)/g;
        while ((match = methodRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'function',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
        
        // Extract interfaces
        const interfaceRegex = /interface\s+(\w+)/g;
        while ((match = interfaceRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'interface',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
    }

    /**
     * Extracts Python components
     * @param content File content
     * @param filePath File path
     * @param language Language
     * @param components Array to populate with components
     */
    private extractPythonComponents(content: string, filePath: string, language: string, components: ProjectComponent[]): void {
        // Extract classes
        const classRegex = /class\s+(\w+)/g;
        let match;
        
        while ((match = classRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'class',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
        
        // Extract functions
        const functionRegex = /def\s+(\w+)/g;
        while ((match = functionRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'function',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
    }

    /**
     * Extracts Gherkin components
     * @param content File content
     * @param filePath File path
     * @param language Language
     * @param components Array to populate with components
     */
    private extractGherkinComponents(content: string, filePath: string, language: string, components: ProjectComponent[]): void {
        // Extract feature
        const featureRegex = /Feature:\s*(.+)$/m;
        const featureMatch = featureRegex.exec(content);
        
        if (featureMatch) {
            components.push({
                name: featureMatch[1].trim(),
                type: 'class', // Using 'class' for feature
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, featureMatch.index)
            });
        }
        
        // Extract scenarios
        const scenarioRegex = /Scenario(?:\s+Outline)?:\s*(.+)$/gm;
        let match;
        
        while ((match = scenarioRegex.exec(content)) !== null) {
            components.push({
                name: match[1].trim(),
                type: 'function', // Using 'function' for scenarios
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
    }

    /**
     * Extracts generic components from unknown file types
     * @param content File content
     * @param filePath File path
     * @param language Language
     * @param components Array to populate with components
     */
    private extractGenericComponents(content: string, filePath: string, language: string, components: ProjectComponent[]): void {
        // For unknown file types, we'll just extract basic patterns
        
        // Extract what might be function-like patterns
        const functionRegex = /(?:function|def|method|procedure)\s+(\w+)/g;
        let match;
        
        while ((match = functionRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'function',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
        
        // Extract what might be class-like patterns
        const classRegex = /(?:class|interface|struct|enum)\s+(\w+)/g;
        while ((match = classRegex.exec(content)) !== null) {
            components.push({
                name: match[1],
                type: 'class',
                path: filePath,
                language,
                lineNumber: this.getLineNumber(content, match.index)
            });
        }
    }

    /**
     * Gets the line number for a character position
     * @param content File content
     * @param index Character index
     * @returns Line number (1-based)
     */
    private getLineNumber(content: string, index: number): number {
        const lines = content.substring(0, index).split('\n');
        return lines.length;
    }
}
