import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const MAX_CONTEXT_FILES = 5; // Limit the number of files to prevent overly large prompts

/**
 * Gathers a relevant context for an LLM query based on the active editor.
 * * @returns A formatted string containing the active file's content 
 * and the content of its direct imports.
 */
export async function buildContext(): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return 'No active editor found. Please open a file.';
    }

    const activeDocument = editor.document;
    const activeFileContent = activeDocument.getText();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeDocument.uri);
    if (!workspaceFolder) {
        return activeFileContent; // Return only active file if not in a workspace
    }

    const contextFiles: { path: string; content: string }[] = [];
    contextFiles.push({ path: activeDocument.fileName, content: activeFileContent });

    // 1. Find imported files using a regular expression
    const importRegex = /import\s+['"](package:[\w\/]+\.dart|[\.\/\w]+\.dart)['"];/g;
    const importedPaths = new Set<string>();
    let match;

    while ((match = importRegex.exec(activeFileContent)) !== null) {
        importedPaths.add(match[1]);
    }

    // 2. Read the content of each imported file
    for (const importPath of importedPaths) {
        if (contextFiles.length >= MAX_CONTEXT_FILES) {
            break; // Stop if we've gathered enough files
        }

        // Skip package imports for now as they are harder to resolve without the full dependency graph
        if (importPath.startsWith('package:')) {
            continue;
        }

        const absolutePath = path.resolve(path.dirname(activeDocument.uri.fsPath), importPath);

        if (fs.existsSync(absolutePath)) {
            try {
                const content = await fs.promises.readFile(absolutePath, 'utf-8');
                contextFiles.push({ path: absolutePath, content });
            } catch (error) {
                console.error(`Error reading imported file ${absolutePath}:`, error);
            }
        }
    }

    // 3. Format the collected context into a single string
    let formattedContext = '';
    for (const file of contextFiles) {
        const relativePath = path.relative(workspaceFolder.uri.fsPath, file.path);
        formattedContext += `--- File: ${relativePath} ---\n\n${file.content}\n\n`;
    }

    return formattedContext.trim();
}