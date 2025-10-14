import * as vscode from "vscode";
import { askLLM } from "./llmService";

export class FlutterAgentHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // Get the word or symbol under the cursor
    const range = document.getWordRangeAtPosition(position);
    if (!range) {
      return null;
    }
    const symbol = document.getText(range);

    // Get the surrounding code for context. We'll grab 50 lines above and below.
    const startLine = Math.max(position.line - 50, 0);
    const endLine = Math.min(position.line + 50, document.lineCount - 1);
    const contextRange = new vscode.Range(startLine, 0, endLine, 0);
    const codeContext = document.getText(contextRange);

    // Formulate a prompt for the LLM
    const systemPrompt = `You are a Flutter/Dart code analysis expert. 
    Explain the following Dart symbol in a concise and helpful manner. 
    Format your response using markdown.`;
    const userPrompt = `Within this code context:\n\`\`\`dart\n${codeContext}\n\`\`\`\n\nExplain what the symbol "${symbol}" is and what it does.`;

    try {
      const explanation = await askLLM(systemPrompt, userPrompt);
      if (token.isCancellationRequested) {
        return null;
      }

      if (explanation) {
        const markdownString = new vscode.MarkdownString(explanation);
        markdownString.supportHtml = true; // Allows for richer formatting if needed
        return new vscode.Hover(markdownString);
      }
    } catch (e) {
      console.error("Hover provider error:", e);
    }

    return null;
  }
}
