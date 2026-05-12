#!/usr/bin/env node

const { spawn } = require('node:child_process')

const env = { ...process.env }

;(async() => {
  // If running the web server then prerender pages
  if (process.argv.slice(-3).join(' ') === 'npm run start') {
    // Apply pending Drizzle migrations. Replaces the old
    // `drizzle-kit push --force` which kept tripping on
    // "index users_email_unique already exists" during table
    // recreations. The migrator reads /app/drizzle/ and tracks
    // applied migrations in __drizzle_migrations — idempotent
    // and safe to run on every container boot.
    await exec('npx drizzle-kit migrate')
    await exec('npx next build --experimental-build-mode generate')
  }

  // launch application
  await exec(process.argv.slice(2).join(' '))
})()

function exec(command) {
  const child = spawn(command, { shell: true, stdio: 'inherit', env })
  return new Promise((resolve, reject) => {
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} failed rc=${code}`))
      }
    })
  })
}
