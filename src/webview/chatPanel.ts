import * as vscode from "vscode";
import { askLLM } from "../llmService";
import { applyDiffPatch } from "../patcher";
import { buildContext } from '../contextManager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public setChatContext(selectedCode: string) {
    if (this._view) {
      this._view.show?.(true); // Bring the chat view into focus
      this._view.webview.postMessage({
        command: "setContext",
        text: selectedCode,
      });
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "ask") {
        const question = message.text;
        const selectionContext = message.context; // Get context from the UI

        if (!question) {
          return;
        }

        this._view?.webview.postMessage({ command: "showLoading" });


        const semanticContext = await buildContext();
        let finalUserPrompt = `Context:${semanticContext}\n\nUser Question: ${question}`;
        // If there's selected code, prepend it to the prompt
        if (selectionContext) {
          finalUserPrompt = `Given this selected code snippet:\n\`\`\`dart\n${selectionContext}\n\`\`\`\n\n${finalUserPrompt}`;
        } else {
            // 👇 If no selection, use the new vectorDB context builder
            const semanticContext = await buildContext();
            finalUserPrompt = `${semanticContext}\n\nUser Question: ${question}`;
        }

        const answer = await askLLM(
            this.context,
          `You are a senior Flutter/Dart developer and AI assistant. 
  Your response MUST be in a JSON format with the following keys: "explanation", "code", and "diff".

  1.  "explanation": A conversational, helpful explanation in markdown.
  2.  "code": If you are providing code, this should be the complete, clean code snippet formatted for display.
  3.  "diff": If the code is a change, this should be the patch in the unified diff format, including the filename attribute.

  - If the user's query doesn't require code, "code" and "diff" MUST be null.
  - If you are providing new code (not a change), "diff" MUST be null.
  
  Example Response:
  {
    "explanation": "Of course! Here is a more efficient way to write that widget. I've used a 'const' constructor to improve performance.",
    "code": "\`\`\`dart\\n// a clean code block\\n\`\`\`",
    "diff": "\`\`\`diff filename=\\"lib/main.dart\\"\\n--- a/lib/main.dart\\n+++ b/lib/main.dart\\n@@ ... @@\\n- old code\\n+ new code\\n\`\`\`"
  }`,
          finalUserPrompt
        );

        try {
          // The LLM's raw response is a JSON string, so we parse it.
          const structuredResponse = JSON.parse(answer);
          this._view?.webview.postMessage({
            command: "response",
            data: structuredResponse,
          });
        } catch (e) {
          // If the LLM fails to return valid JSON, we fall back to displaying the raw text.
          console.error("Failed to parse LLM response as JSON:", answer);
          this._view?.webview.postMessage({
            command: "response",
            data: { explanation: answer, code: null, diff: null },
          });
        }

        this._view?.webview.postMessage({ command: "response", text: answer });
      } else if (message.command === "applyPatch") {
        const { filename, diff } = message;
        const files = await vscode.workspace.findFiles(
          filename,
          "**/node_modules/**",
          1
        );
        if (files.length > 0) {
          const fileUri = files[0];
          try {
            await applyDiffPatch(fileUri, diff);
            vscode.window.showInformationMessage(
              `Applied patch to ${filename}`
            );
          } catch (e) {
            console.error(e);
            vscode.window.showErrorMessage(`Failed to apply patch: ${e}`);
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
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flutter Agent</title>
        <style>
          body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; }
          #context-container { padding: 8px 10px; border-bottom: 1px solid var(--vscode-sideBar-border); display: none; position: relative; }
          #context-container h4 { margin: 0 0 5px 0; font-size: 0.9em; }
          #context-code { background-color: var(--vscode-textCodeBlock-background); border-radius: 4px; padding: 5px 8px; max-height: 100px; overflow-y: auto; font-family: var(--vscode-editor-font-family); font-size: 0.85em; white-space: pre-wrap; word-wrap: break-word; }
          #clear-context-btn { position: absolute; top: 5px; right: 10px; background: none; border: none; color: var(--vscode-editor-foreground); cursor: pointer; font-size: 1.2em; }
          #chat-history { flex: 1; overflow-y: auto; padding: 10px; }
          .message { display: flex; margin-bottom: 12px; }
          .message-content { padding: 8px 12px; border-radius: 12px; max-width: 90%; white-space: pre-wrap; word-wrap: break-word; }
          .user-message { justify-content: flex-end; }
          .user-message .message-content { background-color: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
          .bot-message { justify-content: flex-start; }
          .bot-message .message-content { background-color: var(--vscode-editorWidget-background); }
          .bot-message.loading .message-content { font-style: italic; }
          .code-block-wrapper { position: relative; background-color: var(--vscode-textCodeBlock-background); border-radius: 8px; margin: 10px 0; }
          .code-block-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background-color: var(--vscode-peekViewTitle-background); border-top-left-radius: 8px; border-top-right-radius: 8px; }
          .code-block-header .filename { font-size: 0.8em; }
          .code-block-header .buttons button { background: none; border: none; color: var(--vscode-editor-foreground); cursor: pointer; font-size: 0.9em; padding: 2px 6px; }
          .code-block-header .buttons button:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
          pre { margin: 0; padding: 10px; white-space: pre-wrap; }
          .input-container { display: flex; align-items: center; padding: 10px; border-top: 1px solid var(--vscode-sideBar-border); }
          textarea { flex: 1; resize: none; padding: 8px; font-family: var(--vscode-font-family); background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 6px; }
          button { margin-left: 10px; padding: 8px 12px; border: none; border-radius: 6px; cursor: pointer; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); }
          button:hover { background-color: var(--vscode-button-hoverBackground); }
        </style>
      </head>
      <body>
        <div id="context-container">
          <button id="clear-context-btn" title="Clear context">&times;</button>
          <h4>Talking about:</h4>
          <div id="context-code"></div>
        </div>
        <div id="chat-history"></div>
        <div class="input-container">
          <textarea id="question" placeholder="Ask about your Flutter project..." rows="1"></textarea>
          <button id="send">Send</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          const chatHistory = document.getElementById('chat-history');
          const questionInput = document.getElementById('question');
          const sendButton = document.getElementById('send');
          const contextContainer = document.getElementById('context-container');
          const contextCode = document.getElementById('context-code');
          const clearContextBtn = document.getElementById('clear-context-btn');
          let currentSelectionContext = '';

          function addMessage(type, data) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type + '-message';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            let html = data.explanation || '';
            if (data.code) {
              const id = 'code-' + Math.random().toString(36).substr(2, 9);
              const diffMatch = data.diff ? data.diff.match(/filename="([^"]+)"/) : null;
              const filename = diffMatch ? diffMatch[1] : '';
              const cleanCode = data.code.replace(/^\`\`\`dart\\n/, '').replace(/\\n\`\`\`$/, '');
              const diffAttribute = data.diff ? \`data-diff="\${encodeURIComponent(data.diff)}"\` : '';
              html += \`
                <div class="code-block-wrapper">
                  <div class="code-block-header">
                    <span class="filename">\${filename}</span>
                    <div class="buttons">
                      <button class="copy-btn" data-target="\${id}">Copy</button>
                      \${(data.diff && filename && !currentContext) ? \`<button class="apply-btn" data-filename="\${filename}" \${diffAttribute}>Apply Patch</button>\` : ''}
                    </div>
                  </div>
                  <pre><code id="\${id}" class="language-dart">\${cleanCode.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
                </div>
              \`;
            }
            contentDiv.innerHTML = html;
            messageDiv.appendChild(contentDiv);
            chatHistory.appendChild(messageDiv);
            chatHistory.scrollTop = chatHistory.scrollHeight;
          }

          chatHistory.addEventListener('click', e => {
            const target = e.target;
            if (target.classList.contains('copy-btn')) {
              const codeEl = document.getElementById(target.dataset.target);
              navigator.clipboard.writeText(codeEl.textContent).then(() => {
                target.textContent = 'Copied!';
                setTimeout(() => target.textContent = 'Copy', 2000);
              });
            }
            if (target.classList.contains('apply-btn')) {
              const diffContent = decodeURIComponent(target.dataset.diff);
              const filename = target.dataset.filename;
              vscode.postMessage({
                command: 'applyPatch',
                filename: filename,
                diff: diffContent
              });
            }
          });

          window.addEventListener('message', e => {
            const { command, data, text } = e.data;
            if (command === 'response') {
              const loading = document.querySelector('.loading');
              if (loading) loading.remove();
              addMessage('bot', data);
            } else if (command === 'setContext') {
              currentSelectionContext = text;
              contextCode.textContent = text;
              contextContainer.style.display = 'block';
              questionInput.placeholder = 'Ask about the selected code...';
            } else if (command === 'showLoading') {
              addMessage('bot loading', { explanation: 'Thinking...' });
            }
          });

          function sendMessage() {
            const text = questionInput.value.trim();
            if (text) {
              addMessage('user', { explanation: text });
              vscode.postMessage({
                command: 'ask',
                text: text,
                context: currentSelectionContext
              });
              questionInput.value = '';
            }
          }

          clearContextBtn.addEventListener('click', () => {
            currentSelectionContext = '';
            contextContainer.style.display = 'none';
            questionInput.placeholder = 'Ask about your Flutter project...';
          });

          sendButton.addEventListener('click', sendMessage);
          
          questionInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
