const fs = require('fs')
const md5 = require('md5')

module.exports = (dir, reg, cb) => {
  let md5Previous = null
  let fsWait = false

  fs.watch(dir, (event, filename) => {
    const isWatchFile = reg.test(filename)
    if (isWatchFile) {
      console.log(filename, isWatchFile)

      if (fsWait) return
      fsWait = setTimeout(() => {
        fsWait = false
      }, 100)

      const md5Current = md5(fs.readFileSync(`${dir}/${filename}`))
      if (md5Current === md5Previous) {
        return
      }
      md5Previous = md5Current
      cb()
    }
  })
}
