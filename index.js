const fs = require('fs')
const Dat = require('dat-node')

const startTime = now()
const maxPending = 100

var users = []
var ids = []

var pending = []
var waiting = []
var file = './users.json'
// var nameTree = {...}
loadIndex(file)

function crawl (idx) {
  const user = users[idx]
  if (!user || typeof user.lastChecked !== 'number' || user.lastChecked > startTime) return

  const url = users[idx].url
  user.lastChecked = now()
  pending.push(idx)

  if (pending.length > maxPending) {
    waiting.push(idx)
    console.log('waiting: ' + waiting.length)
    return
  }
  console.log('loading user ' + user.name)

  Dat('/users/' + idx, {temp: true, key: url, sparse: true}, (err, dat) => {
    if (err) {
      console.warn(err)
      removePending(idx)
      return
    }
    console.log('archive created for user ' + user.name)
    dat.joinNetwork(err => {
      if (err) {
        console.warn('Could not join network')
        removePending(idx)
        return
      }

      const drive = dat.archive
      if (drive.version <= user.lastVersion) return
      console.log('reading profile.json for user ' + user.name)
      drive.readFile('profile.json', {encoding: 'utf-8'}, (err, profile) => {
        if (err) {
          console.warn('Could not read profile.json')
          removePending(idx)
          return
        }
        try {
          profile = JSON.parse(profile)
        } catch (err) {
          console.warn('invalid json: ' + err)
          removePending(idx)
          return
        }
        console.log('loaded profile for user ' + user.name)

        user.name = profile.name
        user.lastVersion = drive.version
        const follows = profile.follows
        if (follows) {
          follows.forEach(usr => {
            if (usr && usr.url && usr.name) {
              var id = addUser(usr.url, usr.name, drive.version)
              crawl(id)
            }
          })
        }
        removePending(idx)
      })
    })
  })
}
function loadIndex (file) {
  if (!file) {
    users[0] = {url: 'dat://0393041397eee8a48dc452ba4544769b6d518233f10acb17c971703758fc408c', lastChecked: 0, lastVersion: -1, name: 'Fsteff'}
    ids[users[0].url] = 0
    crawl(0)
  } else {
    fs.readFile(file, (err, data) => {
      if (err) {
        console.error(err)
        loadIndex()
        return
      }
      try {
        users = JSON.parse(data)
        if (!users || users.length === 0) throw new Error('json parse error')
      } catch (err) {
        console.error(err)
        loadIndex()
        return
      }

      for (var i = 0; i < users.length; i++) {
        ids[users[i].url] = i
        crawl(i)
      }
    })
  }
}

function addUser (url, name, version) {
  var id = ids[url]
  if (typeof id !== 'number') {
    id = users.length
    ids[url] = id
    console.log('new user: ' + name)
  }
  users[id] = {url: url, name: name, lastChecked: 0, lastVersion: 0}
  return id
}

function removePending (item) {
  for (var i = pending.length; i--;) {
    if (pending[i] === item) {
      pending.splice(i, 1)
    }
  }
  console.log('pending: ' + pending.length)
  fs.writeFile(file, JSON.stringify(users), () => {})

  while (waiting.length > 0 && pending.length < maxPending) {
    crawl(waiting[0])
    waiting.splice(0, 1)
  }
}

function now () {
  return Math.round(new Date() / 1000)
}
