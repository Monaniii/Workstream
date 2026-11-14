export default async function run(page, ui) {
  const out = {}
  await page.addInitScript(() => {
    window.__errs = []
    window.addEventListener("error", (e) =>
      window.__errs.push(String((e.error && e.error.stack) || e.message).slice(0, 2000))
    )
    window.addEventListener("unhandledrejection", (e) =>
      window.__errs.push("REJECTION " + String(e.reason && (e.reason.stack || e.reason)).slice(0, 2000))
    )
  })

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

  for (const path of ["/app/projects/25", "/app/projects/25/board"]) {
    await page.evaluate((p) => {
      history.pushState({}, "", p)
      window.dispatchEvent(new PopStateEvent("popstate"))
    }, path)
    await page.waitForTimeout(8000)
    const len = await page.evaluate(() => document.getElementById("root")?.innerHTML.length ?? -1)
    const errs = await page.evaluate(() => window.__errs.slice(-4))
    const text = (await page.evaluate(() => document.body.innerText)).slice(0, 500)
    out[path] = { len, errs, text }
    await page.screenshot({ path: `shot${path.replace(/\//g, "-")}.png` })
  }
  return out
}
