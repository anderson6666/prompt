export interface ParsedFields {
  task_type: string | null;
  role: string | null;
  goal: string | null;
  audience: string | null;
  tone: string | null;
  output_format: string | null;
  constraints: string[] | null;
  examples_needed: boolean | null;
}

export interface ClarificationQuestion {
  field: string;
  question: string;
}

export interface PromptScore {
  clarity: number;
  completeness: number;
  executability: number;
  format: number;
  safety: number;
}

export interface GeneratedPrompt {
  id: string;
  timestamp: number;
  originalInput: string;
  parsedFields: ParsedFields;
  clarificationQuestions: ClarificationQuestion[];
  finalPrompt: string;
  scores: PromptScore;
  passed: boolean;
}

export interface AgnesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgnesRequest {
  model?: string;
  messages: AgnesMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface AgnesResponse {
  choices: Array<{
    message: AgnesMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type GenerationStep = 'input' | 'parsing' | 'clarification' | 'generating' | 'scoring' | 'complete';