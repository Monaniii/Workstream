export default async function run(page, ui) {
  const out = { failed: [] }
  page.on("response", (r) => {
    if (r.status() >= 400) out.failed.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`)
  })

  await page.goto("http://localhost:5199/login")
  await page.waitForSelector("input", { timeout: 60000 })
  await page.fill('input[type="email"]', "sarah@acme.com")
  await page.fill('input[type="password"]', "DemoPass123!")
  await page.waitForTimeout(800)
  await page.locator('button[type="submit"]').click({ timeout: 20000 })
  await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 45000 }).catch(() => { })
  await page.waitForTimeout(3000)

  // Choose the workspace in the dashboard's select
  const options = await page.$$eval("select option", (els) =>
    els.map((e) => ({ value: e.value, text: e.textContent }))
  )
  out.options = options
  const pick = options.find((o) => o.value)
  if (pick) {
    await page.selectOption("select", pick.value)
    await page.waitForTimeout(5000)
  }
  out.slugStored = await page.evaluate(() => localStorage.getItem("workspaceSlug"))
  await page.screenshot({ path: "shot-dash2.png" })

  await page.goto("http://localhost:5199/app/projects")
  await page.waitForTimeout(5000)
  const links = await page.$$eval('a[href*="/app/projects/"]', (els) =>
    els.map((e) => e.getAttribute("href"))
  )
  out.projectLinks = links
  await page.screenshot({ path: "shot-projects.png" })

  const target = links.find((h) => /\/app\/projects\/\d+$/.test(h || ""))
  if (!target) return out

  await page.goto("http://localhost:5199" + target + "/board")
  await page.waitForTimeout(8000)
  out.boardUrl = page.url()
  out.boardText = (await page.evaluate(() => document.body.innerText)).slice(0, 2000)
  out.cardCount = await page.locator("div.cursor-pointer").count()
  await page.screenshot({ path: "shot-board.png" })
  out.failed = out.failed
  return out
}
