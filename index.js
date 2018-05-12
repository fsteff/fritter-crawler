const fs = require('fs')
const Dat = require('dat-node')

const startTime = now()
const maxPending = 100

var users = []
var ids = []

var pending = []
var waiting = []
var file = './users.json'
loadIndex(file)

function crawl (idx) {
  const user = users[idx]
  if (!user || typeof user.lastChecked !== 'number' || user.lastChecked > startTime) return

  const url = users[idx].url
  user.lastChecked = now()

  if (pending.length > maxPending) {
    waiting.push(idx)
    return
  }

  pending.push(idx)

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
        dat.close()
        return
      }

      const drive = dat.archive
      if (drive.version <= user.lastVersion && user.name.length < 64) {
          console.log('user "' + user.name + '" is up-to-date')
          removePending(idx)
          dat.close()
          return
      }
      console.log('reading profile.json for user ' + user.name)
      drive.readFile('profile.json', {encoding: 'utf-8'}, (err, profile) => {
        if (err) {
          console.warn('Could not read profile.json for user ' + user.name)
          removePending(idx)
          dat.close()
          return
        }
        try {
          profile = JSON.parse(profile)
        } catch (err) {
          console.warn('invalid json: ' + err)
          removePending(idx)
          dat.close()
          return
        }
        console.log('loaded profile for user ' + user.name)

        user.name = profile.name
        user.lastVersion = drive.version
        const follows = profile.follows
        if (follows) {
          follows.forEach(usr => {
            if (usr && usr.url && usr.name) {
              var id = addUser(usr.url, usr.name, 0)
              crawl(id)
            }
          })
        }
        removePending(idx)
        fs.writeFile(file, JSON.stringify(users), () => {})
        dat.close()
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
    users[id] = {url: url, name: name, lastChecked: 0, lastVersion: 0}
    console.log('new user: ' + name)
  }
  if(version > users[id].lastVersion)
      users[id].lastVersion = version;
  if(name !== users[id].name)
      users[id].name = name
  
  return id
}

function removePending (item) {
  var done = false
  for (var i = 0; i < pending.length && !done; i++) {
    if (pending[i] === item) {
      pending.splice(i, 1)
      done = true
    }
  }
  
  while (waiting.length > 0 && pending.length < maxPending) {
    crawl(waiting[0])
    waiting.splice(0, 1)
  }
  console.log('pending: ' + pending.length + ", waiting: " + waiting.length)
}

function now () {
  return Math.round(new Date() / 1000)
}

process.on('exit', () => {
  console.log('bye, until next time!')
})