import * as vscode from "vscode";
import { ChatViewProvider } from "./webview/chatPanel";
import { askLLM } from "./llmService";
import { getFlutterFiles } from "./projectScanner";
import { buildContext } from "./contextManager";
import { FlutterAgentCodeActionProvider } from "./codeActions";
import { FlutterAgentHoverProvider } from "./hoverProvider";
import { FlutterAgentCompletionProvider } from './completionProvider';
import { ApiKeyManager } from './apiKeyManager';

export function activate(context: vscode.ExtensionContext) {
  const chatProvider = new ChatViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("flutterAgent.chat", chatProvider)
  );

  // Hover Action
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: "file", language: "dart" },
      new FlutterAgentHoverProvider(context)
    )
  );

  // Completion Provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: 'dart' },
      new FlutterAgentCompletionProvider(context),
      '.', // Trigger characters (optional, e.g., '.', '(', etc.)
      ' '
    )
  );

  // This is the new listener for code selection.
  // It sends the selected text to our chat panel.
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.selections.length > 0) {
        const selectedText = event.textEditor.document.getText(event.selections[0]);
        // Only update context if the selection is not empty
        if (selectedText.trim() !== "") {
          chatProvider.setChatContext(selectedText);
        }
      }
    })
  );

  // command: explain selected code

  // Set API Key
   const setApiKeyCmd = vscode.commands.registerCommand(
      'flutterAgent.setApiKey',
      async () => {
		ApiKeyManager.setApiKey(context);
	  }
    );

	context.subscriptions.push(setApiKeyCmd);

  const explainCmd = vscode.commands.registerCommand(
    "flutterAgent.explain",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return vscode.window.showErrorMessage("Open a Dart file first.");
      }

      const selectedText = editor.document.getText(editor.selection);
      const filePath = editor.document.fileName;
      const projectContext = getFlutterFiles(vscode.workspace.rootPath || "");

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Analyzing code...",
        },
        async () => {
          const result = await askLLM(
			context,
            `You are a senior Flutter developer using GetX. Explain what the selected code does and how it fits into the project.`,
            `File: ${filePath}\nCode:\n${selectedText}\n\nProject files:\n${projectContext.join(
              "\n"
            )}`
          );
          vscode.window.showInformationMessage(result.slice(0, 500) + "...");
        }
      );
    }
  );

  context.subscriptions.push(explainCmd);

  const applyFixCmd = vscode.commands.registerCommand(
    "flutterAgent.applyFix",
    async (documentUri: vscode.Uri, range: vscode.Range) => {
      const document = await vscode.workspace.openTextDocument(documentUri);
      const selectedText = document.getText(range);
      const relevantContext = await buildContext(); // Reuse our intelligent context builder

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Flutter Agent: Generating fix...",
          cancellable: true,
        },
        async (progress) => {
          progress.report({ increment: 0 });

          const systemPrompt = `You are an expert Flutter/Dart developer. Your task is to fix the user's selected code.
                Respond ONLY with the corrected code snippet. Do NOT include explanations, markdown, or any text other than the code itself.`;

          const userPrompt = `Context:\n${relevantContext}\n\nPlease fix this selected code snippet:\n\`\`\`dart\n${selectedText}\n\`\`\``;

          const fix = await askLLM(context, systemPrompt, userPrompt);
          progress.report({ increment: 50 });

          if (fix) {
            // Apply the fix to the document
            const edit = new vscode.WorkspaceEdit();
            edit.replace(documentUri, range, fix);
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage(
              "Flutter Agent applied the fix!"
            );
          } else {
            vscode.window.showErrorMessage(
              "Flutter Agent could not generate a fix."
            );
          }
          progress.report({ increment: 100 });
        }
      );
    }
  );
  context.subscriptions.push(applyFixCmd);

  // 👇 3. REGISTER THE CODE ACTION PROVIDER ITSELF
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file", language: "dart" }, // Only for Dart files
      new FlutterAgentCodeActionProvider(),
      {
        providedCodeActionKinds:
          FlutterAgentCodeActionProvider.providedCodeActionKinds,
      }
    )
  );
}

export function deactivate() {}
