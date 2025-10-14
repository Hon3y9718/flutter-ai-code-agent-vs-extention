import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new OpenAI({
  apiKey: "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",
});

export async function askLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return completion.choices[0].message?.content || 'No response from LLM.';
  } catch (err: any) {
    return 'Error: ' + err.message;
  }
}
