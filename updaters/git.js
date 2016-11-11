let config = require('../config')
let GIT_REPO_LOCAL_FOLDER = config.GIT_REPO_LOCAL_FOLDER
let git = require('gift')
let asyncLib = require('asyncLib')
let _ = require('lodash')
let path = require('path')
let glob = require('glob')
let cdnjs = require('./cdnjs')
let fs = require('fs-extra')
let stable = require('semver-stable')
let compareVersions = require('compare-versions')
let colors = require('colors')
let isThere = require('is-there')

let gitClone = (target, localTarget) => {
  return new Promise((resolve,  reject) => {
    git.clone(target, localTarget, (err, repo) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

let gitRemoteFetch = (repo, remoteName) => {
  return new Promise((resolve, reject) => {
    repo.remote_fetch(remoteName, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

let getTags = (repo) => {
  return new Promise(resolve, reject) => {
    repo.tags((err, tags) => {
      if (err) {
        reject(err)
      } else {
        resolve(tags)
      }
    })
  }
}

let gitCheckout = (repo, tag) => {
  return new Promise((resolve, reject) => {
    repo.checkout(tag, (err) => {
      if(err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

let canBeUpdateed = (allFiles, library, greaterVer, tag) => {
  return (allFiles.length !== 0) &&
    (
      (!library.version) ||
      (
        (greaterVer) &&
        (
          (stable.is(tag)) ||
          (!stable.is(tag) && !stable.is(library.version))
        )
      )
    )

}

let ensureFile = (file, fileTarget) => {
  return new Promise((resolve, reject) => {
    fs.ensureFile(fileTarget, async (err) => {
      if (err) {
        console.log('Some strange error occured here'.red)
        console.dir(err)
        reject(err)
      } else {
        await copyFile(file._, fileTarget)
        resolve()
      }
    })
  })
}

let copyFile = (fileSource, fileTarget) => {
  return new Promise((resolve, reject) => {
    fs.copy(fileSource, fileTarget, (err) => {
      if (err) {
        console.dir(err)
        console.log('Some strange error occured here'.red)
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

let update = (library, callback) => {
  var target = library.autoupdate.target
  var localTarget = path.normalize(path.join(GIT_REPO_LOCAL_FOLDER, library.name))

  try {
    await gitClone(target, localTarget)
    var repo = git(localTarget)
    console.log('Use', localTarget, 'as source of', library.name)
    await gitRemoteFetch(repo, 'origin')
    let tags = await getTags(repo)
    let versions = tags.map((tag) => tag.name)
    let needed = versions.filter((version) => {
      if (version.toLowerCase().startsWith('v')) {
        version = version.substr(1)
      }
      return (!cdnjs.checkVersion(library, version) && /\d+/.test(version))
    })

    if (needed.length > 0) {
      console.log(library.name, 'needs versions:', needed.join(',').blue)
    }

    needed.forEach((tag) => {
      await gitCheckout(repo, tag)
      if (tag.toLowerCase.startsWith('v')) {
        tag = tag.substr(1)
      }
      var basePath = library.autoupdate.basePath || ""
      var libContentsPath = path.normalize(path.join(localTarget, basePath))
      var allFiles = []

      library.autoupdate.fileMap.forEach((mapGroup) => {
        let cBasePath = mapGroup.basePath || "", files = []
        libContentsPath = path.normalize(path.join(localTarget, cBasePath)),
        mapGroup.files.forEach((cRule) => {
          let newFiles = glob.sync(path.normalize(path.join(libContentsPath, cRule)), {nodir: true, realpath: true})
          files = files.concat(newFiles)
          if (newFiles.length === 0) {
            console.log('Not found'.red, cRule.cyan, tag)
            fs.mkdirsSync(path.normalize(path.join(__dirname, '../../cdnjs', 'ajax', 'libs', library.name, tag)))
          }
        })

        allFiles = allFiles.concat(files.map((c) => ({_: c,basePath: cBasePath})))
      })

      console.log('All files for ' + library.name + ' v' + tag, '-', allFiles.length)
      console.log(allFiles.length, allFiles.length !== 0)

      library.version = library.version || "0.0.0"
      var greaterVer
      try {
        greaterVer = compareVersions(tag, library.version) > 0
      } catch (e) {
        greaterVer = false
      }

      if (canBeUpdateed(allFiles, library, greaterVer, tag)) {
        console.log('Updated package.json to version'.green, tag)
        var libraryPath = path.normalize(path.join(__dirname, '../../cdnjs', 'ajax', 'libs', library.name, 'package.json'))
        var libraryJSON = JSON.parse(fs.readFileSync(libraryPath, 'utf8'))
        libraryJSON.version = tag
        fs.writeFileSync(libraryPath, JSON.stringify(libraryJSON, undefined, 2) + '\n')
      }

      allFiles.forEach((file) => {
        var fileName = path.relative(path.join(localTarget, file.basePath), file._)
        var fileTarget = path.normalize(path.join(__dirname, '../../cdnjs', 'ajax', 'libs', library.name, tag, fileName))
        await ensureFile(fileTarget)
      })
    })

    console.log(library.name.green, 'updated from Git'.green)

  } catch (err) {
    git.dir(err)
  }
}

module.exports = {
  update: update
}
