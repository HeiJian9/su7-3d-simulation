# API 配置 · 0.7.0

2026-10-29：当前使用北京百炼 `qwen3-asr-flash` ASR、`deepseek-v4.1-flash-1017` 车载智能助手、`cosyvoice-v3-flash` / `longanhuan` TTS。用户明确授权复用现有阿里云 Key；已在本机 `.env` 配好，**无需重新提供**。以下旧 I3 记录保留用于协议说明。

## DeepSeek Function Calling

本机配置位置：`D:\code\Projects\3D simulation\.env`，仅服务端读取：

```dotenv
INTENT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
INTENT_MODEL=deepseek-v4.1-flash-1017
INTENT_PROTOCOL=openai-chat-tools
# INTENT_API_KEY 只在本机填入，当前复用已确认的百炼凭据。
```

`/models` 已返回该模型；真实 `/chat/completions` 工具选择及 `tool_call_id` 结果回传已通过。不要只凭模型列表或 JSON 输出判断 function calling。请求不启用思考输出；保留平台返回的协议消息供后续工具回合使用，不在 UI 或日志展示推理内容。

浏览器只访问本机 `/api/assistant/plan` 与 `/api/assistant/finish`。服务端保存完整 assistant 工具消息；浏览器整轮校验后执行并等待实际动画，回传对应 ID、状态、属性效果与顺序观察。服务端再核对结果、调用模型生成短答。不接受任意 JS、路径、未注册工具，不做 JSON-mode 静默回退。

缺配置：健康接口只列缺失字段；认证、网络、模型／协议失败均明确反馈。修改 `.env` 后重启服务。工具与参数见 [LLM_TOOLS.md](LLM_TOOLS.md)，真实协议记录在 `docs/validation/i7-i9/`。

唤醒使用本地 sherpa-onnx Worker，不需要额外云服务 Key；模型来源与许可见 `assets/wake/README.md`。浏览器音频通过同源 WebSocket `/api/wake` 送到本机服务，未唤醒时不调用云端 ASR。

官方依据：[百炼 Function Calling](https://help.aliyun.com/zh/model-studio/qwen-function-calling)、[百炼 DeepSeek 接口](https://help.aliyun.com/zh/model-studio/deepseek-api)。

---

# API 填写位置与协议约定

0.3.2：当前 I3 四窗验收见 [I3_FINAL_VALIDATION.md](I3_FINAL_VALIDATION.md)。普通自动测试的最新报告在 docs/validation/i3-final；`npm run speech:verify-i3` 为显式真实 API 的澄清／停播复测，使用合成音源，不替代真人。

2026-10-26 更新：用户选择国内服务并创建、保存阿里云百炼 Key，当前使用北京地域千问 ASR + CosyVoice。真实接口及合成语音浏览器闭环已通过；真人麦克风体验单独记录，不能由合成音源替代。原 Gemini 适配保留可选。

## 当前阿里云配置

根目录 `.env` 已设置以下非密钥项，`ASR_API_KEY` 和 `TTS_API_KEY` 由用户在本机填写（可使用同地域、同业务空间且有相应权限的同一个 Key）。

```dotenv
ASR_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ASR_MODEL=qwen3-asr-flash
ASR_PROTOCOL=dashscope-asr
ASR_AUTH_HEADER=bearer
ASR_AUDIO_FORMATS=audio/wav
TTS_BASE_URL=https://dashscope.aliyuncs.com/api/v1
TTS_MODEL=cosyvoice-v3-flash
TTS_VOICE=longanhuan
TTS_PROTOCOL=dashscope-cosyvoice
```

若有业务空间专属 API Host，可将两项地址的域名替换为对应北京业务空间域名，保留各自路径。当前文档确认旧域名仍可用，且真实请求已经成功。其它地域不能混用北京 Key 与接口。

`dashscope-asr` 使用音频 Data URL，调用 `/chat/completions`，携带 `asr_options`；只上传音频，不发送 Gemini 系统角色指令。`dashscope-cosyvoice` 使用原生 `/services/audio/tts/SpeechSynthesizer`，接收 JSON 中的 OSS 音频地址，再由服务端无凭据下载并返回完整 WAV。处理了实际服务返回 WAV 长度占位值的情况。签名地址和 Key 不返回网页、不写入日志。

诊断：`npm run speech:probe` 会产生少量真实 API 调用，以合成短句验证 TTS→ASR→规则，报告位于 `docs/validation/aliyun/live-api-probe.json`；该命令不是真人麦克风验收。自动回归 `npm run test:e2e` 使用独立 3003 端口，明确跳过读取 `.env`，不会消耗真实 Key。

官方依据：[千问 ASR](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)、[CosyVoice HTTP](https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api)、[模型与音色匹配](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)。

## 填写位置

本机文件：`D:\code\Projects\3D simulation\.env`。已创建空白配置，参考根目录 `.env.example`。密钥只填在 `.env`，该文件被 Git 忽略。不要填进前端、`VITE_*`、聊天、截图或日志。修改后重启 `npm start`；开发时重启 `npm run dev`。

| 字段 | 填入内容 |
|---|---|
| ASR_BASE_URL | 平台文档确认的 API 基地址，不含最终操作路径、查询参数或密钥 |
| ASR_API_KEY | 本机填写 ASR 凭据 |
| ASR_MODEL | 当前 `qwen3-asr-flash`；Gemini 协议仍限定 `gemini-3.8-flash`，按协议校验模型配对 |
| ASR_PROTOCOL | 当前 `dashscope-asr`；另保留 `gemini-native` / `openai-chat-audio` |
| ASR_AUTH_HEADER | 原生默认 `x-goog-api-key`；中转要求时填 `bearer` |
| ASR_AUDIO_FORMATS | 可留空采用协议默认；或填 `audio/wav` / `audio/webm,audio/wav`，只允许平台明确支持的格式 |
| TTS_BASE_URL | 支持下述二进制语音接口的平台基地址 |
| TTS_API_KEY | 本机填写 TTS 凭据，可与 ASR 平台不同 |
| TTS_PROTOCOL | 当前 `dashscope-cosyvoice`；另保留 `openai-speech` |
| TTS_MODEL | 平台真实可调用的 TTS 模型 ID，没有默认值 |
| TTS_VOICE | 该模型实际支持的普通话音色 ID，没有默认值 |
| INTENT_* | 当前 DeepSeek 工具调用配置，见本文顶部 |

## 已实现的服务端协议

1. `gemini-native`：`POST {ASR_BASE_URL}/models/gemini-3.8-flash:generateContent`，JSON `contents[].parts[].inlineData { mimeType, data: base64 }`；读取 `candidates[0].content.parts[].text`。基地址通常包含协议版本路径，例如 `/v1beta`，具体以中转文档为准。
2. `openai-chat-audio`：`POST {ASR_BASE_URL}/chat/completions`，JSON 多模态 `input_audio { data: base64, format: wav|webm }`；读取 `choices[0].message.content`。仅兼容文字聊天的中转接口不够，必须明确支持音频以及指定 Gemini 模型。默认录制 WAV。
3. `openai-speech`：`POST {TTS_BASE_URL}/audio/speech`，Bearer 认证，JSON `{ model, voice, input, response_format: "mp3" }`；要求二进制 `audio/*` 响应。JSON/Base64、流式 WebSocket 或其他协议需新增适配，不能靠填写 URL 自动兼容。

服务端模块在 `apps/server/src/speech/`。浏览器只请求本机 `/api/speech/transcribe`（multipart）和 `/api/speech/synthesize`（JSON），不会收到上游密钥。上游地址必须 HTTPS（本机协议测试允许 localhost HTTP）。响应和音频不落盘，错误不回显上游响应体。

浏览器优先 WebM/Opus；需要 WAV 时通过 AudioWorklet 采集，编码为 16kHz 单声道 PCM16。连续有效音量后静音 1.5 秒结束；开口前可准备 15 秒，单次上限 30 秒 / 6 MB。此处是本地音量断句，复杂噪声环境仍需真人复验。

## 配置之后的真实验收

`GET http://localhost:3000/api/health` 只返回是否配置、缺失字段和 `not-verified`，不返回凭据。“已配置”不代表调用成功。

真实平台协议、中文音频探针和 API 合成音源浏览器动作已验证，见 `docs/validation/aliyun/`。仍需真人说“左前车窗打开一半”、确认文字／动作／实际播报，以及真实设备澄清、打断、取消复验。保存实际证据后才可完成 I3 / A10。自动 Mock 回归仍单独标记，不计真实 API 通过。

Gemini 原生音频协议参考：[Google 音频理解文档](https://ai.google.dev/gemini-api/docs/audio)。中转站实际支持情况需由其文档和真实探针另行确认。

## 0.7.3 自然回复与女声

当前 `TTS_VOICE=longanhuan`，为官方龙安欢元气女声，模型／协议与 Key 不变。修改本机音色后重启服务器生效；无需下载语音包，也不要将环境文件放入交付。官方列表：https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list 。

复杂控车走 `/api/assistant/plan` 与 `/finish` 的真实 function calling；自动规则完成后 `/api/assistant/feedback` 只负责用 LLM 组织自然语言，先用共享 Ledger 校验完成版本、属性值和边界，不能产生控车动作。回复故障回退为真实执行结果；规划仍保持零温度。
