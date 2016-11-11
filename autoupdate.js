#!/usr/bin/env node

var fs = require('fs-extra')
var async = require('async')
var config = require('./config')
var glob = require('glob')
var GIT_REPO_LOCAL_FOLDER = config.GIT_REPO_LOCAL_FOLDER
var gitUpdater = require('./updaters/git')

var startAutoUpdate = (library, callback) => {
  console.log('\n')
  console.log(library.name.yellow)
  var source = library.autoupdate.source
  switch (source) {
    case 'git':
      gitUpdater.update(library, callback)
      break
    default:
      console.log('Autoupdate type not supportted'.red)
      callback(null, 0)
  }
}

var initialize = (err) => {
  if (err) {
    console.error("Got an error: " + err)
  } else {
    console.log('Starting Auto Update'.cyan)
    console.log('-----------------------')
    var args = process.argv.slice(2)
    var globPattern = (args.length === 1) ? args[0] : '*'
    var filenames = glob.sync(__dirname + "/../cdnjs/ajax/libs/" + globPattern + "/package.json")
    var librarys = filnames
      .map((filename) => JSON.parse(fs.readFileSync(filename, 'utf8')))
      .filter((library) => typeof library.autoupdate === 'object')

    async.eachLimit(librarys, 8, (library, callback) => {
      startAutoUpdate(library, callback)
    }, () => {
      console.log('\n')
      console.log('-----------------------')
      console.log('Auto Update Completed'.green)
    })
  }
}

fs.mkdirpSync(GIT_REPO_LOCAL_FOLDER)
initialize()
