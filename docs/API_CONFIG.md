# API 填写位置与协议约定

当前按用户最新要求完成框架，**暂不接入外部服务**。I2 可用，I3 真实 API 验收仍未完成。页面显示“ASR / TTS 待配置”，不会用浏览器语音或 Mock 冒充 Gemini / API TTS。

## 填写位置

本机文件：`D:\code\Projects\3D simulation\.env`。已创建空白配置，参考根目录 `.env.example`。密钥只填在 `.env`，该文件被 Git 忽略。不要填进前端、`VITE_*`、聊天、截图或日志。修改后重启 `npm start`；开发时重启 `npm run dev`。

| 字段 | 填入内容 |
|---|---|
| ASR_BASE_URL | 平台文档确认的 API 基地址，不含最终操作路径、查询参数或密钥 |
| ASR_API_KEY | 本机填写 ASR 凭据 |
| ASR_MODEL | 必须为 `gemini-3.8-flash`；平台若使用别名，需先核实映射并调整适配器，不能随意替换模型 |
| ASR_PROTOCOL | `gemini-native` 或 `openai-chat-audio`，按真实音频协议选择 |
| ASR_AUTH_HEADER | 原生默认 `x-goog-api-key`；中转要求时填 `bearer` |
| ASR_AUDIO_FORMATS | 可留空采用协议默认；或填 `audio/wav` / `audio/webm,audio/wav`，只允许平台明确支持的格式 |
| TTS_BASE_URL | 支持下述二进制语音接口的平台基地址 |
| TTS_API_KEY | 本机填写 TTS 凭据，可与 ASR 平台不同 |
| TTS_PROTOCOL | 现有适配器为 `openai-speech`（协议名称，不代表已选择某家服务商） |
| TTS_MODEL | 平台真实可调用的 TTS 模型 ID，没有默认值 |
| TTS_VOICE | 该模型实际支持的普通话音色 ID，没有默认值 |
| INTENT_* | I7 DeepSeek 预留，本轮不填写、不调用 |

## 已实现的服务端协议

1. `gemini-native`：`POST {ASR_BASE_URL}/models/gemini-3.8-flash:generateContent`，JSON `contents[].parts[].inlineData { mimeType, data: base64 }`；读取 `candidates[0].content.parts[].text`。基地址通常包含协议版本路径，例如 `/v1beta`，具体以中转文档为准。
2. `openai-chat-audio`：`POST {ASR_BASE_URL}/chat/completions`，JSON 多模态 `input_audio { data: base64, format: wav|webm }`；读取 `choices[0].message.content`。仅兼容文字聊天的中转接口不够，必须明确支持音频以及指定 Gemini 模型。默认录制 WAV。
3. `openai-speech`：`POST {TTS_BASE_URL}/audio/speech`，Bearer 认证，JSON `{ model, voice, input, response_format: "mp3" }`；要求二进制 `audio/*` 响应。JSON/Base64、流式 WebSocket 或其他协议需新增适配，不能靠填写 URL 自动兼容。

服务端模块在 `apps/server/src/speech/`。浏览器只请求本机 `/api/speech/transcribe`（multipart）和 `/api/speech/synthesize`（JSON），不会收到上游密钥。上游地址必须 HTTPS（本机协议测试允许 localhost HTTP）。响应和音频不落盘，错误不回显上游响应体。

浏览器优先 WebM/Opus；需要 WAV 时通过 AudioWorklet 采集，编码为 16kHz 单声道 PCM16。连续有效音量后静音 1.2 秒结束；无语音 5 秒退出，单次上限 15 秒 / 6 MB。此处是本地音量断句，复杂噪声环境仍需真人复验。

## 配置之后的真实验收

`GET http://localhost:3000/api/health` 只返回是否配置、缺失字段和 `not-verified`，不返回凭据。“已配置”不代表调用成功。

需要补做：平台协议核对 → 指定模型真实中文音频探针 → 普通话 TTS 探针 → 真人说“左前车窗打开一半” → 真实几何达到 50% → 文字和实际 API 音频反馈 → 澄清、打断、取消及失败恢复。保存去敏耗时/结果后才可勾选 I3 / A10。当前自动测试中的音源、ASR 与 TTS 全部明确为测试 Mock，不计真实 API 验收。

Gemini 原生音频协议参考：[Google 音频理解文档](https://ai.google.dev/gemini-api/docs/audio)。中转站实际支持情况需由其文档和真实探针另行确认。
