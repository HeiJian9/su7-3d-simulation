# 第三方资源与署名

## Xiaomi SU7

- 作品：**Xiaomi SU7**
- 作者：**Mona x Supercars**，Sketchfab 用户 **Car2022**
- 来源：https://sketchfab.com/3d-models/xiaomi-su7-ca2cda599f5341068c992c9f44551bf9
- 模型 ID：`ca2cda599f5341068c992c9f44551bf9`
- 页面许可：**Creative Commons Attribution 4.0 International (CC BY 4.0)**
- 许可：https://creativecommons.org/licenses/by/4.0/
- 原始包未附独立许可文本，依据下载页面公开许可；来源与下载交接证据见资产审查。
- 本项目修改：OBJ/MTL 导入、统一尺寸与坐标、PBR 参数适配、不透明纹理的 Alpha 映射修复、打包纹理、导出 GLB。未在 I0–I1 实施部件拆分、机构运动或内饰重建。
- 署名在演示的资产信息面板持续可见；修改不代表作者为本项目背书。

## 开源软件

完整版本锁定在 `package-lock.json`；安装依赖自带各项目 LICENSE。主要运行依赖：React / React DOM（MIT）、Three.js（MIT）、React Three Fiber（MIT）、Drei（MIT）、Zustand（MIT）、Zod（MIT）、Express（MIT）。

`apps/web/public/decoders/draco/` 来自 Three.js 0.186.1 随附的 glTF Draco 解码器；Draco 使用 **Apache License 2.0**，来源 https://github.com/google/draco 。许可副本见 `licenses/Draco-APACHE-2.0.txt`。本次 GLB 未使用 Draco 压缩，加载器保留本地解码能力。

Blender **4.5.15 LTS** 由官方站点下载，ZIP SHA-256 已比对官方校验文件；便携工具放在 `.tools/`，其自身许可和版权文件随官方包保留，不随网页提供。Blender 工具许可与模型的 CC BY 许可不同。

## 字体与光照

未分发字体文件。界面使用用户系统已安装的 Noto Sans SC／微软雅黑、Bahnschrift 及后备字体。展厅反射由程序生成的 Lightformer 提供，未引入第三方 HDRI、照片或背景素材。
