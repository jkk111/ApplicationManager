const fs = require('fs')
const conf_path = `${__dirname}/config.json`

let load_data = (path) => {
  return JSON.parse(fs.readFileSync(path))
}

let watch = (path, cb) => {
  let timeout = null;
  fs.watch(path, () => {
    if(timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      cb(load_data(path))
    }, 1000);
  })
}

class Config {
  constructor() {
    this.data = load_data(conf_path);
    watch(conf_path, data => {
      this.data = data;
    })
  }

  get(path) {
    let obj = this.data;
    path = path.split('.');

    while(path.length) {
      let next = path.shift();
      if(!obj[next]) {
        return null;
      }

      obj = obj[next];
    }

    return obj;
  }
}

module.exports = Config;