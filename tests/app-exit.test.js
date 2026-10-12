import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

// 执行真实 App 脚本，模拟原生生命周期与弹窗回调，不复制退出实现。
const source = await readFile(new URL('../App.uvue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')

function launchApp(platform = 'android') {
  const hooks = {}
  const dialogs = []
  let exitCount = 0
  const platformScript = platform === 'android' ? script : script.replace(/\/\/ #ifdef APP-ANDROID[\s\S]*?\/\/ #endif/g, '')
  runInNewContext(platformScript, {
    console: { log() {} },
    scheduleStartupUpdateCheck() {},
    onLaunch: hook => { hooks.launch = hook },
    onLastPageBackPress: hook => { hooks.back = hook },
    onExit: hook => { hooks.exit = hook },
    uni: {
      showModal: options => { dialogs.push(options) },
      exit: () => { exitCount++; hooks.exit() }
    }
  })
  hooks.launch()
  return { hooks, dialogs, exitCount: () => exitCount }
}

function dismiss(dialog, confirm) {
  dialog.success({ confirm, cancel: !confirm })
  dialog.complete()
}

test('Android 最后一页返回弹出退出确认，不直接退出', () => {
  const app = launchApp()
  app.hooks.back()
  assert.equal(app.dialogs.length, 1)
  assert.equal(app.dialogs[0].title, '退出应用')
  assert.equal(app.dialogs[0].cancelText, '继续使用')
  assert.equal(app.dialogs[0].confirmText, '退出')
  assert.equal(app.exitCount(), 0)
})

test('取消退出保留应用，下次返回可以再次确认', () => {
  const app = launchApp()
  app.hooks.back()
  dismiss(app.dialogs[0], false)
  assert.equal(app.exitCount(), 0)
  app.hooks.back()
  assert.equal(app.dialogs.length, 2)
})

test('连续返回只显示一个弹窗，仅确认时调用退出', () => {
  const app = launchApp()
  app.hooks.back()
  app.hooks.back()
  app.hooks.back()
  assert.equal(app.dialogs.length, 1)
  dismiss(app.dialogs[0], true)
  assert.equal(app.exitCount(), 1)
})

test('弹窗失败完成后不锁死后续退出确认', () => {
  const app = launchApp()
  app.hooks.back()
  app.dialogs[0].complete({ errMsg: 'showModal:fail' })
  app.hooks.back()
  assert.equal(app.dialogs.length, 2)
  assert.equal(app.exitCount(), 0)
})

test('热退出生命周期清除弹窗状态，不依赖旧弹窗回调', () => {
  const app = launchApp()
  app.hooks.back()
  app.dialogs[0].success({ confirm: true, cancel: false })
  assert.equal(app.exitCount(), 1)
  app.hooks.launch()
  app.hooks.back()
  assert.equal(app.dialogs.length, 2)
})

test('Web 不注册原生退出事件', () => {
  const app = launchApp('web')
  assert.equal(app.hooks.back, undefined)
  assert.equal(app.hooks.exit, undefined)
  assert.equal(app.dialogs.length, 0)
})
