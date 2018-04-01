let blessed = require('blessed')

const BUF_SIZE = 20;


let build_screen = (screen) => {
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

let inst = null;

class Terminal {
  constructor() {
    this.screen = blessed.screen({
      smartCSR: true
    })

    this.input = build_screen(this.screen);
    this.screen.render();

    this.buf = [];
  }

  static Get() {
    if(inst) {
      return inst;
    }

    inst = new Terminal();
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

    let log_entry = blessed.box({
      width: '100%-2',
      height: 1,
      left: 1,
      content: log_str
    })
    buf.push(log_entry)
    this.screen.append(log_entry);
    this.update_log_positions()
  }

  command() {
    return new Promise(resolve => {
      this.input.focus();
      this.input.readInput((e, v) => {
        this.input.clearValue();
        this.screen.render();
        this.log('HOST', 'command', v)
        resolve(v);
      })
    })
  }
}

module.exports = Terminal;
