import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Base WebView provider for creating interactive UI panels
 */
export abstract class WebviewProvider implements vscode.WebviewViewProvider {
    protected context: vscode.ExtensionContext;
    protected view?: vscode.WebviewView;
    protected disposables: vscode.Disposable[] = [];

    constructor(protected readonly viewId: string, context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Resolves the webview view
     * @param webviewView The webview view to resolve
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.view = webviewView;
        
        // Configure webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'dist'))
            ]
        };
        
        // Set HTML content
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        
        // Setup message handling
        this.setupMessageHandling(webviewView.webview);
        
        // Register any additional disposables
        this.registerDisposables();
    }

    /**
     * Gets the HTML content for the webview
     * @param webview The webview to get HTML for
     * @returns The HTML content
     */
    protected getHtmlForWebview(webview: vscode.Webview): string {
        // Get CSS and JS file paths
        const scriptUri = this.getWebviewUri(webview, ['media', 'js', `${this.viewId}.js`]);
        const stylesUri = this.getWebviewUri(webview, ['media', 'css', `${this.viewId}.css`]);
        const codiconsUri = this.getWebviewUri(webview, ['media', 'css', 'codicon.css']);
        const nonce = this.getNonce();
        
        // Base HTML template
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; 
                    style-src ${webview.cspSource} 'unsafe-inline'; 
                    script-src 'nonce-${nonce}';
                    img-src ${webview.cspSource} https:;">
                <title>${this.getTitle()}</title>
                ${codiconsUri ? `<link href="${codiconsUri}" rel="stylesheet" />` : ''}
                ${stylesUri ? `<link href="${stylesUri}" rel="stylesheet" />` : ''}
                ${this.getAdditionalStylesheets(webview)}
            </head>
            <body>
                ${this.getBodyHtml()}
                ${scriptUri ? `<script nonce="${nonce}" src="${scriptUri}"></script>` : ''}
                <script nonce="${nonce}">
                    ${this.getInlineScript()}
                </script>
            </body>
            </html>`;
    }

    /**
     * Gets additional stylesheets for the webview
     * @param webview The webview
     * @returns The HTML string for additional stylesheet links
     */
    protected getAdditionalStylesheets(webview: vscode.Webview): string {
        return '';
    }

    /**
     * Gets a webview URI for a local file
     * @param webview The webview
     * @param pathParts Path parts to join
     * @returns The webview URI
     */
    protected getWebviewUri(webview: vscode.Webview, pathParts: string[]): vscode.Uri | undefined {
        const filePath = path.join(this.context.extensionPath, ...pathParts);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return undefined;
        }
        
        const uri = vscode.Uri.file(filePath);
        return webview.asWebviewUri(uri);
    }

    /**
     * Gets a nonce for scripts
     * @returns A random nonce
     */
    protected getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Sends a message to the webview
     * @param message The message to send
     */
    protected sendMessage(message: any): void {
        if (this.view) {
            this.view.webview.postMessage(message);
        }
    }

    /**
     * Refreshes the webview content
     */
    public refresh(): void {
        if (this.view) {
            this.view.webview.html = this.getHtmlForWebview(this.view.webview);
        }
    }

    /**
     * Disposes of resources
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    /**
     * Gets the title of the webview
     * @returns The webview title
     */
    protected abstract getTitle(): string;

    /**
     * Gets the HTML body content
     * @returns The HTML body content
     */
    protected abstract getBodyHtml(): string;

    /**
     * Gets the inline script for the webview
     * @returns The inline script
     */
    protected abstract getInlineScript(): string;

    /**
     * Sets up message handling
     * @param webview The webview
     */
    protected abstract setupMessageHandling(webview: vscode.Webview): void;

    /**
     * Registers additional disposables
     */
    protected abstract registerDisposables(): void;
}
