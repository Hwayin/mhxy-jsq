# 梦幻多开账本：框架选型

日期：2026-10-08

采用 HBuilderX + uni-app x 蒸汽模式 + Vue 3，优先搭建 Android App，并保留 iOS 支持。本机 HBuilderX 为 5.26.2026091802。

官方项目说明：https://doc.dcloud.net.cn/uni-app-x/project.html

## 框架比较

| 方案 | HBuilderX 开发适配 | 取舍 |
| --- | --- | --- |
| uni-app x + Vue 3 | 官方工具链，原生 App 渲染 | 本项目选择；原生 CSS 为 Web 的子集，页面使用简单类选择器、flex 与显式文字样式 |
| 传统 uni-app + Vue 3 | 官方工具链，App Vue 页面为 WebView 渲染 | 生态成熟，但官方对新 App 推荐 uni-app x，避免新项目再迁移 |
| Flutter / React Native | 主要使用各自工具链 | 本任务指定 HBuilderX，不采用额外原生开发工具链 |

官方介绍：https://doc.dcloud.net.cn/uni-app-x/

蒸汽模式说明：https://doc.dcloud.net.cn/uni-app-x/app-vapor.html

本地存储说明：https://doc.dcloud.net.cn/uni-app-x/api/storage.html

未依赖大型后台模板或第三方 UI 库：首版为小型离线账本，使用基础组件足够，减少版本适配负担。存储层与纯业务模块独立，后续可接入云端。

第一版范围：账号与角色管理、装备与召唤兽成本明细、本地存储、汇总统计、数据备份。默认面向电脑版，所有金额按人民币录入。

金额按人民币分存储，展示为元，避免浮点累计误差。角色购入价格需注明是否包含装备与召唤兽，避免重复计入成本。
