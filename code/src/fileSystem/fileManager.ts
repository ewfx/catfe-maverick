import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { logger } from '../utils/logger';

// Convert fs functions to promise-based versions
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);

/**
 * Manager for file system operations
 */
export class FileManager {
    private static instance: FileManager;

    private constructor() {
        // Private constructor for singleton pattern
    }

    /**
     * Gets the singleton instance of the FileManager
     * @returns The FileManager instance
     */
    public static getInstance(): FileManager {
        if (!FileManager.instance) {
            FileManager.instance = new FileManager();
            logger.debug('FileManager instance created');
        }
        return FileManager.instance;
    }

    /**
     * Reads a file from the workspace
     * @param filePath The path to the file (absolute or workspace-relative)
     * @returns Promise resolving to the file content
     */
    public async readFile(filePath: string): Promise<string> {
        try {
            logger.info(`Reading file: ${filePath}`);
            const absolutePath = this.resolveFilePath(filePath);
            logger.debug(`Resolved path: ${absolutePath}`);
            
            const content = (await readFile(absolutePath)).toString('utf8');
            logger.debug(`Successfully read file, content length: ${content.length} characters`);
            return content;
        } catch (error) {
            this.handleError('Error reading file', error, filePath);
            throw error;
        }
    }

    /**
     * Writes content to a file in the workspace
     * @param filePath The path to the file (absolute or workspace-relative)
     * @param content The content to write
     * @returns Promise resolving when the file is written
     */
    public async writeFile(filePath: string, content: string): Promise<void> {
        try {
            logger.info(`Writing to file: ${filePath}`);
            logger.debug(`Content length: ${content.length} characters`);
            
            const absolutePath = this.resolveFilePath(filePath);
            logger.debug(`Resolved path: ${absolutePath}`);
            
            // Ensure the directory exists
            const dirPath = path.dirname(absolutePath);
            logger.debug(`Ensuring directory exists: ${dirPath}`);
            await this.ensureDirectory(dirPath);
            
            // Write the file
            await writeFile(absolutePath, content);
            logger.info(`Successfully wrote file: ${filePath}`);
        } catch (error) {
            this.handleError('Error writing file', error, filePath);
            throw error;
        }
    }

    /**
     * Creates a directory if it doesn't exist
     * @param dirPath The path to the directory (absolute or workspace-relative)
     * @returns Promise resolving when the directory is created
     */
    public async createDirectory(dirPath: string): Promise<void> {
        try {
            logger.info(`Creating directory: ${dirPath}`);
            const absolutePath = this.resolveFilePath(dirPath);
            logger.debug(`Resolved path: ${absolutePath}`);
            
            await this.ensureDirectory(absolutePath);
            logger.info(`Successfully created directory: ${dirPath}`);
        } catch (error) {
            this.handleError('Error creating directory', error, dirPath);
            throw error;
        }
    }

    /**
     * Lists files in a directory
     * @param dirPath The path to the directory (absolute or workspace-relative)
     * @param pattern Optional glob pattern for filtering
     * @returns Promise resolving to the list of file paths
     */
    public async listFiles(dirPath: string, pattern?: string): Promise<string[]> {
        try {
            logger.info(`Listing files in directory: ${dirPath}${pattern ? ` with pattern: ${pattern}` : ''}`);
            const absolutePath = this.resolveFilePath(dirPath);
            logger.debug(`Resolved path: ${absolutePath}`);
            
            // Check if the directory exists
            await this.ensureDirectoryExists(absolutePath);
            
            // Read the directory
            const files = await readdir(absolutePath);
            logger.debug(`Found ${files.length} files in directory`);
            
            // Filter by pattern if provided
            if (pattern) {
                logger.debug(`Filtering files with pattern: ${pattern}`);
                const matcher = new RegExp(this.globToRegExp(pattern));
                const filteredFiles = files.filter(file => matcher.test(file));
                logger.debug(`${filteredFiles.length} files match the pattern`);
                return filteredFiles;
            }
            
            return files;
        } catch (error) {
            this.handleError('Error listing files', error, dirPath);
            throw error;
        }
    }

    /**
     * Deletes a file from the workspace
     * @param filePath The path to the file (absolute or workspace-relative)
     * @returns Promise resolving when the file is deleted
     */
    public async deleteFile(filePath: string): Promise<void> {
        try {
            logger.info(`Deleting file: ${filePath}`);
            const absolutePath = this.resolveFilePath(filePath);
            logger.debug(`Resolved path: ${absolutePath}`);
            
            await unlink(absolutePath);
            logger.info(`Successfully deleted file: ${filePath}`);
        } catch (error) {
            this.handleError('Error deleting file', error, filePath);
            throw error;
        }
    }

    /**
     * Checks if a file exists
     * @param filePath The path to the file (absolute or workspace-relative)
     * @returns Promise resolving to a boolean indicating if the file exists
     */
    public async fileExists(filePath: string): Promise<boolean> {
        try {
            logger.debug(`Checking if file exists: ${filePath}`);
            const absolutePath = this.resolveFilePath(filePath);
            const stats = await stat(absolutePath);
            const exists = stats.isFile();
            logger.debug(`File ${exists ? 'exists' : 'does not exist'}: ${filePath}`);
            return exists;
        } catch (error) {
            logger.debug(`File does not exist: ${filePath}`);
            return false;
        }
    }

    /**
     * Checks if a directory exists
     * @param dirPath The path to the directory (absolute or workspace-relative)
     * @returns Promise resolving to a boolean indicating if the directory exists
     */
    public async directoryExists(dirPath: string): Promise<boolean> {
        try {
            logger.debug(`Checking if directory exists: ${dirPath}`);
            const absolutePath = this.resolveFilePath(dirPath);
            const stats = await stat(absolutePath);
            const exists = stats.isDirectory();
            logger.debug(`Directory ${exists ? 'exists' : 'does not exist'}: ${dirPath}`);
            return exists;
        } catch (error) {
            logger.debug(`Directory does not exist: ${dirPath}`);
            return false;
        }
    }

    /**
     * Converts a workspace-relative path to an absolute path
     * @param filePath The path to resolve (absolute or workspace-relative)
     * @returns The absolute path
     */
    private resolveFilePath(filePath: string): string {
        // If the path is already absolute, return it
        if (path.isAbsolute(filePath)) {
            logger.debug(`Path is already absolute: ${filePath}`);
            return filePath;
        }
        
        // Get the workspace root
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            logger.error('No workspace folder is open');
            throw new Error('No workspace folder is open');
        }
        
        // Resolve the path relative to the workspace
        const resolvedPath = path.join(workspaceFolder.uri.fsPath, filePath);
        logger.debug(`Resolved path from ${filePath} to ${resolvedPath}`);
        return resolvedPath;
    }

    /**
     * Ensures a directory exists, creating it if necessary
     * @param dirPath The absolute path to the directory
     * @returns Promise resolving when the directory exists
     */
    private async ensureDirectory(dirPath: string): Promise<void> {
        try {
            logger.debug(`Ensuring directory exists: ${dirPath}`);
            await mkdir(dirPath, { recursive: true });
            logger.debug(`Directory ensured: ${dirPath}`);
        } catch (error) {
            // Ignore error if the directory already exists
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                logger.error(`Error ensuring directory: ${dirPath}`, error);
                throw error;
            } else {
                logger.debug(`Directory already exists: ${dirPath}`);
            }
        }
    }

    /**
     * Ensures a directory exists, throwing an error if it doesn't
     * @param dirPath The absolute path to the directory
     * @returns Promise resolving when the directory is confirmed to exist
     */
    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            logger.debug(`Checking if directory exists: ${dirPath}`);
            const stats = await stat(dirPath);
            
            if (!stats.isDirectory()) {
                logger.error(`Path exists but is not a directory: ${dirPath}`);
                throw new Error(`Path exists but is not a directory: ${dirPath}`);
            }
            
            logger.debug(`Confirmed directory exists: ${dirPath}`);
        } catch (error) {
            // Check if the error is because the directory doesn't exist
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                logger.error(`Directory does not exist: ${dirPath}`);
                throw new Error(`Directory does not exist: ${dirPath}`);
            }
            
            logger.error(`Error checking directory: ${dirPath}`, error);
            throw error;
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

    /**
     * Handles errors from file operations
     * @param message Error message prefix
     * @param error The error object
     * @param filePath The file path that caused the error
     */
    private handleError(message: string, error: unknown, filePath: string): void {
        const errorMessage = `${message}: ${(error as Error).message} (${filePath})`;
        logger.error(errorMessage, error);
    }
}
