# Android APK 打包配置

本工程已准备 Android 正式 APK 的打包配置，尚未提交云打包或生成 APK。

| 项目 | 配置 |
| --- | --- |
| 应用名称 | 梦幻多开账本 |
| DCloud AppID | `__UNI__A9783A2`（沿用当前工程） |
| Android 包名 | `com.mhxy.costledger` |
| 版本 | `0.5.0` / `500` |
| 模式 | uni-app x 蒸汽模式，字节码 |
| 最低版本 | Android 6.0，API 23 |
| 目标版本 | Android 16，API 36 |
| CPU | arm64-v8a、armeabi-v7a |
| 安装包 | APK，正式包，自有证书 |
| 签名别名 | `mhxyledger` |

图标采用新设计的玉色账本与铜钱，已生成 72、96、144、192 px Android 图标，以及 512 / 1024 px 主图；原始图与旧版文件均保留，详见 [图标设计与生成提示词](app-icon-design.md)。名称、版本、图标、CPU 与系统兼容项配置在 `manifest.json` 中。包名及签名属于 HBuilderX 云打包配置，独立保存，不向 uni-app x manifest 写入无效的老 uni-app 字段。

## 已创建的本机文件

- `.local/signing/mhxy-ledger-release.keystore`：RSA 2048 / SHA256withRSA，JKS 私钥证书。
- `.local/signing/password.txt`：随机生成的证书库密码，也是私钥密码。
- `.local/android-signing.json`：本机证书路径、密码文件位置等信息。
- `.local/android-cloud-pack.json`：包含签名密码、可供 HBuilderX CLI 直接使用的完整配置。
- `release/android.json`：可公开的包名、别名、平台参数。
- `release/android-signing-public.json`：公开证书指纹、有效期等信息，不包含私钥或密码。

`.local/` 已加入忽略规则，密码未写入 `manifest.json`。请备份证书及密码，后续覆盖安装和升级继续使用同一包名与证书；准备脚本遇到已有证书不会重新生成。

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

`-Submit` 会调用 HBuilderX 官方 CLI，把项目编译资源和自有签名提交至 DCloud 云打包。不会开启广告、自定义调试基座或 SourceMap。CLI 要求已启动 HBuilderX 并登录；成功后返回下载信息，也可在 IDE「发行 → 查看云打包状态」查看结果。

若安装目录不同，可以加 `-HBuilderXPath '你的 HBuilderX 安装目录'`。命令行调用的是已安装的 HBuilderX，不需要安装 Gradle 或 Android Studio。

## 在可视化窗口打包

选择「发行 → App-Android/iOS-云打包」，只勾选 Android，并填写：

| 窗口字段 | 填写内容 |
| --- | --- |
| 包名 | `com.mhxy.costledger` |
| 证书类型 | 自选证书 / 自有证书 |
| 证书库文件 | `D:\Mycode\mhxy-jsq\.local\signing\mhxy-ledger-release.keystore` |
| 证书别名 | `mhxyledger` |
| 证书库密码、证书密码 | 均从 `.local/signing/password.txt` 复制 |
| 格式 | APK |
| 自定义调试基座 | 不勾选 |

核对信息后提交打包。官方云打包会上传签名用于构建；本次配置工作没有执行该提交动作。

本机原生窗口控制工具连接失败，CLI 帮助命令也提示未连接到 HBuilderX，因此没有代填可视化窗口。工程与独立打包配置已完成，使用上述命令或窗口均可继续。

## 本机检查结果

签名别名、证书库密码及私钥密码验证通过，证书尚未过期；四个 PNG 路径、格式及尺寸检查通过，公开配置中无签名密码。Android 蒸汽模式前端编译通过。云端原生构建、APK 安装与真机操作尚待执行；前端编译产物不是 APK。

以后发布新版本时增加 `manifest.json` 的 `versionCode`，并同步 `versionName`。若移动工程目录，先运行检查命令更新本机证书绝对路径。

## 官方依据

- [uni-app x 云打包](https://doc.dcloud.net.cn/uni-app-x/tutorial/app-package.html)：Android 包名、自有证书、APK / AAB 区别。
- [Android 配置](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest-android.html)：图标尺寸、蒸汽模式最低 API 23、目标 API 36 及 CPU 架构。
- [HBuilderX CLI 云打包](https://hx.dcloud.net.cn/cli/pack)：uni-app x 支持、配置文件字段及状态查询。
