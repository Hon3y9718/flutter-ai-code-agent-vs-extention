import * as vscode from 'vscode';

/**
 * Provides the "Flutter Agent: Fix this" Code Action.
 */
export class FlutterAgentCodeActionProvider implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
    ];

    provideCodeActions(
        document: vscode.TextDocument, 
        range: vscode.Range
    ): vscode.CodeAction[] | undefined {

        // Only show the action if the user has selected text.
        if (range.isEmpty) {
            return;
        }

        const fixAction = new vscode.CodeAction('Flutter Agent: Fix this', FlutterAgentCodeActionProvider.providedCodeActionKinds[0]);
        
        // The magic happens here: we associate this action with a command.
        // We pass the document URI and the selected range as arguments to the command.
        fixAction.command = {
            command: 'flutterAgent.applyFix', // This is the command we will register next
            title: 'Apply LLM-powered fix',
            tooltip: 'This will send the selected code to an AI to generate a fix.',
            arguments: [document.uri, range],
        };

        return [fixAction];
    }
}