export default async function run(page, ui) {
  const out = { pageErrors: [], consoleErrors: [] }
  page.on("console", (m) => {
    if (m.type() === "error") out.consoleErrors.push(m.text().slice(0, 600))
  })
  page.on("pageerror", (e) => out.pageErrors.push(String(e.stack || e).slice(0, 2000)))

  await page.goto("http://localhost:5199/login")
  await page.waitForSelector("input", { timeout: 60000 })
  await page.fill('input[type="email"]', "sarah@acme.com")
  await page.fill('[type="password"]', "DemoPass123!")
  await page.waitForTimeout(800)
  await page.locator('button[type="submit"]').click({ timeout: 20000 })
  await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 45000 }).catch(() => { })
  await page.waitForTimeout(2500)
  await page.selectOption("select", "acme-corp")
  await page.waitForTimeout(2500)

  out.beforeLen = await page.evaluate(() => document.getElementById("root")?.innerHTML.length ?? -1)

  // Navigate inside the SPA instead of a full reload so the context stays warm
  await page.evaluate(() => {
    history.pushState({}, "", "/app/projects/25/board")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  await page.waitForTimeout(9000)

  out.afterLen = await page.evaluate(() => document.getElementById("root")?.innerHTML.length ?? -1)
  out.bodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 1500)
  out.pageErrors = out.pageErrors.slice(-3)
  out.consoleErrors = out.consoleErrors.slice(-5)
  await page.screenshot({ path: "shot-board3.png" })
  return out
}
