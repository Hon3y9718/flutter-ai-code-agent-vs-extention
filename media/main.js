(function () {
    const vscode = acquireVsCodeApi();
    const md = window.markdownit();

    const chatContainer = document.getElementById('chat-container');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'addResponse': {
                const thinkingMessage = document.querySelector('.bot-message.thinking');
                if (thinkingMessage) {
                    // Overwrite the "Thinking..." message with the real response
                    thinkingMessage.innerHTML = `<div class="message-content">${md.render(message.value)}</div>`;
                    thinkingMessage.classList.remove('thinking');
                } else {
                    addMessage(message.value, 'bot');
                }
                // After adding the new content, tell highlight.js to re-scan the page
                hljs.highlightAll();
                break;
            }
        }
    });

    function sendMessage() {
        const text = promptInput.value.trim();
        if (text) {
            addMessage(text, 'user');
            vscode.postMessage({ type: 'sendMessage', value: text });
            
            // Add a "Thinking..." message immediately
            const thinkingDiv = document.createElement('div');
            thinkingDiv.className = 'message bot-message thinking';
            thinkingDiv.innerHTML = `<div class="message-content">Thinking...</div>`;
            chatContainer.appendChild(thinkingDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            promptInput.value = '';
            promptInput.focus();
        }
    }

    function addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (type === 'bot') {
            // Render bot messages as markdown
            contentDiv.innerHTML = md.render(text);
        } else {
            // Render user messages as plain text
            contentDiv.textContent = text;
        }

        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight; // Scroll to bottom
    }

    sendButton.addEventListener('click', sendMessage);

    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

}());