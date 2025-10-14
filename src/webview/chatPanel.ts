import * as vscode from "vscode";
import { askLLM } from "../llmService";
import { buildContext } from "../contextManager";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    // Allow scripts and access to local resources
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    // Set the HTML content
    webviewView.webview.html = this._getHtmlForWebview();

    // Handle messages from the webview
    // Inside the resolveWebviewView method...
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "ask") {
        const question = message.text;
        if (!question) {
          return;
        }

        this._view?.webview.postMessage({ command: "showLoading" });

        // --- THIS IS THE KEY CHANGE ---
        // Replace the old project file logic with the new context builder
        const relevantContext = await buildContext();

        const answer = await askLLM(
          `You are a Flutter expert specializing in GetX. 
            When you provide a full code file for a fix, you MUST wrap it in a markdown block with the language set to 'dart' and provide the relative file path in a 'filename' attribute.
            Example:
            \`\`\`dart filename="lib/views/home_view.dart"
            // ... your code here ...
            \`\`\``,
          // Use the new, focused context
          `Here is the relevant code context:\n${relevantContext}\n\nUser Question: ${question}`
        );
        // --- END OF CHANGE ---

        this._view?.webview.postMessage({ command: "response", text: answer });
      }

      if (message.command === "applyPatch") {
        const { filename, code } = message;
        // Find the file in the workspace
        const files = await vscode.workspace.findFiles(
          filename,
          "**/node_modules/**",
          1
        );
        if (files.length > 0) {
          const fileUri = files[0];

          const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to overwrite the contents of ${filename}?`,
            { modal: true },
            "Yes"
          );

          if (confirm === "Yes") {
            const edit = new vscode.WorkspaceEdit();
            // Create a range that covers the entire document
            const document = await vscode.workspace.openTextDocument(fileUri);
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            );
            edit.replace(fileUri, fullRange, code);
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage(
              `Applied patch to ${filename}`
            );
          }
        } else {
          vscode.window.showErrorMessage(`Could not find file: ${filename}`);
        }
      }
    });
  }

  private _getHtmlForWebview() {
    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flutter Agent</title>
        <style>
          /* --- Existing Body, Layout, and Message Styles --- */
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh;
          }
          #chat-history { flex: 1; overflow-y: auto; padding: 10px; }
          .message { display: flex; margin-bottom: 12px; }
          .message-content { padding: 8px 12px; border-radius: 12px; max-width: 90%; white-space: pre-wrap; word-wrap: break-word; }
          .user-message { justify-content: flex-end; }
          .user-message .message-content { background-color: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
          .bot-message { justify-content: flex-start; }
          .bot-message .message-content { background-color: var(--vscode-editorWidget-background); }
          .bot-message.loading .message-content { font-style: italic; }

          /* --- NEW Styles for Code Blocks & Buttons --- */
          .code-block-wrapper {
            position: relative;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 8px;
            margin: 10px 0;
          }
          .code-block-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 8px;
            background-color: var(--vscode-peekViewTitle-background);
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
          }
          .code-block-header .filename {
            font-size: 0.8em;
            font-family: var(--vscode-font-family);
          }
          .code-block-header .buttons button {
            background: none;
            border: none;
            color: var(--vscode-editor-foreground);
            cursor: pointer;
            font-size: 0.9em;
            padding: 2px 6px;
          }
          .code-block-header .buttons button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          pre { margin: 0; padding: 10px; white-space: pre-wrap; }

          /* --- Input Area Styles --- */
          .input-container { display: flex; align-items: center; padding: 10px; border-top: 1px solid var(--vscode-sideBar-border); }
          textarea { flex: 1; resize: none; padding: 8px; font-family: var(--vscode-font-family); background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; }
          button { margin-left: 10px; padding: 8px 12px; font-family: var(--vscode-font-family); background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; }
          button:hover { background-color: var(--vscode-button-hoverBackground); }
        </style>
      </head>
      <body>
        <div id="chat-history"></div>
        <div class="input-container">
          <textarea id="question" placeholder="Ask about your Flutter project..." rows="1"></textarea>
          <button id="send">Send</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const chatHistory = document.getElementById('chat-history');

          // --- NEW: Function to render a code block with buttons ---
          function renderCodeBlock(code, lang, filename) {
            const id = 'code-' + Math.random().toString(36).substr(2, 9);
            return \`
              <div class="code-block-wrapper">
                <div class="code-block-header">
                  <span class="filename">\${filename || ''}</span>
                  <div class="buttons">
                    <button class="copy-btn" data-target="\${id}">Copy</button>
                    \${filename ? \`<button class="apply-btn" data-target="\${id}" data-filename="\${filename}">Apply Patch</button>\` : ''}
                  </div>
                </div>
                <pre><code id="\${id}" class="language-\${lang}">\${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
              </div>
            \`;
          }

          // --- MODIFIED: addMessage now looks for code blocks ---
          function addMessage(type, text) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type + '-message';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            // Regex to find our special code blocks
            const codeBlockRegex = /\\\`\\\`\\\`dart filename="([^"]+)"([\\s\\S]*?)\\\`\\\`\\\`/g;
            let lastIndex = 0;
            let renderedHtml = '';

            let match;
            while ((match = codeBlockRegex.exec(text)) !== null) {
              // Add text before the code block
              renderedHtml += text.slice(lastIndex, match.index).replace(/</g, "&lt;").replace(/>/g, "&gt;");
              // Render the code block
              const [_, filename, code] = match;
              renderedHtml += renderCodeBlock(code.trim(), 'dart', filename);
              lastIndex = match.index + match[0].length;
            }
            // Add any remaining text
            renderedHtml += text.slice(lastIndex).replace(/</g, "&lt;").replace(/>/g, "&gt;");

            contentDiv.innerHTML = renderedHtml || text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            messageDiv.appendChild(contentDiv);
            chatHistory.appendChild(messageDiv);
            chatHistory.scrollTop = chatHistory.scrollHeight;
            return messageDiv;
          }
          
          // --- NEW: Event listeners for the new buttons ---
          chatHistory.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('copy-btn')) {
              const codeElement = document.getElementById(target.dataset.target);
              navigator.clipboard.writeText(codeElement.textContent).then(() => {
                target.textContent = 'Copied!';
                setTimeout(() => target.textContent = 'Copy', 2000);
              });
            }
            if (target.classList.contains('apply-btn')) {
              const codeElement = document.getElementById(target.dataset.target);
              const filename = target.dataset.filename;
              vscode.postMessage({
                command: 'applyPatch',
                filename: filename,
                code: codeElement.textContent
              });
            }
          });

          // --- Existing script for sending messages and handling responses ---
          const sendButton = document.getElementById('send');
          const questionInput = document.getElementById('question');
          function sendMessage() {
            const text = questionInput.value.trim();
            if (text) {
                addMessage('user', text);
                vscode.postMessage({ command: 'ask', text });
                questionInput.value = '';
                questionInput.focus();
            }
            }
          sendButton.addEventListener('click', sendMessage);
          questionInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
          window.addEventListener('message', event => {
            const { command, text } = event.data;
            if (command === 'response') {
              const loadingMessage = document.querySelector('.loading');
              if (loadingMessage) loadingMessage.remove();
              addMessage('bot', text);
            } else if (command === 'showLoading') {
              addMessage('bot loading', 'Thinking...');
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
