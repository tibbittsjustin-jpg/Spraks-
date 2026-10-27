/* Tiny test runner — no dev dependencies, just `npm test`.
   Each *.test.js file logs its own results and exports { pass, fail },
   or a promise resolving to that for suites with async cases. */
const fs = require("fs"), path = require("path");

async function main() {
  let pass = 0, fail = 0;
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();

  for (const f of files) {
    console.log("\n\x1b[1m" + f + "\x1b[0m");
    try {
      const r = await require(path.join(__dirname, f));
      pass += r.pass; fail += r.fail;
    } catch (e) {
      console.log("  \x1b[31mFAIL\x1b[0m suite crashed: " + e.message);
      fail++;
    }
  }

  console.log("\n" + (fail ? "\x1b[31m" : "\x1b[32m") + pass + " passed, " + fail + " failed\x1b[0m\n");
  process.exit(fail ? 1 : 0);
}

main();
