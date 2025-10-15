import * as vscode from 'vscode';
import { askLLM } from './llmService';

export class FlutterAgentCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}
    
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem[]> {

        // Get the code on the current line up to the cursor
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        // We can add a simple check to avoid triggering on every keystroke
        if (linePrefix.length < 2 || linePrefix.endsWith(' ')) {
            return [];
        }

        // Get a larger chunk of code for context
        const start = new vscode.Position(Math.max(0, position.line - 20), 0);
        const end = new vscode.Position(position.line + 20, 0);
        const range = new vscode.Range(start, end);
        const codeContext = document.getText(range);

        const systemPrompt = `You are a Flutter/Dart code completion AI. 
        Your task is to complete the user's line of code.
        Respond ONLY with the code that should come next. Do NOT include the code the user has already typed. 
        Do not provide explanations or markdown. Be concise.`;
        
        const userPrompt = `Here is the current code context:\n\`\`\`dart\n${codeContext}\n\`\`\`\n\nComplete this line of code:\n${linePrefix}`;

        try {
            const completionText = await askLLM(this.context, systemPrompt, userPrompt);
            if (token.isCancellationRequested || !completionText) {
                return [];
            }
            
            // Create a completion item
            const completionItem = new vscode.CompletionItem(
                completionText, 
                vscode.CompletionItemKind.Snippet
            );
            
            // This text will be inserted when the user accepts the suggestion
            completionItem.insertText = completionText;
            
            // Add a small description
            completionItem.documentation = new vscode.MarkdownString("✨ AI Suggestion");
            
            return [completionItem];

        } catch (e) {
            console.error("Code completion error:", e);
            return [];
        }
    }
}