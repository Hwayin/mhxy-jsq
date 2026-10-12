# Android APK 打包配置

已增加 [本地离线打包](android-offline-packaging.md)，可以在本机使用下载的原云端证书生成 APK。后文保留云打包流程。

当前配置沿用手机实际安装的 0.7.0：包名 `uni.app.UNIA9783A2`、DCloud 云端证书。已从用户提供的原 APK 验证实际包名与证书指纹，记录于 `release/android-update-identity.json`。原先准备的本机自有证书保留作备份，覆盖更新使用原云端证书。

| 项目 | 配置 |
| --- | --- |
| 应用名称 | 梦幻多开账本 |
| DCloud AppID | `__UNI__A9783A2`（沿用当前工程） |
| Android 包名 | `uni.app.UNIA9783A2` |
| 版本 | `0.8.1` / `801` |
| 模式 | uni-app x 蒸汽模式，字节码 |
| 最低版本 | Android 6.0，API 23 |
| 目标版本 | Android 16，API 36 |
| CPU | arm64-v8a、armeabi-v7a |
| 安装包 | APK，正式包，原云端证书 |
| 签名类型 | `androidpacktype: 3`，DCloud 云端证书 |

图标采用新设计的玉色账本与铜钱，已生成 72、96、144、192 px Android 图标，以及 512 / 1024 px 主图；原始图与旧版文件均保留，详见 [图标设计与生成提示词](app-icon-design.md)。名称、版本、图标、CPU 与系统兼容项配置在 `manifest.json` 中。包名及签名属于 HBuilderX 云打包配置，独立保存，不向 uni-app x manifest 写入无效的老 uni-app 字段。

## 已创建的本机文件

- `.local/signing/mhxy-ledger-release.keystore`：RSA 2048 / SHA256withRSA，JKS 私钥证书。
- `.local/signing/password.txt`：随机生成的证书库密码，也是私钥密码。
- `.local/android-signing.json`：本机证书路径、密码文件位置等信息。
- `.local/android-cloud-pack.json`：当前沿用云端证书的 CLI 配置（`androidpacktype: 3`），不包含本机证书密码。
- `release/android.json`：可公开的包名、别名、平台参数。
- `release/android-signing-public.json`：公开证书指纹、有效期等信息，不包含私钥或密码。

`.local/` 已加入忽略规则，密码未写入 `manifest.json`。上述本机自有证书、密码及 `android-signing.json` 是保留的历史备份；当前云端证书模式不会读取或上传它们。后续覆盖安装和升级继续使用经旧 APK 核验的同一包名与云端证书。

## 一键检查与提交

在 HBuilderX 中导入 `D:\Mycode\mhxy-jsq`，使用拥有此 AppID 的账号登录。

项目目录执行以下命令，只检查并准备配置，不提交：

```powershell
.\scripts\pack-android.ps1
```

准备好生成 APK 后执行：

```powershell
.\scripts\pack-android.ps1 -Submit
```

需要在云打包完成后自动上传 GitHub 并设为 Latest，先升版本、提交并推送源码，然后执行：

```powershell
.\scripts\pack-android.ps1 -Submit -Publish
```

它会强制使用异步 JSON 提交以取得明确 ticket，并等待同一任务、下载和核验 APK、上传两项附件并发布 Latest。断网后可用 `.\scripts\publish-apk-update.ps1` 继续最近记录的任务；详细说明与预演命令见 [APK 在线更新](apk-updates.md)。

`-Submit` 会调用 HBuilderX 官方 CLI，将项目编译资源提交至 DCloud 云打包，沿用该 AppID 的云端证书。不会开启广告、自定义调试基座或 SourceMap。CLI 要求已启动 HBuilderX 并登录；成功后返回下载信息，也可在 IDE「发行 → 查看云打包状态」查看结果。加 `-Async -Json` 可在提交后返回任务 ticket，再用 `pack status --ticket` 查询。

若安装目录不同，可以加 `-HBuilderXPath '你的 HBuilderX 安装目录'`。命令行调用的是已安装的 HBuilderX，不需要安装 Gradle 或 Android Studio。

## 在可视化窗口打包

选择「发行 → App-Android/iOS-云打包」，只勾选 Android，并填写：

| 窗口字段 | 填写内容 |
| --- | --- |
| 包名 | `uni.app.UNIA9783A2` |
| 证书类型 | 云端证书，沿用原 AppID |
| 格式 | APK |
| 自定义调试基座 | 不勾选 |

核对信息后提交打包。发布前用 `scripts/prepare-update-release.mjs` 检查 APK 的实际包名、版本和云端证书指纹，不能只相信打包窗口里的填写项。

本轮使用已连接并登录的 HBuilderX CLI 进行云构建。0.7.1 修复包从原 0.7.0 提交导出，位于忽略目录 `unpackage/bootstrap-0.7.1`；它仅修复更新身份识别，不提前加入 0.8.0 的快速录入功能。

## 本机检查结果

70 项测试及 Web/Android 前端编译通过；本轮 0.7.1 与 0.8.0 云端 APK 都已生成，下载后核验实际包名、版本和原云端证书指纹。用户确认 0.7.1 手动覆盖安装保留账本；0.8.0 已发布为 GitHub Latest，匿名完整下载验证通过。手机在线更新结果见 [验证记录](validation.md)。

以后发布新版本时增加 `manifest.json` 的 `versionCode`，并同步 `versionName`。若移动工程目录，先运行检查命令更新本机证书绝对路径。

## 官方依据

- [uni-app x 云打包](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)：Android 包名、自有证书、APK / AAB 区别。
- [Android 配置](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest-android.html)：图标尺寸、蒸汽模式最低 API 23、目标 API 36 及 CPU 架构。
- [HBuilderX CLI 云打包](https://hx.dcloud.net.cn/cli/pack)：uni-app x 支持、配置文件字段及状态查询。
