import type { AgnesRequest, AgnesResponse } from '../types';

const AGNES_API_BASE = 'https://apihub.agnes-ai.com/v1';
const DEFAULT_MODEL = 'agnes-2.0-flash';

let apiKey: string = '';

export function setApiKey(key: string) {
  apiKey = key;
}

export function getApiKey(): string {
  return apiKey;
}

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    // 验证 API Key 格式（基本检查）
    if (!key || key.trim().length < 10) {
      throw new Error('API Key 格式不正确，请检查输入');
    }

    // 发送一个最简单的 chat completion 请求来验证 API Key
    const response = await fetch(`${AGNES_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key.trim()}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'validate' }],
        max_tokens: 1,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      // 根据不同的错误状态提供不同的提示
      if (response.status === 401) {
        throw new Error('API Key 无效或已过期，请检查是否正确');
      } else if (response.status === 404) {
        throw new Error('API endpoint 不存在，请检查网络或联系客服');
      } else if (response.status === 403) {
        throw new Error('API Key 权限不足，请检查账户权限');
      } else if (response.status === 500 || response.status === 503) {
        throw new Error('服务器暂时不可用，请稍后重试');
      } else {
        const errorData = await response.text();
        try {
          const parsed = JSON.parse(errorData);
          throw new Error(parsed.error?.message || `验证失败 (${response.status})`);
        } catch {
          throw new Error(`验证失败，请检查 API Key (${response.status})`);
        }
      }
    }

    // 验证成功，设置 API Key
    apiKey = key.trim();
    return true;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('网络连接失败，请检查网络设置');
    }
    throw error;
  }
}

export async function callAgnesAPI(request: AgnesRequest): Promise<AgnesResponse> {
  if (!apiKey) {
    throw new Error('请先配置 Agnes API Key');
  }

  const response = await fetch(`${AGNES_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model || DEFAULT_MODEL,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function streamAgnesAPI(
  request: AgnesRequest,
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!apiKey) {
    throw new Error('请先配置 Agnes API Key');
  }

  const response = await fetch(`${AGNES_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model || DEFAULT_MODEL,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 4096,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {
          // 忽略解析错误
        }
      }
    }
  }
}