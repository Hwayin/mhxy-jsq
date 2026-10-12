# APK 整包在线更新

项目支持 HBuilderX 云打包和 [本地离线打包](android-offline-packaging.md)，GitHub Release 托管 APK 和更新描述。源码仓库 `Hwayin/mhxy-jsq` 已按要求公开；客户端不包含 GitHub 令牌。

本地正式 **0.8.2 / 802** 已在用户手机覆盖安装，金额一致且快速录入分类切换正常。构建后自动发布 Latest 的实际结果见 [验证记录](validation.md)。

此前 **0.8.1 / 801** 已通过自动脚本云打包并发布为 [稳定 Release](https://github.com/Hwayin/mhxy-jsq/releases/tag/v0.8.1)，保留快速录入，并修复 Android 更新校验重复读取 APK 文件头的问题。手机上的旧 0.7.1 / 0.8.0 若提示「安装包大小不匹配」，需要通过浏览器下载新版 APK，直接覆盖安装一次；旧校验器无法通过修改服务器的元数据修复。不要卸载，覆盖安装后核对版本与金额，再使用应用内更新升级后续版本。

0.8.1 APK 大小 **38,831,381 字节**，SHA-256 `7d3987228bb2f0baefa299cfb68228ab0118f0d395df57d8e8a2889485ad1e7f`，原包名和云端证书核验通过。Release 对应源码 `c4e18b1e7cb34dd29bb2a39c747cf6fe25a6a3e1`，匿名元数据与完整下载验证通过。[同一修复包的云端下载链接](https://app.liuyingyong.cn/build/download/8d5e4410-c5fb-11f1-8f02-3fc7c49167b1) 可作备用。手机覆盖安装及后续原生校验仍待用户确认。

已安装 0.7.0 的真实包名是 `uni.app.UNIA9783A2`、签名为 DCloud 云端证书，与最初计划的配置不同。修复版沿用实际包名与原云端证书，账本留在原应用数据目录。0.7.0 可直接手动覆盖安装最新修复版，无须中转 0.7.1。

先前 [v0.8.0 Release](https://github.com/Hwayin/mhxy-jsq/releases/tag/v0.8.0) 已正式发布，包含 APK 与 `update.json` 两个附件，目前 Latest 已更新为 0.8.1。0.8.0 匿名下载地址已实际验证，APK 大小 **38,830,990 字节**，SHA-256 为 `8eabda23a22ff01d1d47f3546196271656ceca70f4e69b9b74b286065f2218e0`；Release 对应源码提交 `6464e93fe904eeafaf65d497f7bbbd69cf067a6b`。

此前用户反馈已升级 0.8.0、原账本金额一致且可见「快速录入」。随后提供的新截图显示 0.7.1 在下载后被大小校验拦截。按 DCloud 官方 Android 源码行为复现后，确认旧校验代码省略 `position` 会重复读取文件开头；因此此前反馈不作为所有设备均完成原生校验的证据，修复版覆盖安装和后续在线升级仍须手机验收。

## 云打包完成后自动发布

先递增版本（下一次例如 `manifest.json` 中 0.9.0 / 900，同时同步 `package.json`），提交并推送本次代码。保持 HBuilderX 已打开并登录，GitHub CLI 已通过 `gh auth login` 登录且拥有仓库发布权限。

然后在项目目录只运行：

```powershell
.\scripts\pack-android.ps1 -Submit -Publish
```

脚本会检查新版本、已提交且已推送的源码与仓库权限，提交云打包并记录 ticket，等待该任务完成，下载 APK，验证实际版本/包名/原证书，生成 `update.json`，创建 GitHub Release 草稿，上传两个附件并校验服务器大小和 SHA-256，最后正式发布为 **Latest**，再通过匿名地址完整下载验证。运行过程中不修改源码版本、不自动提交代码。

默认使用 `release/notes-v<版本>.md`（存在时）作为说明，也可以指定说明文件：

```powershell
.\scripts\pack-android.ps1 -Submit -Publish -Notes "release/notes-v0.9.0.md"
# 默认最多等云端 40 分钟，每 20 秒查询一次；可调整。
.\scripts\pack-android.ps1 -Submit -Publish -TimeoutMinutes 60 -PollSeconds 30
```

运行时保留终端和 HBuilderX。云队列超时、下载或上传中断后，使用记录的任务继续：

```powershell
# 读取本项目脚本记录的最近一次任务，继续等待/发布。
.\scripts\publish-apk-update.ps1
# 指定 HBuilderX 返回的 ticket；适合手动窗口打包或继续指定任务。
.\scripts\publish-apk-update.ps1 -Ticket "云打包ticket"
# 已经在电脑下载了 APK 时，直接验证并发布。
.\scripts\publish-apk-update.ps1 -Apk "D:\下载\新版.apk"
```

手动在 HBuilderX 菜单中打包时，需用 ticket 或已下载的 APK 调用发布脚本；推荐上面的 `-Submit -Publish` 一条命令完成提交与发布。

先检查发布计划而不写 GitHub：

```powershell
.\scripts\publish-apk-update.ps1 -Apk "D:\下载\新版.apk" -DryRun
```

预演会读取 GitHub 并校验/暂存本机附件，不创建 Release、不上传、不更改 Latest。元数据和 APK 下载遇到短暂网络错误会自动重试，最多 3 次。正式运行遇到同版本同 APK 已发布时仅复核，不覆盖附件；若已发布新版尚非 Latest，则核验后设置 Latest。同版本不同 APK、版本回退、云任务失败、签名不一致、等待期间源码改变或附件校验失败都会停止。上传失败的同源码草稿可重跑补齐；正式发布后匿名验证断网，重跑会继续核验该已发布包。

已发布的同版本会被 `-Submit -Publish` 拒绝，需先递增版本，避免重复云构建。脚本记录保存在忽略的 `.local/android-cloud-last-task.json`，APK 与发布附件保存在 `unpackage/update-release/v<版本>/`，GitHub 凭据由 `gh` 管理。

## 本轮 0.7.0 → 0.8.0 演练

电脑上先生成并云打包 0.7.1 修复包：

```powershell
.\scripts\prepare-update-bootstrap.ps1 -BaseRef 7e26eb5
& "$env:USERPROFILE\Desktop\HBuilderX\cli.exe" project open --path "D:\Mycode\mhxy-jsq\unpackage\bootstrap-0.7.1"
.\unpackage\bootstrap-0.7.1\scripts\pack-android.ps1 -Submit -Async -Json
```

修复包从已有 0.7.0 源码导出，只修改版本为 0.7.1 / 701、更新识别包名和打包配置，快速录入仍留在正式 0.8.0 中。下载后同样通过生成脚本核验证书，再提供给手机一次性手动覆盖安装。[已核验的 0.7.1 修复包](https://app.liuyingyong.cn/build/download/fd761ab0-c5ef-11f1-8ef7-5ff0e0edb706)，用户已确认覆盖安装保留原账本。

随后云打包 0.8.0，验证 APK 并发布附件；手机保留 0.7.1，等 Release 发布后通过应用内升级。

```powershell
# 当前项目已经登录 HBuilderX。只检查配置不加 -Submit。
.\scripts\pack-android.ps1 -Submit -Async -Json
# 若打包预检仅报告包名尚未登记的已知提示，可加 -IgnoreWarnings。
# 按提交结果中的 ticket 查询任务；也可在 HBuilderX「发行 → 查看云打包状态」查看。
& "$env:USERPROFILE\Desktop\HBuilderX\cli.exe" pack status --project "D:\Mycode\mhxy-jsq" --ticket "提交返回的ticket" --json true

# 下载云打包的 APK 后生成两项发布附件；会验证实际版本和原签名。
node scripts/prepare-update-release.mjs --apk "下载的0.8.0.apk" --notes "release/notes-v0.8.0.md"

# 使用本次源码的提交 SHA 作 target，确保 Release 标签对应构建源码。
gh release create v0.8.0 "unpackage/update-release/v0.8.0/mhxy-ledger-0.8.0.apk" "unpackage/update-release/v0.8.0/update.json" --repo Hwayin/mhxy-jsq --target "本次源码提交SHA" --title "v0.8.0 快速录入" --notes-file "unpackage/update-release/v0.8.0/notes.md" --latest
```

手机端：

1. 在原 0.7.0 的「备份」页导出一份账本备份，并记下角色数量和总投入；直接覆盖安装同包名、同签名的 0.7.1 修复包，不卸载。
2. 在 0.7.1 点击「应用更新 → 检查更新」，应看到 **0.8.0** 和快速录入说明。
3. 点击「下载更新」，等待下载与校验，再点击「安装新版」。如系统提示，允许本应用安装未知应用后返回重试。
4. 在系统界面确认**覆盖安装**，随后重新打开 App；当前版本应为 0.8.0，原账本金额与角色保持。
5. 打开角色，点击底部「快速录入」，点部位、填金额并「保存并继续」。确认金额清空且切到下一未记录部位。详情见 [快速录入](quick-entry.md)。

下载、校验或安装失败时，可以重试；不要为了安装新版卸载旧 App。系统若提示签名不同，应先核对 0.7.0 实际使用的证书，不能换签名后覆盖。

更新入口在「备份 → 应用更新」。正式 Android 安装版启动后检查一次；离线失败保持正常记账。数字 `versionCode` 比已安装版本大时显示更新。下载后通过 `fstatSync` 核对实际文件大小，分块显式指定 `position` 并按剩余长度读取，校验 APK 文件头与完整 SHA-256；最后再次核对大小，通过后才调用 `uni.installApk` 打开系统安装界面。用户确认覆盖安装，系统继续检查包名、版本和签名。浏览器、HBuilder 调试基座只检查版本。

## 首次发布 0.7.0

1. 用对应版本代码在 HBuilderX 云打包 Android **正式 APK**。保持 AppID `__UNI__A9783A2`、实际包名 `uni.app.UNIA9783A2` 和同一云端证书。原本机自有证书保留作备份，不用于覆盖用户现有安装版。
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

已配置本地离线打包：版本递增、测试并提交推送后，执行 `.\scripts\pack-android-offline.ps1 -Publish`，即可在本机生成正式 APK 并自动发布 Latest。完整步骤见 [本地打包](android-offline-packaging.md)。手机更新源和更新入口保持相同。

同时递增 `manifest.json` 的 `versionName` 与 `versionCode`，同步 `package.json` 版本；例如 0.8.0 / 800。提交推送代码后重新云打包，运行生成脚本，再创建 `v0.8.0` Release 并上传对应两个附件。每个版本使用独立 APK 文件名，不替换已经发布过的安装包。只有正式发布 Latest 后手机才会看到新版；GitHub 源码 push 本身不会生成或发布 APK。

0.8.1 已发布，下次例如使用 **0.9.0 / 900**、`v0.9.0` 与 `mhxy-ledger-0.9.0.apk`。流程仍是「改版本并测试/推送 → 云打包 → 生成两个附件 → GitHub Release 设 Latest」。旧校验器报错的用户需手动覆盖安装 0.8.1 一次，以后保留相同 AppID、实际包名及云端证书即可在 App 中升级。

更新描述结构（实际大小和摘要由脚本生成）：

```json
{
  "type": "apk",
  "platform": "android",
  "appId": "__UNI__A9783A2",
  "packageName": "uni.app.UNIA9783A2",
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
