# Provider 当前状态与待办

2026-10-26，按用户最新要求暂不接入服务，先交付框架。无真实外部 ASR/TTS 调用。配置位置：项目根目录 `.env`；字段及协议见 [API_CONFIG.md](API_CONFIG.md)。不需要在聊天中提供密钥。

| 能力 | 已实现 | 仍待完成 |
|---|---|---|
| Gemini ASR | 原生 inlineData 与多模态 input_audio 独立适配、WAV/WebM 校验、取消／超时／错误映射、去重 | 平台文档、gemini-3.8-flash 实际音频协议和模型可用性、本机凭据、真实中文音频探针 |
| API TTS | 独立二进制 /audio/speech 适配、模型／音色配置、播放打断、失败重播 | 平台、协议、模型、普通话音色确认；真实音频合成与播放、耗时和真人打断复验 |
| Intent | 四窗规则与统一执行器、基础上下文／追问 | I7 接 DeepSeek；INTENT_* 当前不调用 |

凭据检查只判断是否存在，不打印值。根 `.env` 已从空模板创建，Git 忽略；健康接口只报告是否配置及 `not-verified`。配置完整也只显示 `configured-unverified`，不自动提升为真实通过。

测试 ASR、TTS、合成音源均标注 Mock；本机 HTTP 协议测试只访问 127.0.0.1。日常演示没有 Mock 成功路由，也无浏览器 speechSynthesis 替代播报。I3 / A10 真实闭环保持未完成。
