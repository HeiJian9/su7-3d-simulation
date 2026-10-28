# 本地“小爱同学”关键词模型

模型：`sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01`，INT8 encoder / decoder / joiner（epoch-12）。只保留运行所需三个 ONNX 与 tokens，不改动车模资产。

- 发布来源：[k2-fsa/sherpa-onnx kws-models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models)
- 原包：[官方发布归档](https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2)
- 模型作者与说明：[pkufool 模型卡](https://www.modelscope.cn/models/pkufool/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01/summary)，归档内原模型卡保存在 `MODEL_CARD.md`，声明 Apache License 2.0。
- 引擎：npm `sherpa-onnx@2.0.1`，Apache-2.0；ONNX Runtime / WASM 随该发行包，运行依赖的许可见项目 `licenses/` 与上游发行源。
- 哈希、长度：`manifest.json`；`npm run wake:prepare` 校验所需文件并生成清单。

运行位置是现有本机 Node 服务的独立 Worker。浏览器只通过同源本机 WebSocket 发送 16 kHz 单声道 Float32 音频；未唤醒时不调用云端 ASR，不保存原始麦克风音频。关键词拼音使用本模型的 tokens：`x iǎo ài t óng x ué`。

关键词检测不是按钮或定时器触发。提示音后才启动既有单轮录音；当前只承诺“先唤醒，再说命令”。连说音频虽然可命中关键词，但后续命令可能已说出，因此不列为支持或验收通过。

资源管理：用户可关闭；页面隐藏时停止麦克风采集，恢复可见后重新采集；播报与指令期间暂停，清除关键词流，防止把系统反馈当新命令。关闭或卸载终止浏览器桥接 Worker 和本地识别 Worker。
