# APK 整包在线更新

项目使用 HBuilderX 云打包，GitHub Release 托管 APK 和更新描述。源码仓库 `Hwayin/mhxy-jsq` 已按要求公开；客户端不包含 GitHub 令牌。

更新入口在「备份 → 应用更新」。正式 Android 安装版启动后检查一次；离线失败保持正常记账。数字 `versionCode` 比已安装版本大时显示更新。下载后按块校验文件大小、APK 文件头和 SHA-256，再调用 `uni.installApk` 打开系统安装界面。用户确认覆盖安装，系统继续检查包名、版本和签名。浏览器、HBuilder 调试基座只检查版本。

## 首次发布 0.7.0

1. 用当前代码在 HBuilderX 云打包 Android **正式 APK**。保持 AppID `__UNI__A9783A2`、包名 `com.mhxy.costledger` 和原证书 `mhxyledger`。签名密码保留在本机，不提交仓库。
2. 运行以下命令；APK 必须是本次云打包的 0.7.0 / 700。脚本读取 APK 内实际包名和版本，调用 HBuilderX 自带 apksigner 验证签名，并计算校验摘要。

```powershell
node scripts/prepare-update-release.mjs --apk "D:\下载\本次云打包.apk"
# 可额外提供 --notes "D:\下载\更新说明.txt" 或 --hbuilder "HBuilderX安装目录"
```

3. 在 [GitHub Releases](https://github.com/Hwayin/mhxy-jsq/releases/new) 新建 `v0.7.0` Release，上传脚本生成的 `unpackage/update-release/v0.7.0/mhxy-ledger-0.7.0.apk` 与 **`update.json`** 两个附件。更新描述必须作为附件，放源码根目录不会被客户端读取。
4. 发布稳定版本，设为 Latest；不要设成草稿或 Pre-release。匿名打开 [更新描述](https://github.com/Hwayin/mhxy-jsq/releases/latest/download/update.json)，确认可访问，并确认其中 APK 链接可下载。
5. 原来的 0.6.0 尚无更新功能，需要手动覆盖安装本次 APK 一次。以后即可通过应用内更新。

也可以在已登录 GitHub CLI 的电脑上传。先完成上述 APK 校验，再在项目目录运行：

```powershell
gh release create v0.7.0 "unpackage/update-release/v0.7.0/mhxy-ledger-0.7.0.apk" "unpackage/update-release/v0.7.0/update.json" --repo Hwayin/mhxy-jsq --title "v0.7.0" --notes-file "unpackage/update-release/v0.7.0/notes.md" --latest
```

## 后续每次更新

同时递增 `manifest.json` 的 `versionName` 与 `versionCode`，同步 `package.json` 版本；例如 0.8.0 / 800。提交推送代码后重新云打包，运行生成脚本，再创建 `v0.8.0` Release 并上传对应两个附件。每个版本使用独立 APK 文件名，不替换已经发布过的安装包。只有正式发布 Latest 后手机才会看到新版；GitHub 源码 push 本身不会生成或发布 APK。

更新描述结构（实际大小和摘要由脚本生成）：

```json
{
  "type": "apk",
  "platform": "android",
  "appId": "__UNI__A9783A2",
  "packageName": "com.mhxy.costledger",
  "versionName": "0.7.0",
  "versionCode": 700,
  "url": "https://github.com/Hwayin/mhxy-jsq/releases/download/v0.7.0/mhxy-ledger-0.7.0.apk",
  "size": 12345678,
  "sha256": "由脚本生成真实的64位十六进制摘要",
  "notes": "更新说明"
}
```

## 手机上验收

- 从较旧的正式安装版更新：检查版本、说明、下载进度、取消后重试、校验及系统安装确认。
- 安装后版本显示新版，账号、角色、成本、编辑草稿仍存在；建议先导出备份。
- 离线启动、404 未发布、下载中断和错误摘要不影响账本；校验失败不能启动安装。
- 系统阻止安装时，允许本应用安装未知应用，返回后点击「安装新版」重试。
- 同版本和更旧版本不会提示升级。首次手动安装与覆盖更新都必须使用同一证书。

GitHub 在部分网络环境无法访问；此时检查或下载会失败并允许重试。如后续需要稳定国内下载，可扩展白名单并改用对象存储，目前使用用户指定的公开 GitHub 仓库。

原生接口参考：[DCloud 下载文件](https://doc.dcloud.net.cn/uni-app-x/api/download-file.html)、[安装 APK](https://doc.dcloud.net.cn/uni-app-x/api/install-apk.html)、[文件系统](https://doc.dcloud.net.cn/uni-app-x/api/get-file-system-manager.html)。HBuilderX 5.26 的文件摘要 API 不支持 SHA-256，因此本项目使用经过标准摘要对照测试的流式实现，无须升级打包工具。
