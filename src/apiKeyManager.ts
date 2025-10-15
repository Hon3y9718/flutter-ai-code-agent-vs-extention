import * as vscode from 'vscode';

const SECRET_KEY = 'flutterAgent.openaiApiKey';

export class ApiKeyManager {
    
    // Command to prompt the user to set their key.
    public static async setApiKey(context: vscode.ExtensionContext) {
        const newKey = await vscode.window.showInputBox({
            prompt: 'Please enter your OpenAI API Key',
            placeHolder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
            password: true, // Hides the typed characters
            ignoreFocusOut: true, // Prevents the box from closing on lost focus
        });

        if (newKey) {
            await context.secrets.store(SECRET_KEY, newKey);
            vscode.window.showInformationMessage('✅ OpenAI API Key stored successfully!');
        }
    }

    // Main function to get the key. It prompts if the key is not found.
    public static async getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
        let apiKey = await context.secrets.get(SECRET_KEY);

        if (!apiKey) {
            const action = await vscode.window.showWarningMessage(
                'OpenAI API Key not found. Please set it to use AI features.',
                'Set API Key'
            );
            if (action === 'Set API Key') {
                await this.setApiKey(context);
                apiKey = await context.secrets.get(SECRET_KEY);
            }
        }
        
        return apiKey;
    }
}