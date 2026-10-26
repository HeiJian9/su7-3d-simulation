# 阿里云真实语音接入验证

日期：2026-10-26，版本 0.3.1。本次在已完成 I2／语音框架的基础上接入用户选择的国内服务；未实现 I4 或 DeepSeek。阶段历史只用 Git 保存，无旧工程副本。

## 服务选择与配置

用户在讨论国内服务后选择阿里云、创建 API Key，并在根 `.env` 的 ASR_API_KEY / TTS_API_KEY 保存，回复“已保存”。按此前打开的北京地域入口配置并通过真实接口验证。密钥未打印、未写入报告或 Git。

- ASR：`qwen3-asr-flash`，`dashscope-asr`，北京域名 `/compatible-mode/v1/chat/completions`，Bearer 认证，16kHz 单声道 PCM16 WAV Data URL。原生 ASR 参数单独适配，不假定 Gemini 请求体可以复用。
- TTS：`cosyvoice-v3-flash`，系统音色 `longanyang`（龙安洋、普通话），`dashscope-cosyvoice`，北京 `/api/v1/services/audio/tts/SpeechSynthesizer`。服务端获取结果后下载 OSS 音频，无凭据转发，返回完整 WAV。
- 阿里云旧域名当前仍可用，真实探针已成功；可后续按业务空间 API Host 更新配置。签名 OSS 下载 URL 不返回前端／日志，只允许预期北京 OSS 域名并升级为 HTTPS。

此次服务选择修订替换原设计的 Gemini ASR 指定项，已在设计文档顶部注明；没有把千问结果计为 Gemini 通过。Gemini 和原兼容适配保留，按协议校验不同模型组合。DeepSeek 保持 I7 范围。

## 真实接口与实际动作证据

1. [真实 API 探针](validation/aliyun/live-api-probe.json)：CosyVoice 合成“左前车窗打开一半。”，得到 2,000ms WAV；TTS 请求／下载约 1,325ms。千问 ASR 实际转写相同文字，约 523ms，规则解析为左前窗 50%。音源为 API 合成语音，不是真人麦克风。
2. [真实 API 浏览器测试](validation/aliyun/live-browser-synthesized.json)：使用上述真实中文音频加静音作为合成麦克风输入；浏览器实际录音／自动结束→本机接口→真实千问 ASR→规则→真实 SU7 几何达到 fl=0.5，fr/rl/rr=0→真实 CosyVoice 音频播放结束。两个本机语音接口均 HTTP 200。
3. 浏览器已保存含车辆目标、实际姿态和语音阶段记录的 [诊断](validation/scene-diagnostics-2026-10-26T12-34-47-318Z.json)，以及 [同视角实际画面](assets/aliyun/real-api-synthesized-loop.png)。诊断保存由用户按钮触发，不记录原始录音或密钥。
4. 真实返回 WAV 使用流式长度占位值，首次探针推算时长失败；已按实际字节修正 RIFF／data 长度并统一 WAV MIME，复测通过，并补充相关单元测试。

## 自动回归边界

自动回归与真实接口探针分开：`npm run test:e2e` 使用 3003 端口的 `--test-unconfigured` 服务，不读取 `.env`、不使用用户 Key；测试中的 ASR／TTS 响应和合成音源明确为 Mock。日常演示仍在 3000，使用用户配置的真实服务。

- 类型检查、构建和 Lint 通过；日志见 [构建](validation/aliyun/build.log)。
- WAV／协议／状态／规则 39 项单元测试通过，见 [模块测试](validation/aliyun/unit.log)。
- 语音与镜头双分辨率回归 32 项通过，见 [原始报告](validation/aliyun/playwright-speech-scene.json)；四窗 10 项及取消 2 项追加通过，合计 44 项通过，见同目录 regression-summary.json。
- 未配置、权限、无设备、静音、认证、限流、超时、格式、旧响应、TTS 失败等模拟回归不冒充真实平台故障。

## 真人体验结果与剩余边界

用户按真人测试请求完成操作并回复“已完成”。已核对 [真人诊断](validation/scene-diagnostics-2026-10-26T12-38-18-018Z.json)：20:35:58–20:36:37（Asia/Shanghai）共三次录音，每次均完成 recording-request→transcribing→rules→completed→tts-request→tts-ended，全部 mock=false，无错误。三次录音分别为 3909／1833／3475ms，使用手动结束；真实 ASR 耗时 589／512／555ms。最后保存的转写为“所有的车窗全打开。”，四窗目标与实际几何均为 100%，状态 idle，错误码为空。用户确认完成包含播报确认的体验请求。

真人基础闭环已通过。具体“左前半开”机器姿态证据来自上面的真实 API／合成音源测试；真人诊断只保留最后转写，不能据此回填前三条各自的文字。自动静音结束、澄清、取消、播报打断及故障恢复有浏览器自动化覆盖；本次真人使用手动结束，尚未逐项复验真实环境噪声、扬声器回声和所有复杂场景，因此不宣称这些真人场景已全部通过，也不提前推进 I4。

无须再购买 Pro 会员，也无需在聊天中提供密钥。遇到服务未开通、额度或地域问题，按去敏错误码处理，手动／文字控车继续可用。

协议依据：[千问 ASR](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)、[CosyVoice HTTP](https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api)、[音色列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)。
