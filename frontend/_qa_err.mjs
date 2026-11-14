export default async function run(page, ui) {
  const out = { consoleErrors: [], pageErrors: [], failed: [] }
  page.on("console", (m) => {
    const t = m.text()
    if (m.type() === "error" || t.includes("Minified React")) out.consoleErrors.push(t.slice(0, 900))
  })
  page.on("pageerror", (e) => out.pageErrors.push(String(e.stack || e).slice(0, 1500)))
  page.on("response", (r) => {
    if (r.status() >= 400) out.failed.push(`${r.status()} ${r.url().slice(0, 120)}`)
  })

  await page.goto("http://localhost:5199/login")
  await page.waitForSelector("input", { timeout: 60000 })
  await page.fill('input[type="email"]', "sarah@acme.com")
  await page.fill('input[type="password"]', "DemoPass123!")
  await page.waitForTimeout(800)
  await page.locator('button[type="submit"]').click({ timeout: 20000 })
  await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 45000 }).catch(() => { })
  await page.waitForTimeout(2500)
  await page.selectOption("select", "acme-corp")
  await page.waitForTimeout(2500)

  out.pageErrors = out.pageErrors.slice(-3)
  await page.goto("http://localhost:5199/app/projects/25/board")
  await page.waitForTimeout(9000)
  out.rootHtmlLen = await page.evaluate(() => document.getElementById("root")?.innerHTML.length ?? -1)
  out.bodyLen = await page.evaluate(() => document.body.innerHTML.length)
  out.pageErrors = out.pageErrors.slice(-4)
  out.consoleErrors = out.consoleErrors.slice(-4)
  await page.screenshot({ path: "shot-board2.png" })
  return out
}
