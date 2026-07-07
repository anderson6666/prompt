# 🎨 AI Prompt 生成器

基于 Agnes AI 的专业 Prompt 工程工具，采用工业级流水线设计，提供完整的"解析 → 检测 → 生成 → 评分 → 优化"闭环。

## ✨ 核心特性

- **智能解析** - 从自然语言需求提取结构化信息
- **缺口检测** - 自动识别信息缺失并生成澄清问题
- **专业生成** - 基于 Prompt 工程最佳实践生成高质量 Prompt
- **质量评估** - 5 维度评分系统（清晰度、完整性、可执行性、格式、安全性）
- **自动优化** - 闭环优化机制，最多 3 次迭代确保质量达标

## 🚀 技术架构

```
用户输入 → 需求解析 → 缺口检测 → Prompt 生成 → 质量评分
                                              ↓
                                          不达标？
                                              ↓ 是
                                        自动优化（最多3次）
                                              ↓
                                          最终输出
```

### 核心技术栈

- **前端**: React 18 + TypeScript + Vite
- **UI**: 玻璃卡片效果 + 动态背景 + 金色渐变标题
- **API**: Agnes AI API (agnes-2.0-flash)
- **状态管理**: React Hooks + Local Storage

### Prompt 工程

所有 Prompt 使用 XML 标签隔离，符合大模型最佳实践：

- `<role>` - 专业角色定义
- `<task>` - 明确任务说明
- `<fields_schema>` - 字段规范
- `<generation_rules>` - 生成规则
- `<scoring_criteria>` - 评分标准

## 📦 安装部署

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/anderson6666/prompt.git

# 进入目录
cd prompt

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 生产部署

```bash
# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

### GitHub Pages 部署

项目已配置自动部署到 GitHub Pages，推送代码后自动构建发布。

## 🔑 API Key 配置

1. 获取 Agnes API Key：https://platform.agnes-ai.com/
2. 在应用中输入 API Key
3. 系统会自动验证并保存（Local Storage）

## 🎯 使用流程

1. **启动应用** - 自动显示 API Key 验证页面
2. **输入需求** - 描述你的 Prompt 需求
3. **回答问题** - 如果系统检测到信息缺失，会提出澄清问题
4. **自动生成** - 系统自动生成高质量 Prompt
5. **质量评估** - 显示 5 维度评分和优化建议
6. **自动优化** - 如果不达标，系统自动优化最多 3 次
7. **复制使用** - 点击复制按钮直接使用生成的 Prompt

## 🎨 UI 特性

- **透明科技感** - 玻璃卡片效果、动态背景光球
- **动态极简风** - 流畅动画、步骤进度指示器
- **金色渐变标题** - 专业、醒目的视觉效果
- **竖屏优化** - 完美适配移动端 9:16 屏幕

## 📊 评分系统

| 维度 | 标准 | 说明 |
|------|------|------|
| **清晰度** | 1-5分 | 指令是否无歧义，使用量化标准 |
| **完整性** | 1-5分 | 是否覆盖角色/任务/上下文/格式/约束 |
| **可执行性** | 1-5分 | 模型能否直接照做 |
| **格式规范** | 1-5分 | 输出格式是否明确，是否提供模板 |
| **安全性** | 1-5分 | 是否有防止越界的约束 |

## 🛠️ 项目结构

```
prompt/
├── src/
│   ├── App.tsx              # 主应用组件
│   ├── types/index.ts       # 类型定义
│   ├── utils/
│   │   ├── agnesApi.ts      # Agnes API 集成
│   │   ├── promptGenerator.ts # Prompt 生成核心逻辑
│   │   └── storage.ts       # Local Storage 工具
│   ├── styles/index.css     # UI 样式
│   └── main.tsx             # React 入口
├── package.json             # 项目配置
├── vite.config.ts           # Vite 配置
└── index.html               # HTML 入口
```

## 📝 License

MIT License - 可自由使用、修改和分发

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

GitHub: [@anderson6666](https://github.com/anderson6666)