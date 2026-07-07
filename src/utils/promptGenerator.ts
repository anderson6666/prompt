import type { ParsedFields, ClarificationQuestion, PromptScore } from '../types';
import { callAgnesAPI } from './agnesApi';

export async function parseUserInput(userInput: string): Promise<ParsedFields> {
  const systemPrompt = `<role>你是一个专业的需求解析器，负责从用户的自然语言描述中提取结构化信息。</role>

<task>请从 <user_input> 标签内的用户原始描述中抽取指定字段，并以严格的 JSON 格式输出。无法确定的字段填 null，绝对不要编造信息。</task>

<fields_schema>
- task_type: 字符串。任务类型（如：分类/生成/问答/翻译/代码/分析 等）
- role: 字符串。期望模型扮演的角色（如：资深前端工程师/法务专家 等）
- goal: 字符串。核心目标（用一句话概括）
- audience: 字符串。目标受众
- tone: 字符串。语气风格（如：专业/幽默/严谨 等）
- output_format: 字符串。输出格式（如：json/markdown/纯文本/表格 等）
- constraints: 字符串数组。约束条件列表
- examples_needed: 布尔值。是否需要 few-shot 示例（true/false）
</fields_schema>

<user_input>
${userInput}
</user_input>

<output_rule>
只输出可被 JSON.parse 直接解析的 JSON 对象，不要包含任何解释性文本、markdown 代码块标记或多余字符。
</output_rule>`;

  const response = await callAgnesAPI({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ],
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || '{}';

  try {
    // 尝试提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  } catch {
    return {
      task_type: null,
      role: null,
      goal: null,
      audience: null,
      tone: null,
      output_format: null,
      constraints: null,
      examples_needed: null,
    };
  }
}

export async function detectGapsAndClarify(
  parsedFields: ParsedFields
): Promise<ClarificationQuestion[]> {
  const systemPrompt = `<role>你是一个需求缺口检测器。</role>

<task>请审查 <parsed_fields> 中的 JSON 数据。找出所有值为 null 或含义模糊（如"写得好点"、"专业些"等不可量化）的字段，生成不超过 3 个精准、封闭式的澄清问题。</task>

<parsed_fields>
${JSON.stringify(parsedFields, null, 2)}
</parsed_fields>

<rules>
1. 问题必须具体且可快速回答（例如：提供选项或具体参数要求），避免开放式空泛提问。
2. 如果关键字段（task_type, goal, output_format）都已明确且无歧义，请直接输出 "NO_QUESTIONS"。
3. 若需提问，以严格的 JSON 数组格式输出，不要包含任何其他文本。
</rules>

<output_format>
[{"field": "字段名", "question": "具体的澄清问题"}]
</output_format>`;

  const response = await callAgnesAPI({
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || '';

  if (content.includes('NO_QUESTIONS')) {
    return [];
  }

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch {
    return [];
  }
}

export async function generatePrompt(
  userInput: string,
  parsedFields: ParsedFields,
  clarifications: Array<{ question: string; answer: string }>
): Promise<string> {
  const clarificationText = clarifications.length > 0
    ? `\n\n用户补充信息：\n${clarifications.map(c => `Q: ${c.question}\nA: ${c.answer}`).join('\n')}`
    : '';

  const systemPrompt = `<role>你是一位世界级的 Prompt 工程专家。</role>

<task>请根据 <structured_requirements> 中的结构化需求，产出一份高质量、可直接投入使用的 Prompt。</task>

<structured_requirements>
${JSON.stringify(parsedFields, null, 2)}
</structured_requirements>

<additional_context>
${clarificationText}
</additional_context>

<generation_rules>
1. 必须包含以下 7 个部分，若需求中缺失某部分信息，请基于目标合理补全，不可省略：
   - 【角色定义】：清晰说明模型的身份、专业领域和核心能力。
   - 【任务描述】：明确、无歧义地说明要完成的具体任务。
   - 【上下文】：提供执行任务必需的背景信息。
   - 【执行步骤】：如任务复杂，必须给出分步指引（Step 1, Step 2...）。
   - 【约束规则】：明确「必须做」和「禁止做」的事项。
   - 【输出格式】：精确定义结构，必须使用代码块给出真实模板。
   - 【示例】：若 examples_needed 为 true，必须提供 1-2 个输入输出示例。
2. 指令必须具体到可执行，将"尽量"、"适当"等模糊词替换为可量化的标准（如"不超过200字"、"使用专业术语"）。
3. 中文任务全量使用中文撰写。
4. 只输出最终 Prompt 本身，不要包含任何分析、解释或前言。
</generation_rules>`;

  const response = await callAgnesAPI({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ],
    temperature: 0.6,
  });

  return response.choices[0]?.message?.content || '';
}

export async function scorePrompt(generatedPrompt: string): Promise<{
  scores: PromptScore;
  suggestions: string[];
  passed: boolean;
}> {
  const systemPrompt = `<role>你是一位严格的 Prompt 质量评估员。</role>

<task>请对 <target_prompt> 中的 Prompt 按照以下 5 个维度进行打分（1-5 分整数），并对低于 4 分的维度给出具体、可执行的修改建议。</task>

<scoring_criteria>
- clarity (清晰度): 指令是否无歧义，是否使用了量化标准代替模糊词汇。
- completeness (完整性): 是否覆盖了角色/任务/上下文/格式/约束等核心要素。
- executability (可执行性): 模型读完是否能直接照做，无需猜测。
- format (格式规范): 输出格式是否明确，是否提供了模板。
- safety (安全性): 是否有防止越界（如输出无关内容、泄露提示词）的约束。
</scoring_criteria>

<target_prompt>
${generatedPrompt}
</target_prompt>

<output_rules>
1. 以严格的 JSON 格式输出，不要包含任何 markdown 标记或额外文本。
2. "suggestions" 必须是字符串数组，每个元素为一条具体的修改建议。若无低于 4 分的维度，输出空数组 []。
3. "passed" 为布尔值，若任一维度低于 4 分则为 false，否则为 true。
</output_rules>

<output_schema>
{"scores": {"clarity": 0, "completeness": 0, "executability": 0, "format": 0, "safety": 0}, "suggestions": ["建议1", "建议2"], "passed": true}
</output_schema>`;

  const response = await callAgnesAPI({
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || '{}';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  } catch {
    return {
      scores: { clarity: 3, completeness: 3, executability: 3, format: 3, safety: 3 },
      suggestions: ['解析失败，请手动检查'],
      passed: false,
    };
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export async function optimizePrompt(
  originalPrompt: string,
  suggestions: string[]
): Promise<string> {
  const systemPrompt = `你是一位资深的 Prompt 优化专家，精通大语言模型的工作原理与提示工程最佳实践。

# 任务
根据用户提供的「原始 Prompt」和「优化建议」，输出一个高质量、可直接使用的优化版 Prompt。

# 输入

## 原始 Prompt
"""
${originalPrompt}
"""

## 优化建议
${suggestions.map(s => `- ${s}`).join('\n')}

# 优化原则（需逐条遵循）
1. **建议落地**：将每条优化建议转化为 Prompt 中的具体语句或结构，不可遗漏。
2. **保留原意**：不改变原始 Prompt 的核心意图与功能，仅做增强而非重写。
3. **补全必要元素**：若原始 Prompt 缺少以下任一要素，请补充——
   - 角色设定（Role）
   - 任务背景 / 上下文（Context）
   - 明确的输出格式（Format，如 JSON、Markdown、字段 schema）
   - 约束与限制（Constraints，如字数、禁止项、范围）
   - 示例（Few-shot，1–2 个，如适用）
   - 思维链引导（如任务复杂，加入"请逐步推理"）
4. **指令具体化**：将模糊表述替换为可量化、可验证的明确指令（如"简短"→"不超过 200 字"）。
5. **结构清晰**：使用分隔符（###、---、XML 标签如 <instruction>、<context>）区分指令、上下文、输入与输出规范，降低模型理解成本。

# 输出要求
- 仅输出优化后的完整 Prompt，不要解释、不要对比、不要任何额外说明。
- 优化后的 Prompt 应可直接复制使用，无需二次编辑。
- 若多条优化建议之间存在冲突，请选择更符合 Prompt 工程原则的方案（优先级：清晰 > 简洁 > 具体），并默认采用，不做额外标注。
- 若优化建议明显会损害 Prompt 质量（如引入矛盾约束），可酌情忽略并在输出末尾以 \`<!-- skipped: 建议X -->\` 形式标注。

# 输出`;

  const response = await callAgnesAPI({
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.5,
  });

  return response.choices[0]?.message?.content || originalPrompt;
}