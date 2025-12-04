import { LLMProvider, MemoryItem } from '../types/index.js';

export class EdgeLLMProvider implements LLMProvider {
  private pipeline: any = null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializeModel();
  }

  private async initializeModel(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.loadModel();
    return this.initializationPromise;
  }

  private async loadModel(): Promise<void> {
    try {
      // For now, we'll use a rule-based approach without external dependencies
      // This provides instant responses for common questions and math
      console.log('🤖 Initializing edge LLM (rule-based mode)...');
      
      // Simulate model loading for consistency
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.isInitialized = true;
      console.log('✅ Edge LLM initialized successfully (rule-based mode)');
    } catch (error) {
      console.warn('Failed to initialize edge LLM, falling back to local search:', error);
      this.isInitialized = false;
    }
  }

  async generateSuggestions(prompt: string, history: MemoryItem[]): Promise<string[]> {
    // Wait for model initialization
    if (!this.isInitialized) {
      await this.initializeModel();
    }

    // Check if this is a question that needs answering
    if (this.isQuestion(prompt)) {
      const answer = await this.answerQuestion(prompt);
      if (answer) {
        return [answer];
      }
    }

    // For non-questions, use enhanced local search
    return this.enhancedLocalSearch(prompt, history);
  }

  async searchHistory(query: string, history: MemoryItem[]): Promise<MemoryItem[]> {
    // For search, we use enhanced local search with semantic similarity
    return this.enhancedLocalSearch(query, history).map(suggestion => ({
      id: Math.random().toString(36).substr(2, 9),
      value: suggestion,
      timestamp: Date.now(),
      metadata: { source: 'edge-llm' }
    }));
  }



  private enhancedLocalSearch(query: string, history: MemoryItem[]): string[] {
    if (!query.trim()) {
      return history.slice(0, 5).map(item => item.value);
    }

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    // Enhanced scoring algorithm
    const scoredItems = history.map(item => {
      const valueLower = item.value.toLowerCase();
      let score = 0;

      // Exact match gets highest score
      if (valueLower.includes(queryLower)) {
        score += 100;
      }

      // Word-based matching
      queryWords.forEach(word => {
        if (valueLower.includes(word)) {
          score += 20;
        }
      });

      // Fuzzy matching for partial words
      queryWords.forEach(word => {
        if (word.length > 2) {
          const partialMatches = valueLower.match(new RegExp(word.substring(0, 3), 'g'));
          if (partialMatches) {
            score += partialMatches.length * 5;
          }
        }
      });

      // Boost recent items
      const age = Date.now() - item.timestamp;
      const ageScore = Math.max(0, 10 - Math.floor(age / (1000 * 60 * 60 * 24))); // Boost items from last 10 days
      score += ageScore;

      return { item, score };
    });

    // Sort by score and return top suggestions
    return scoredItems
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ item }) => item.value);
  }

  // Method to check if the model is ready
  public isReady(): boolean {
    return this.isInitialized;
  }

  // Method to get model info
  public getModelInfo(): { name: string; size: string; ready: boolean } {
    return {
      name: 'rule-based-llm',
      size: '~0MB (rule-based)',
      ready: this.isReady()
    };
  }

  // Detect if the input is a question
  private isQuestion(text: string): boolean {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'is', 'are', 'can', 'could', 'would', 'should', 'will', 'do', 'does', 'did'];
    const textLower = text.toLowerCase().trim();
    
    // Check if it ends with a question mark
    if (textLower.endsWith('?')) {
      return true;
    }
    
    // Check for math expressions (symbols and words)
    if (/^\d+\s*[+\-*/]\s*\d+/.test(textLower)) {
      return true;
    }
    
    // Check for word-based math expressions
    if (/\d+\s+(plus|minus|times|divided\s+by)\s+\d+/i.test(textLower)) {
      return true;
    }
    
    // Check for "what is X plus Y" patterns
    if (/what\s+is\s+\d+\s+(plus|minus|times|divided\s+by)\s+\d+/i.test(textLower)) {
      return true;
    }
    
    // Check if it starts with a question word (but be more specific)
    if (questionWords.some(word => textLower.startsWith(word + ' '))) {
      return true;
    }
    
    // Check for common greeting patterns
    const greetings = ['hello', 'hi', 'hey', 'thanks', 'thank you'];
    if (greetings.some(greeting => textLower === greeting || textLower.startsWith(greeting + ' '))) {
      return true;
    }
    
    return false;
  }

  // Answer questions using rule-based logic
  private async answerQuestion(question: string): Promise<string | null> {
    const questionLower = question.toLowerCase().trim();
    
    // Handle math questions
    const mathAnswer = this.answerMathQuestion(questionLower);
    if (mathAnswer) {
      return mathAnswer;
    }
    
    // Handle common questions
    const commonAnswer = this.answerCommonQuestion(questionLower);
    if (commonAnswer) {
      return commonAnswer;
    }
    
    // For complex questions, provide a helpful response
    return "I can help with basic math, common questions, and text suggestions. Try asking something like 'What is your name?' or '1 + 1'";
  }

  // Handle basic math questions
  private answerMathQuestion(question: string): string | null {
    // Simple math patterns with symbols
    const symbolPatterns = [
      { pattern: /(\d+)\s*\+\s*(\d+)/, operation: (a: number, b: number) => a + b, symbol: '+' },
      { pattern: /(\d+)\s*-\s*(\d+)/, operation: (a: number, b: number) => a - b, symbol: '-' },
      { pattern: /(\d+)\s*\*\s*(\d+)/, operation: (a: number, b: number) => a * b, symbol: '×' },
      { pattern: /(\d+)\s*\/\s*(\d+)/, operation: (a: number, b: number) => a / b, symbol: '÷' },
      { pattern: /(\d+)\s*x\s*(\d+)/, operation: (a: number, b: number) => a * b, symbol: '×' },
    ];
    
    // Word-based math patterns
    const wordPatterns = [
      { pattern: /(\d+)\s+plus\s+(\d+)/i, operation: (a: number, b: number) => a + b, symbol: '+' },
      { pattern: /(\d+)\s+minus\s+(\d+)/i, operation: (a: number, b: number) => a - b, symbol: '-' },
      { pattern: /(\d+)\s+times\s+(\d+)/i, operation: (a: number, b: number) => a * b, symbol: '×' },
      { pattern: /(\d+)\s+divided\s+by\s+(\d+)/i, operation: (a: number, b: number) => a / b, symbol: '÷' },
      { pattern: /what\s+is\s+(\d+)\s+plus\s+(\d+)/i, operation: (a: number, b: number) => a + b, symbol: '+' },
      { pattern: /what\s+is\s+(\d+)\s+minus\s+(\d+)/i, operation: (a: number, b: number) => a - b, symbol: '-' },
      { pattern: /what\s+is\s+(\d+)\s+times\s+(\d+)/i, operation: (a: number, b: number) => a * b, symbol: '×' },
      { pattern: /what\s+is\s+(\d+)\s+divided\s+by\s+(\d+)/i, operation: (a: number, b: number) => a / b, symbol: '÷' },
    ];
    
    // Check symbol patterns first
    for (const { pattern, operation, symbol } of symbolPatterns) {
      const match = question.match(pattern);
      if (match) {
        const a = parseInt(match[1]);
        const b = parseInt(match[2]);
        const result = operation(a, b);
        return `${a} ${symbol} ${b} = ${result}`;
      }
    }
    
    // Check word patterns
    for (const { pattern, operation, symbol } of wordPatterns) {
      const match = question.match(pattern);
      if (match) {
        const a = parseInt(match[1]);
        const b = parseInt(match[2]);
        const result = operation(a, b);
        return `${a} ${symbol} ${b} = ${result}`;
      }
    }
    
    return null;
  }

  // Handle common questions
  private answerCommonQuestion(question: string): string | null {
    const commonAnswers: { [key: string]: string } = {
      'what is your name': 'I am Ronen, your smart field assistant!',
      'who are you': 'I am Ronen, an AI-powered smart field that helps you with suggestions and answers.',
      'what can you do': 'I can help you with text suggestions, answer questions, do basic math, and remember your input history.',
      'how are you': 'I am doing well, thank you for asking! How can I help you today?',
      'what time is it': `The current time is ${new Date().toLocaleTimeString()}.`,
      'what is today': `Today is ${new Date().toLocaleDateString()}.`,
      'hello': 'Hello! How can I help you today?',
      'hi': 'Hi there! What can I do for you?',
      'thanks': 'You\'re welcome! Happy to help.',
      'thank you': 'You\'re welcome! Is there anything else I can help you with?',
    };
    
    // Try exact match first
    if (commonAnswers[question]) {
      return commonAnswers[question];
    }
    
    // Try partial matches for common patterns
    for (const [key, answer] of Object.entries(commonAnswers)) {
      if (question.includes(key) || key.includes(question)) {
        return answer;
      }
    }
    
    return null;
  }


}
