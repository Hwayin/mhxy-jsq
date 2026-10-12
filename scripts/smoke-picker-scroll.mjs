import assert from 'node:assert/strict'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { ledger } from './load-ledger.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const browser = await chromium.launch({ channel:'msedge', headless:true })
const failures = []
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5178'
try {
  for (const width of [390, 320]) {
    const context = await browser.newContext({ viewport:{width,height:844}, hasTouch:true, isMobile:true })
    const page = await context.newPage()
    page.on('pageerror', error => failures.push(error.message))
    const cdp = await context.newCDPSession(page)
    await page.goto(base)
    await page.getByText('成本总览',{exact:true}).waitFor()
    const seed = ledger.demoLedger()
    await page.evaluate(data => localStorage.setItem('mhxy-ledger-v1',JSON.stringify(data)),seed)
    await page.reload()
    await page.locator('.rank-row').first().click()
    await page.getByText('＋ 记一笔',{exact:true}).click()
    await page.locator('.equipment-choice:visible').filter({has:page.getByText('物品名称',{exact:true})}).locator('.field').click()
    const groups = page.locator('.choice-groups')
    const chips = groups.locator('.choice-group')
    const labels = await chips.allInnerTexts()
    assert.equal(new Set(labels).size, labels.length)
    assert.equal(labels.some(label => label.includes(' · ')), false)
    async function scrollGesture(locator, xDistance, yDistance) {
      const box = await locator.boundingBox()
      const horizontal = xDistance !== 0
      const axis = horizontal ? 'x' : 'y'
      let remaining = Math.abs(horizontal ? xDistance : yDistance)
      const sign = Math.sign(horizontal ? xDistance : yDistance)
      while (remaining > 0) {
        const amount = Math.min(remaining, (horizontal ? box.width : box.height)*.55)
        const fraction = sign < 0 ? .75 : .25
        const start = {x:box.x+box.width*(horizontal?fraction:.5),y:box.y+box.height*(horizontal?.5:fraction)}
        const before = await scrollValue(locator,axis)
        const limit = await locator.evaluate((root,axis)=>Math.max(...[root,...root.querySelectorAll('*')].map(el=>axis==='x'?el.scrollWidth-el.clientWidth:el.scrollHeight-el.clientHeight)),axis)
        if (sign > 0 && before === 0 || sign < 0 && before >= limit - 1) break
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]})
        for(let i=1;i<=8;i++) {
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(horizontal?sign*amount*i/8:0),y:start.y+(horizontal?0:sign*amount*i/8)}]})
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))
        }
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
        remaining -= amount
        if (await scrollValue(locator,axis) === before) break
      }
    }
    async function scrollValue(locator, axis) {
      return locator.evaluate((root,axis) => Math.max(...[root,...root.querySelectorAll('*')].map(el=>axis==='x'?el.scrollLeft:el.scrollTop)),axis)
    }
    const beforeListTop = await scrollValue(page.locator('.choice-list'),'y')
    await scrollGesture(groups,-3000,0)
    assert.ok(await scrollValue(groups,'x') > 0, width+'px 分类栏应随横向触摸滚动')
    assert.equal(await scrollValue(page.locator('.choice-list'),'y'), beforeListTop)
    const last = chips.last()
    const groupBox = await groups.boundingBox()
    const lastBox = await last.boundingBox()
    assert.ok(lastBox.x >= groupBox.x - 1 && lastBox.x + lastBox.width <= groupBox.x + groupBox.width + 1, '末尾类型应能滑入可见范围')
    await last.click()
    const category = labels.at(-1)
    const captions = await page.locator('.choice-caption .muted').allInnerTexts()
    assert.ok(captions.length > 0 && captions.every(caption => caption === category || caption.startsWith(category+' · ')))
    await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/picker-scroll-'+width+'.png',import.meta.url))})
    await scrollGesture(groups,3000,0)
    assert.equal(await scrollValue(groups,'x'),0)
    await chips.first().click()
    await scrollGesture(page.locator('.choice-list'),0,-600)
    assert.ok(await scrollValue(page.locator('.choice-list'),'y') > 0,'物品列表仍可纵向滚动')
    const after = JSON.parse(await page.evaluate(()=>localStorage.getItem('mhxy-ledger-v1')))
    assert.deepEqual(after,seed)
    await context.close()
  }
  assert.deepEqual(failures,[])
  console.log('PASS: 390px / 320px 触摸横向滑动、滑到末尾类型并筛选、向回滑动、列表纵向滚动；用户账本未修改')
} finally { await browser.close() }
