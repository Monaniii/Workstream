
import fs from "node:fs"
import path from "node:path"

const DIRS = ["src/pages", "src/layout"]
const files = DIRS.flatMap((d) =>
  fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.join(d, f))
)


const BG = {
  "bg-blue-50": "bg-blue-500/10",
  "bg-blue-100": "bg-blue-500/15",
  "bg-green-50": "bg-emerald-500/10",
  "bg-green-100": "bg-emerald-500/15",
  "bg-emerald-50": "bg-emerald-500/10",
  "bg-emerald-100": "bg-emerald-500/15",
  "bg-amber-50": "bg-amber-500/10",
  "bg-amber-100": "bg-amber-500/15",
  "bg-yellow-100": "bg-amber-500/15",
  "bg-red-50": "bg-red-500/10",
  "bg-red-100": "bg-red-500/15",
  "bg-indigo-50": "bg-indigo-500/10",
  "bg-indigo-100": "bg-indigo-500/15",
  "bg-purple-100": "bg-purple-500/15",
  "bg-orange-100": "bg-orange-500/15",
  "bg-sky-100": "bg-sky-500/15",
  "bg-rose-100": "bg-rose-500/15",
}

// text tone used on those tints: light colour stays, dark gets a lighter one
const TEXT = {
  "text-blue-700": "text-blue-600 dark:text-blue-400",
  "text-blue-600": "text-blue-600 dark:text-blue-400",
  "text-green-700": "text-emerald-600 dark:text-emerald-400",
  "text-green-600": "text-emerald-600 dark:text-emerald-400",
  "text-emerald-700": "text-emerald-600 dark:text-emerald-400",
  "text-emerald-600": "text-emerald-600 dark:text-emerald-400",
  "text-amber-700": "text-amber-600 dark:text-amber-400",
  "text-amber-600": "text-amber-600 dark:text-amber-400",
  "text-red-700": "text-red-600 dark:text-red-400",
  "text-red-600": "text-red-600 dark:text-red-400",
  "text-indigo-700": "text-indigo-600 dark:text-indigo-400",
  "text-indigo-600": "text-indigo-600 dark:text-indigo-400",
  "text-purple-700": "text-purple-600 dark:text-purple-400",
  "text-orange-700": "text-orange-600 dark:text-orange-400",
  "text-sky-700": "text-sky-600 dark:text-sky-400",
}

let grand = 0
for (const file of files) {
  const before = fs.readFileSync(file, "utf8")
  let after = before
  let n = 0

  // Replace as whole class tokens so `bg-blue-50` never eats `bg-blue-500`.
  const tokenReplace = (src, map) => {
    let out = src
    for (const [from, to] of Object.entries(map)) {
      const re = new RegExp(`(?<![\\w-])${from}(?![\\w-])`, "g")
      const hits = out.match(re)
      if (!hits) continue
      // Skip when the dark variant is already present next to it.
      out = out.replace(re, () => {
        n++
        return to
      })
    }
    return out
  }

  after = tokenReplace(after, BG)
  after = tokenReplace(after, TEXT)
  // "dark:text-blue-400" already handled; collapse any double dark: prefixes.
  after = after.replace(/(dark:text-[a-z]+-\d+)((?:\s+dark:text-[a-z]+-\d+)+)/g, "$1")

  if (after !== before) {
    fs.writeFileSync(file, after)
    console.log(`${file}: ${n} replacements`)
    grand += n
  }
}
console.log(`total: ${grand}`)
