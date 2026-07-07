import type { GeneratedPrompt } from '../types';

const STORAGE_KEY = 'prompt_generator_history';
const API_KEY_STORAGE = 'prompt_generator_api_key';

export function savePrompt(prompt: GeneratedPrompt): void {
  const history = getHistory();
  history.unshift(prompt);
  // 只保留最近 50 条记录
  if (history.length > 50) history.pop();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function getHistory(): GeneratedPrompt[] {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function deletePrompt(id: string): void {
  const history = getHistory();
  const filtered = history.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}