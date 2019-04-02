const fs = require('fs')
const path = require('path')
const gm = require('gm').subClass({
  imageMagick: true
})
const { exec } = require('child_process')
const request = require('request')
const tinify = require('tinify')
const tmpDir = path.resolve(__dirname, '../', 'tmp-image/') + path.sep

const WIDTH = 375
const HEIGHT = 1200
const MINI_KEY = 'WmVJzJgLsjcZ3mpyZMzghGtq2FLTWTXY'

// https://stackoverflow.com/questions/45039779/how-to-install-imagemagick-inside-of-electron-app
process.env.PATH += ':/usr/local/bin'

async function crop(cropNum, width, height, originFileName, log) {
  let handle
  let index = 0
  const result = []
  const name = (i, str) => {
    const li = str.lastIndexOf('.')
    return `${str.substr(0, li)}-${i}${str.substr(li)}`
  }
  const _do = () => {
    const isLast = index === cropNum
    const filePath = `${tmpDir}${name(index, originFileName)}`
    const cropHeight = width * HEIGHT / WIDTH
    this.crop(
      width,
      isLast ? (height - cropHeight * index) : cropHeight,
      0,
      index === 0 ? 0 : cropHeight * index
    )
    .noProfile()
    .write(filePath, function (err) {
      if (err) throw err
      if (!err) {
        console.log(`img crop done: ${filePath}`)
        log(`裁剪: ${filePath}`)
        result.push(filePath)
        if (index < cropNum) {
          index += 1
          _do()
        } else {
          log('裁剪完成')
          handle(result)
        }
      }
    })
  }
  _do()

  return new Promise((res, rej) => {
    handle = res
  })
}

async function minify(fileArr, log) {
  const allCmd = fileArr.map(file => new Promise(async (resolve, reject) => {
    console.log(`do minify ${file.url}`)

    const source = tinify.fromFile(file.url)
    await source.toFile(file.url)
    log(`压缩：${file.url}`)
    resolve(file)
  }))
  return Promise.all(allCmd)
}

async function upload(fileArr, log, needCrop) {
  const all = fileArr.map(file => new Promise((resolve, reject) => {
    console.log(`upload file: ${file.url}`)
    request.post({
      url: 'https://filesystem.api.jituancaiyun.com/sfs/webUpload/srvfile?fileType=2&src=cdn',
      formData: {
        upfile: fs.createReadStream(file.url)
      }
    }, async (err, res, body) => {
      if (err) {
        reject(err.message)
      }
      log(`上传：${file.url}`)
      if (needCrop) {
        await rmfile(file.url)
      }
      const url = JSON.parse(body).fileUrl
      resolve({ url, index: file.index || 0 })
    })
  }))
  const res = await Promise.all(all)
  return res.sort((a, b) => a.index - b.index).map(x => x.url)
}

function rmfile(file) {
  return new Promise(res => {
    exec(`rm ${file}`, (err, data) => {
      if (err) throw err
      console.log(`remove file: ${file}`)
      res()
    })
  })
}

function doApp(filePath, originFileName, startTs, log, needMinify = true) {
  const readStream = fs.createReadStream(filePath)
  return new Promise((res, rej) => {
    // gm(readStream).size((err, size) => {
    //   if (err) throw err
    //   log(JSON.stringify(size))
    // })
    gm(readStream).size({ bufferStream: true }, async function(err, { width, height }) {
      if (err) {
        throw err
      }

      // 切割按照 375 / 1200 的比例控制
      const shrinkHeight = WIDTH * height / width
      const cropNum = Math.floor(shrinkHeight / HEIGHT)
      let arr = [filePath]
      const needCrop = cropNum > 0
      if (needCrop) {
        // 裁剪
        log(`裁剪为 ${cropNum} 张`)
        arr = await crop.call(this, cropNum, width, height, originFileName, log)
        // log('删除缓存文件')
        // await rmfile(filePath)
      } else {
        log('无须裁剪')
      }
      // 压缩
      let fileArr = arr.map((x, index) => ({ url: x, index }))
      if (needMinify) {
        log('压缩图片')
        fileArr = await minify(fileArr, log).catch(rej)
      }
      // 上传
      log('上传图片')
      const urlArr = await upload(fileArr, log, needCrop).catch(rej)
      console.log(`all complete, cost ${(Date.now() - startTs) / 1000}s`)
      log(`上传完成，总耗时：${(Date.now() - startTs) / 1000}s`)
      res(urlArr)
    })
  })
}

function catErr(err) {
  const result = { code: 500, success: false }
  if (typeof err === 'string') {
    result.msg = err
  } else {
    result.msg = err.message
  }
  return result
}

module.exports = (file, log, callback) => {
  const cb = async () => {
    const urlArr = await doApp(file.path, file.name, Date.now(), log, file.isMini).catch(err => {
      log(err.message)
    })
    console.log(urlArr)
    callback(urlArr)
  }

  if (file.isMini) {
    log('校验 tinify')
    tinify.key = file.miniKey || MINI_KEY
    tinify.validate((err) => {
      if (err) {
        log(catErr(err).msg)
      } else {
        cb()
      }
    })
  }
}
