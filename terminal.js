let blessed = require('blessed')
let fs = require('fs')
const BUF_SIZE = 20;

try {
  fs.mkdirSync(`${__dirname}/logs`)
} catch(e) {
  if(e.code !== 'EEXIST') {
    throw e;
  }
}


let build_screen = (screen) => {
  if(screen.headless) {
    return {
      focus: () => {},
      readInput: () => 'ace'
    }
  }
  let log = blessed.box({
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    content: 'hello',
    border: {
      type: 'bg'
    },
    style: {
      border: {
        bg: 'green'
      }
    }
  })

  let input = blessed.textbox({
    top: '100%-3',
    left: 0,
    width: '100%',
    height: 3,
    border: {
      type: 'bg'
    },
    style: {
      border: {
        bg: 'green'
      }
    }
  })

  let output = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-4',
    border: {
      type: 'bg'
    },
    style: {
      border: {
        bg: 'green'
      }
    }
  })

  screen.key(['escape', 'C-c'], function(ch, key) {
    return process.exit(0);
  });

  input.key(['escape', 'C-c'], function(ch, key) {
    return process.exit(0);
  });

  screen.append(log);
  screen.append(input);
  input.focus();

  return input
}

let screen = (headless) => {
  if(headless) {
    return {
      headless: true,
      render: () => {},
      append: () => {}
    }
  } else {
    return blessed.screen({
      smartCSR: true
    })
  }
}

let box = (headless, log_str) => {
  if(headless) {
    return {}
  }

  return blessed.box({
    width: '100%-2',
    height: 1,
    left: 1,
    content: log_str
  })
}

let hiddeninput = () => {
  let input = blessed.textbox({
    hidden: true,
    top: '100%-3',
    left: 0,
    width: '100%',
    height: 3,
    border: {
      type: 'bg'
    },
    style: {
      border: {
        bg: 'green'
      }
    }
  })

  input.key(['escape', 'C-c'], function(ch, key) {
    return process.exit(0);
  });

  return input
}

let inst = null;

class Terminal {
  constructor(headless) {
    this.headless = headless;
    this.screen = screen(headless);

    this.input = build_screen(this.screen);
    this.hiddeninput = hiddeninput();

    this.hiddeninput.on('keypress', (e) => {
      process.nextTick(() => {
        this.password_preview = ''.padStart(this.hiddeninput.getValue().length, '*');
        this.input.setValue('Password: ' + this.password_preview)
        this.screen.render()
      })
    })

    this.screen.append(this.hiddeninput);
    this.screen.render();

    this.buf = [];
    this.out_log = fs.createWriteStream(`${__dirname}/logs/${Date.now()}.log`);
  }

  static Get() {
    if(inst) {
      return inst;
    }

    inst = new Terminal(process.argv.indexOf('headless') > -1);
    return inst;
  }

  update_log_positions() {
    let { buf } = this;
    buf = buf.slice().reverse();
    let neg_x = 4;
    for(var item of buf) {
      item.top = `100%-${neg_x}`
      neg_x++;
    }
    this.screen.render()
  }

  log(app, type, str) {
    if(this.destroyed)
      return;
    if(typeof str === 'object') {
      return this.log(app, type, JSON.stringify(str, null, '  '))
    }
    if(str.trim().length === 0) {
      return
    }
    let lines = str.split('\n');

    if(lines.length > 1) {
      for(var line of lines) {
        this.log(app, type, line);
      }
      return;
    }
    let max_width = this.screen.width - (5 + app.length + type.length + 6);

    if(str.length > max_width) {
      let i = 0;
      while(i < str.length) {
        let substr = str.slice(i, i + max_width);
        i += substr.length;
        this.log(app, type, substr);
      }

      return;
    }

    let { buf } = this;
    if(buf.length >= BUF_SIZE) {
      let item = buf.shift();
      this.screen.remove(item);
    }

    let app_str = `[${app}]`.blue;
    let type_str = `[${type}]`.green;
    let log_str = `${app_str}${type_str} ${str}`

    let log_entry = box(this.headless, log_str);

    if(this.headless) {
      console.log(log_str)
    }

    this.out_log.write(log_str)
    this.out_log.write('\n');

    buf.push(log_entry)
    this.screen.append(log_entry);
    this.update_log_positions()
  }

  password() {
    return new Promise(resolve => {
      this.input.setValue('Password: ');
      this.hiddeninput.focus();
      this.screen.render();
      this.hiddeninput.readInput((e, v) => {
        this.hiddeninput.clearValue();
        this.input.setValue('');
        this.screen.render();
        this.log('HOST', 'password', '*****')
        resolve(v);
      })
    })
  }

  command() {
    return new Promise(resolve => {
      this.input.focus();
      this.input.setValue('')
      this.input.readInput((e, v) => {
        this.input.setValue('');
        this.screen.render();
        this.log('HOST', 'command', v)
        resolve(v);
      })
    })
  }

  destroy() {
    this.screen.destroy();
    this.destroyed = true;
    inst = null;
  }
}

module.exports = Terminal;
