import * as vscode from 'vscode';
import OpenAI from 'openai';
import { ApiKeyManager } from './apiKeyManager';

// The function now needs the extension context to access secrets
export async function askLLM(
    context: vscode.ExtensionContext, 
    systemPrompt: string, 
    userPrompt: string
): Promise<string> {

    // 1. Get the API key securely
    const apiKey = await ApiKeyManager.getApiKey(context);
    if (!apiKey) {
        return '{"explanation": "API Key not configured. Please run the `Flutter Agent: Set OpenAI API Key` command.", "code": null, "diff": null}';
    }

    // 2. Use the key to initialize the client
    const client = new OpenAI({ apiKey });

    try {
        const res = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: "json_object" }, // Ensure JSON output
        });
        return res.choices[0].message?.content || '';
    } catch (error: any) {
        console.error("Error calling OpenAI:", error);
        vscode.window.showErrorMessage(`Error communicating with OpenAI: ${error.message}`);
        return `{"explanation": "Error: ${error.message}", "code": null, "diff": null}`;
    }
}