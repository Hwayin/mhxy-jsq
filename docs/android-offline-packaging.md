# Android 本地离线打包

项目已增加 `android-offline/` 原生工程，使用官方 **HBuilderX 5.26 Vapor SDK（101163）**，保持实际包名 `uni.app.UNIA9783A2`、AppID `__UNI__A9783A2` 和原云端证书。HBuilderX 只导出正式资源，Gradle 在本机生成 APK，不提交云打包任务。

## 本机首次配置

需要 Windows、Node.js 22.13+、已打开并登录的 HBuilderX 5.26。自动发布还需要 Git、已登录且有仓库写权限的 GitHub CLI（`gh`）。在项目目录执行：

```powershell
.\scripts\setup-offline-android.ps1
.\scripts\configure-offline-signing.ps1 -Keystore "原云端证书完整路径.keystore"
```

第一条下载并核对官方 SDK、Java 21、Gradle 9.2.1 和 Android API 36 / build-tools 36.0.0；首次需要联网，Gradle 首次构建也会下载依赖。Java 21 用于加载官方自动注册插件；Java 源码目标仍为 17。工具放在忽略的 `unpackage/`，不改 HBuilderX 内置 Java。

第二条在本机隐藏输入原证书密码，并先核对公开证书指纹。成功后把证书和 Windows DPAPI 保护的密码配置保存到忽略的 `.local/`。密码不写进源码、Gradle 文件或命令参数；换电脑或 Windows 用户后需重新配置。历史自有证书继续保留，不能用它替换原云端证书覆盖现有安装版。

本机已完成这两步。HBuilderX 的默认目录为 `%USERPROFILE%\Desktop\HBuilderX`，相关脚本支持 `-HBuilderXPath` 指定其他目录。

## 生成 APK

```powershell
.\scripts\pack-android-offline.ps1
```

脚本依次导出 HBuilderX 正式资源、验证 AppID / 版本 / 编译器、按实际使用的 API 配置原生库、生成独立资源快照、构建 Release APK，再核验实际包名、版本、原签名及 SHA-256。

5.26 的导出清单把菜单和确认弹窗标记为 `uni-prompt`，但 Vapor 运行时还调用独立的 `uni-actionSheet`、`uni-modal` 桥接模块。从 0.8.3 起，脚本明确打入这两个官方 AAR 并由自动注册插件注册，避免仅照导出清单复制 `uni-prompt` 导致原生弹窗无响应。文件系统模块同时按官方依赖补齐 Brotli 解码库。

产物：`android-offline/app/build/outputs/apk/release/app-release.apk`。校验后的发布附件位于 `unpackage/update-release/v<版本>/`。正常构建会重新导出资源。`-SkipExport` 只用于本机排查已有导出资源；发布时禁止使用，避免旧资源冒充新源码。

HBuilderX 升级后需更新匹配的 SDK / 工具版本，当前脚本会拒绝其他编译器版本。原生工程使用 Android 6.0+、ARM 32 / 64 位，不包含模拟器架构。

## 构建后自动设为 Latest

先同步增加 `manifest.json` 的 `versionName`、`versionCode` 与 `package.json` 版本，编写 `release/notes-v<版本>.md`，提交并推送代码，然后执行：

```powershell
.\scripts\pack-android-offline.ps1 -Publish
```

它先检查已推送的干净源码、GitHub 权限及版本前进，再锁定源码提交、导出、构建、验包，最后复用原发布脚本：暂存 GitHub 草稿 → 上传 APK 和 `update.json` → 核对大小与 SHA-256 → 发布为稳定 Latest → 匿名完整下载校验。

发布阶段断网可以执行 `.\scripts\publish-apk-update.ps1 -Apk "已核验 APK 路径" -SourceSha "构建时的提交 SHA"` 继续；源码需保持与该 APK 一致。同版本的正式发布不会被不同 APK 覆盖，修改后应增加版本。

手机继续使用「备份 → 应用更新」检查、下载和覆盖安装。原包名与原证书保持，不需要卸载。安装和账本保留的实际验收结果见 [验证记录](validation.md)。

## 官方依据

- [DCloud 原生 SDK 下载](https://doc.dcloud.net.cn/uni-app-x/native/download/android.html)
- [DCloud Android 原生工程配置](https://doc.dcloud.net.cn/uni-app-x/native/use/android.html)
- [Android SDK 命令行工具](https://developer.android.com/tools/sdkmanager)
