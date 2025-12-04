import { LLMProvider as ILLMProvider, MemoryItem } from '../types/index.js';

export class LocalLLMProvider implements ILLMProvider {
  async generateSuggestions(prompt: string, history: MemoryItem[]): Promise<string[]> {
    // Simulate LLM processing with local fuzzy search
    if (!prompt.trim()) {
      return history.slice(0, 5).map(item => item.value);
    }

    // Simple fuzzy matching for demo purposes
    const suggestions = history
      .filter(item => this.fuzzyMatch(item.value, prompt))
      .slice(0, 5)
      .map(item => item.value);

    return suggestions;
  }

  async searchHistory(query: string, history: MemoryItem[]): Promise<MemoryItem[]> {
    if (!query.trim()) return history;

    return history.filter(item => 
      this.fuzzyMatch(item.value, query) ||
      (item.metadata && Object.values(item.metadata).some(val => 
        this.fuzzyMatch(String(val), query)
      ))
    );
  }

  private fuzzyMatch(text: string, query: string): boolean {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Simple fuzzy matching - check if all query characters appear in order
    let queryIndex = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        queryIndex++;
      }
    }
    
    return queryIndex === queryLower.length;
  }
}

export class OpenAIProvider implements ILLMProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generateSuggestions(prompt: string, history: MemoryItem[]): Promise<string[]> {
    try {
      const context = history.slice(0, 10).map(item => item.value).join('\n');
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant that suggests relevant text completions based on user input and history. 
              History: ${context}
              Provide 3-5 relevant suggestions based on the user's prompt. Return only the suggestions, one per line.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 100,
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      return data.choices[0]?.message?.content?.split('\n').filter((s: string) => s.trim()) || [];
    } catch (error) {
      console.error('OpenAI API error:', error);
      return [];
    }
  }

  async searchHistory(query: string, history: MemoryItem[]): Promise<MemoryItem[]> {
    // For now, use local fuzzy search as fallback
    const localProvider = new LocalLLMProvider();
    return localProvider.searchHistory(query, history);
  }
}

export class AnthropicProvider implements ILLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateSuggestions(prompt: string, history: MemoryItem[]): Promise<string[]> {
    try {
      const context = history.slice(0, 10).map(item => item.value).join('\n');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: `Based on this history: ${context}\n\nProvide 3-5 relevant text suggestions for: "${prompt}"`
            }
          ],
        }),
      });

      const data = await response.json();
      return data.content[0]?.text?.split('\n').filter((s: string) => s.trim()) || [];
    } catch (error) {
      console.error('Anthropic API error:', error);
      return [];
    }
  }

  async searchHistory(query: string, history: MemoryItem[]): Promise<MemoryItem[]> {
    const localProvider = new LocalLLMProvider();
    return localProvider.searchHistory(query, history);
  }
}
