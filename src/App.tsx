import { useState, useEffect } from 'react';
import type { GenerationStep, ParsedFields, ClarificationQuestion, PromptScore, GeneratedPrompt } from './types';
import { setApiKey, validateApiKey } from './utils/agnesApi';
import { loadApiKey, saveApiKey, getHistory, savePrompt, deletePrompt } from './utils/storage';
import { parseUserInput, detectGapsAndClarify, generatePrompt, scorePrompt, generateId, optimizePrompt } from './utils/promptGenerator';

function App() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [currentStep, setCurrentStep] = useState<GenerationStep>('input');
  const [userInput, setUserInput] = useState('');
  const [parsedFields, setParsedFields] = useState<ParsedFields | null>(null);
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarificationAnswersArray, setClarificationAnswersArray] = useState<string[]>([]);
  const [generatedPromptText, setGeneratedPromptText] = useState('');
  const [promptScore, setPromptScore] = useState<{ scores: PromptScore; suggestions: string[]; passed: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [optimizingRound, setOptimizingRound] = useState(0);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<GeneratedPrompt[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // 为每个澄清问题创建独立的答案状态（使用数组，索引对应问题索引）
  const updateClarificationAnswer = (index: number, value: string) => {
    setClarificationAnswersArray(prev => {
      const newAnswers = [...prev];
      newAnswers[index] = value;
      return newAnswers;
    });
  };

  // 初始化答案数组
  useEffect(() => {
    if (clarificationQuestions.length > 0 && clarificationAnswersArray.length === 0) {
      setClarificationAnswersArray(new Array(clarificationQuestions.length).fill(''));
    }
  }, [clarificationQuestions]);

  useEffect(() => {
    // 如果有保存的 API Key，自动填充到输入框，但仍显示验证页面
    const savedKey = loadApiKey();
    if (savedKey) {
      setApiKeyInput(savedKey);
      setApiKey(savedKey);
    }
    setHistory(getHistory());
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setError('请输入 API Key');
      return;
    }

    setValidating(true);
    setError('');

    try {
      // 先验证 API Key
      await validateApiKey(apiKeyInput);
      // 验证成功后才保存
      saveApiKey(apiKeyInput);
      setApiKey(apiKeyInput);
      setIsConfigured(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 验证失败');
    } finally {
      setValidating(false);
    }
  };

  const handleStartGeneration = async () => {
    if (!userInput.trim()) {
      setError('请输入需求描述');
      return;
    }

    setLoading(true);
    setError('');
    setCurrentStep('parsing');

    try {
      // Step 1: 解析用户输入
      const parsed = await parseUserInput(userInput);
      setParsedFields(parsed);

      // Step 2: 检测缺口并生成澄清问题
      setCurrentStep('clarification');
      const questions = await detectGapsAndClarify(parsed);
      setClarificationQuestions(questions);

      if (questions.length === 0) {
        // 如果没有问题需要澄清,直接生成 prompt
        await handleGeneratePrompt(parsed, []);
      } else {
        setLoading(false);
        // 初始化答案数组
        setClarificationAnswersArray(new Array(questions.length).fill(''));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
      setLoading(false);
      setCurrentStep('input');
    }
  };

  const handleGeneratePrompt = async (parsed: ParsedFields | null, clarifications: Array<{ question: string; answer: string }>) => {
    setLoading(true);
    setCurrentStep('generating');
    setError('');
    setOptimizingRound(0);

    try {
      const fields = parsed || parsedFields;
      if (!fields) throw new Error('缺少解析字段');

      // Step 3+4: 生成 prompt
      let promptText = await generatePrompt(userInput, fields, clarifications);
      setGeneratedPromptText(promptText);

      // Step 5: 评分
      setCurrentStep('scoring');
      let score = await scorePrompt(promptText);
      setPromptScore(score);

      // 自动优化循环（最多尝试 3 次）
      let currentRound = 0;
      const maxRounds = 3;

      while (!score.passed && currentRound < maxRounds) {
        currentRound++;
        setOptimizingRound(currentRound);

        // 如果不达标，自动优化
        if (score.suggestions.length > 0) {
          setCurrentStep('generating');
          promptText = await optimizePrompt(promptText, score.suggestions);
          setGeneratedPromptText(promptText);

          // 再次评分
          setCurrentStep('scoring');
          score = await scorePrompt(promptText);
          setPromptScore(score);
        } else {
          // 如果没有建议但未通过，停止优化
          break;
        }
      }

      // 保存到历史记录
      const record: GeneratedPrompt = {
        id: generateId(),
        timestamp: Date.now(),
        originalInput: userInput,
        parsedFields: fields,
        clarificationQuestions,
        finalPrompt: promptText,
        scores: score.scores,
        passed: score.passed,
      };
      savePrompt(record);
      setHistory([record, ...history]);

      setCurrentStep('complete');
      setLoading(false);
      setOptimizingRound(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
      setLoading(false);
      setCurrentStep('input');
      setOptimizingRound(0);
    }
  };

  const handleClarificationSubmit = () => {
    // 将数组转换为对象格式传递给生成函数
    const clarifications = clarificationQuestions.map((q, index) => ({
      question: q.question,
      answer: clarificationAnswersArray[index] || '',
    }));
    handleGeneratePrompt(parsedFields, clarifications);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleReset = () => {
    setCurrentStep('input');
    setUserInput('');
    setParsedFields(null);
    setClarificationQuestions([]);
    setClarificationAnswersArray([]);
    setGeneratedPromptText('');
    setPromptScore(null);
    setError('');
  };

  const handleDeleteHistory = (id: string) => {
    deletePrompt(id);
    setHistory(history.filter(h => h.id !== id));
  };

  const handleLoadHistory = (item: GeneratedPrompt) => {
    setUserInput(item.originalInput);
    setParsedFields(item.parsedFields);
    setGeneratedPromptText(item.finalPrompt);
    setPromptScore({ scores: item.scores, suggestions: [], passed: item.passed });
    setCurrentStep('complete');
    setShowHistory(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'score-high';
    if (score >= 3) return 'score-medium';
    return 'score-low';
  };

  const renderStepIndicator = () => {
    const steps = ['input', 'parsing', 'clarification', 'generating', 'scoring', 'complete'];
    const currentStepIndex = steps.indexOf(currentStep);

    return (
      <div className="step-indicator">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`step-dot ${index === currentStepIndex ? 'active' : ''} ${
              index < currentStepIndex ? 'completed' : ''
            }`}
          />
        ))}
      </div>
    );
  };

  if (!isConfigured) {
    return (
      <div className="app-container">
        <div className="bg-animation">
          <div className="bg-orb" />
          <div className="bg-orb" />
          <div className="bg-orb" />
        </div>
        <div className="main-content">
          <div className="glass-card fade-in">
            <div className="header">
              <h1 className="title">Prompt 生成器</h1>
              <p className="subtitle">配置 API 密钥</p>
            </div>
            <div className="input-group">
              <label className="input-label">Agnes API Key</label>
              <input
                type="password"
                className="text-input"
                placeholder="输入你的 Agnes API Key"
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && !validating && handleSaveApiKey()}
                disabled={validating}
              />
            </div>
            {error && (
              <div className="result-box" style={{ marginTop: '12px', marginBottom: '12px' }}>
                <div className="tag tag-error" style={{ marginBottom: '8px' }}>{error}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                  请检查 API Key 是否正确，或尝试重新输入
                </div>
              </div>
            )}
            {validating ? (
              <div className="loading-container">
                <div className="loading-spinner" />
                <div className="loading-text">正在验证 API Key...</div>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={handleSaveApiKey} disabled={validating}>
                验证并保存
              </button>
            )}
            <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              API Key 获取地址：<a href="https://platform.agnes-ai.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#00f5ff' }}>https://platform.agnes-ai.com/</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="bg-animation">
        <div className="bg-orb" />
        <div className="bg-orb" />
        <div className="bg-orb" />
      </div>
      <div className="main-content">
        <div className="glass-card fade-in">
          <div className="header">
            <h1 className="title">Prompt 生成器</h1>
            <p className="subtitle">AI-POWERED PROMPT ENGINEER</p>
          </div>

          {renderStepIndicator()}

          {currentStep === 'input' && (
            <>
              <div className="input-group">
                <label className="input-label">描述你的需求</label>
                <textarea
                  className="textarea-input"
                  rows={6}
                  placeholder="例如：我需要一个能帮我分析数据的 AI 助手..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                />
              </div>
              {error && <div className="tag tag-error">{error}</div>}
              <div className="btn-group">
                <button className="btn btn-secondary" onClick={() => setShowHistory(!showHistory)}>
                  历史记录 ({history.length})
                </button>
                <button className="btn btn-primary" onClick={handleStartGeneration} disabled={loading}>
                  开始生成
                </button>
              </div>

              {showHistory && history.length > 0 && (
                <div className="result-box slide-up" style={{ marginTop: '16px' }}>
                  {history.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px',
                        marginBottom: '12px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleLoadHistory(item)}
                    >
                      <div style={{ fontSize: '13px', color: '#ffffff', marginBottom: '4px' }}>
                        {item.originalInput.substring(0, 50)}...
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                        {new Date(item.timestamp).toLocaleString('zh-CN')}
                      </div>
                      <button
                        className="btn btn-secondary"
                        style={{
                          marginTop: '8px',
                          padding: '6px 12px',
                          fontSize: '12px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteHistory(item.id);
                        }}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {loading && currentStep !== 'input' && (
            <div className="loading-container">
              <div className="loading-spinner" />
              <div className="loading-text">
                {currentStep === 'parsing' && '正在解析需求...'}
                {currentStep === 'clarification' && '正在分析信息缺口...'}
                {currentStep === 'generating' && optimizingRound > 0 && `正在优化 Prompt (第 ${optimizingRound} 次)...`}
                {currentStep === 'generating' && optimizingRound === 0 && '正在生成 Prompt...'}
                {currentStep === 'scoring' && optimizingRound > 0 && `正在评估优化结果 (第 ${optimizingRound} 次)...`}
                {currentStep === 'scoring' && optimizingRound === 0 && '正在评估质量...'}
              </div>
            </div>
          )}

          {!loading && currentStep === 'clarification' && clarificationQuestions.length > 0 && (
            <div className="slide-up">
              <div style={{ marginBottom: '16px', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                需要补充以下信息：
              </div>
              {clarificationQuestions.map((q, index) => {
                // 根据字段类型提供不同的 placeholder 和下拉选项
                let placeholder = '请输入你的答案...';
                let inputType = 'textarea';
                let options: string[] = [];

                if (q.field === 'task_type') {
                  options = ['分类', '生成', '问答', '翻译', '代码', '分析', '其他'];
                  inputType = 'select';
                } else if (q.field === 'output_format') {
                  options = ['JSON', 'Markdown', '纯文本', '表格', '列表', '其他'];
                  inputType = 'select';
                } else if (q.field === 'tone') {
                  options = ['专业', '幽默', '严谨', '亲切', '简洁', '其他'];
                  inputType = 'select';
                } else if (q.field === 'role') {
                  placeholder = '例如：资深前端工程师、法务专家...';
                } else if (q.field === 'goal') {
                  placeholder = '例如：帮助用户快速生成高质量代码...';
                } else if (q.field === 'audience') {
                  placeholder = '例如：程序员、普通用户、学生...';
                } else if (q.field === 'constraints') {
                  placeholder = '例如：不超过200字、使用专业术语...';
                }

                // 使用字段名作为唯一 key，确保组件完全独立
                const uniqueKey = `clarification-${q.field}-${index}`;
                const currentValue = clarificationAnswersArray[index] || '';

                return (
                  <div key={uniqueKey} className="input-group" style={{ marginBottom: '20px' }}>
                    <label className="input-label" style={{ display: 'block', marginBottom: '12px' }}>
                      <span style={{ color: '#00f5ff', marginRight: '8px' }}>问题 {index + 1}：</span>
                      {q.question}
                    </label>
                    {inputType === 'select' ? (
                      <select
                        key={`select-${q.field}-${index}`}
                        className="text-input"
                        value={currentValue}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateClarificationAnswer(index, e.target.value);
                        }}
                        style={{
                          minHeight: '44px',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">请选择...</option>
                        {options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        key={`textarea-${q.field}-${index}`}
                        className="textarea-input"
                        rows={q.field === 'constraints' ? 3 : 2}
                        placeholder={placeholder}
                        value={currentValue}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateClarificationAnswer(index, e.target.value);
                        }}
                        style={{
                          minHeight: index === 0 ? '60px' : index === 1 ? '70px' : '80px',
                          resize: 'vertical'
                        }}
                      />
                    )}
                  </div>
                );
              })}
              <button className="btn btn-primary" onClick={handleClarificationSubmit}>
                提交并生成
              </button>
            </div>
          )}

          {!loading && currentStep === 'complete' && (
            <div className="slide-up">
              <div style={{ marginBottom: '16px' }}>
                <span className={`tag ${promptScore?.passed ? 'tag-success' : 'tag-error'}`}>
                  {promptScore?.passed ? '质量达标' : '已优化但未完全达标'}
                </span>
              </div>

              <div className="input-group">
                <label className="input-label">生成的 Prompt</label>
                <div className="result-box">
                  <pre>{generatedPromptText}</pre>
                </div>
              </div>

              {promptScore && (
                <>
                  <div style={{ marginTop: '16px', marginBottom: '12px', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                    质量评分
                  </div>
                  <div className="score-grid">
                    <div className="score-item">
                      <div className="score-label">清晰度</div>
                      <div className={`score-value ${getScoreColor(promptScore.scores.clarity)}`}>
                        {promptScore.scores.clarity}/5
                      </div>
                    </div>
                    <div className="score-item">
                      <div className="score-label">完整性</div>
                      <div className={`score-value ${getScoreColor(promptScore.scores.completeness)}`}>
                        {promptScore.scores.completeness}/5
                      </div>
                    </div>
                    <div className="score-item">
                      <div className="score-label">可执行性</div>
                      <div className={`score-value ${getScoreColor(promptScore.scores.executability)}`}>
                        {promptScore.scores.executability}/5
                      </div>
                    </div>
                    <div className="score-item">
                      <div className="score-label">格式规范</div>
                      <div className={`score-value ${getScoreColor(promptScore.scores.format)}`}>
                        {promptScore.scores.format}/5
                      </div>
                    </div>
                  </div>

                  {promptScore.suggestions.length > 0 && !promptScore.passed && (
                    <div className="result-box" style={{ marginTop: '16px' }}>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                        已自动优化 3 次，仍有以下建议可手动改进：
                      </div>
                      {promptScore.suggestions.map((s, i) => (
                        <div key={i} style={{ fontSize: '13px', marginBottom: '4px', color: '#ffaa00' }}>
                          • {s}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="btn-group">
                <button className="btn btn-secondary" onClick={() => handleCopy(generatedPromptText)}>
                  复制 Prompt
                </button>
                <button className="btn btn-primary" onClick={handleReset}>
                  重新生成
                </button>
              </div>
            </div>
          )}

          {!loading && currentStep !== 'input' && error && (
            <div className="tag tag-error" style={{ marginTop: '16px' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;