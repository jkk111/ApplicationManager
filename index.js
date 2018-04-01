let crypto = require('crypto')
let { get_socket, random_id, fetch_app, install_app, start_app, compute_app_path, load_config, clear_apps, clone_apps } = require('./util')
let HTTPProxy = require('./proxy')
require('./debug.js')
require('colors')
let Database = require('./database');
let AppConfig = Database.Get('AppConfig')
let Terminal = require('./terminal');
let terminal = Terminal.Get();
let http = require('http')
let fs = require('fs')

class AppServer {
  constructor(port = 8080, addr = '0.0.0.0') {
    this.addr = addr;
    this.port = port;
    this.proxy = new HTTPProxy();
    this.routes = {};
    this.procs = {};

    this.handleConnection = this.handleConnection.bind(this);
    this.server = http.createServer(this.handleConnection);
    this.server.on('upgrade', (req, socket, head) => {
      this.proxy.proxyWebsocketRequest(req, socket, head)
    })

    let keys = [ 'handleConnection', 'ready', 'listen', 'start', 'stop', 'add']

    for(var key of keys) {
      this[key] = this[key].bind(this);
    }
  }

  static async Init() {
    let [ port ] = await AppConfig.get('vars', { name: 'APP_SERVER_PORT' }, 'value');
    port = (port || {}).value
    let server = new AppServer(port || 8080);
    server.listen();
    return server;
  }

  handleConnection(req, res) {
    this.proxy.proxyRequest(req, res);
  }

  ready() {
    terminal.log('HOST', 'info', 'Ready')
  }

  async listen() {
    let { addr, port } = this;
    this.server.listen(port, addr, this.ready);

    let enabled = await AppConfig.get('apps', { enabled: true }, 'app_id')
    terminal.log('HOST', 'info', 'Starting ' + enabled.length + ' processes');
    for(var service of enabled) {
      this.start(service.app_id)
    }
  }

  async start(app_id) {
    if(!app_id) {
      return terminal.log('HOST', 'ERROR', 'app_id Must Be Specified')
    }
    let [ app ] = await AppConfig.get('apps', { app_id }, '*')
    let config = load_config(app_id);

    let { routes = [] } = config;

    let dest_socket = get_socket(app_id);

    for(var route of routes) {
      let { domain, path } = route;
      if(domain && path) {
        this.proxy.addProxy(domain, path, dest_socket)
      }
    }

    this.procs[app_id] = await start_app(app_id);
  }

  stop(id) {
    if(this.procs[id]) {
      this.procs[id].kill('SIGTERM');
      this.procs[id].kill('SIGINT');
      this.procs[id].kill('SIGKILL');
    }
  }

  destroy() {
    for(var item in this.procs) {
      this.stop(item);
    }
    this.server.close()
  }

  async add(repo) {
    if(!repo) {
      return terminal.log('HOST', 'ERROR', 'Missing Repo')
    }
    let app = await AppConfig.get('apps', { repo }, '*')

    if(app.length > 0) {
      let app_id = app[0].app_id
      if(this.procs[app_id]) {
        return terminal.log('HOST', 'info', app_id + ' Already Running');
      } else {
        terminal.log('HOST', 'info', 'Staring Prepared Serivce ' + app[0].app_id)
      }
      let config = load_config(app_id)
      let { route = {} } = config;
      let { domain = null, path = null } = route;

      if(config.route) {
        let dest_socket = get_socket(app_id)
        this.proxy.addProxy(domain, path, dest_socket);
      }

      this.procs[app_id] = await start_app(app_id)
      return
    }

    let app_id = await fetch_app(repo);
    if(app_id) {
      let success = await install_app(app_id);
      let resp = { success }
      if(success === false) {
        resp.reason = 'INSTALL'

      } else {
        resp.id = app_id
        let config = load_config(app_id)
        let { route = {} } = config;
        let { domain = null, path = null } = route;

        if(config.route) {
          let dest_socket = get_socket(app_id)
          this.proxy.addProxy(domain, path, dest_socket);
        }

        this.procs[app_id] = await start_app(app_id)

        AppConfig.add('apps', {
          app_id,
          repo,
          domain,
          path
        })
      }
      return resp;
    }
    return { success: false, reason: 'FETCH' };
  }
}

let server = null;

let cleanup = (server) => () => {
  for(var proc_id in server.procs) {
    server.stop(proc_id)
  }
  process.exit(0);
}

class CommandHandler {
  constructor() {
    this.handlers = {}
  }

  on(command, cb) {
    this.handlers[command] = cb;
  }

  handle(command) {
    let args = command.trim().match(/\\?.|^$/g).reduce((p, c) => {
      if(c === '"' || c === '\'') {
          p.quote ^= 1;
      } else if(!p.quote && c === ' ') {
          p.a.push('');
      } else {
          p.a[p.a.length - 1] += c.replace(/\\(.)/,"$1");
      }
      return  p;
    }, {a: ['']}).a
    terminal.log('HOST', 'INFO', args.join(', '))
    let [ cmd ] = args;
    let cb = this.handlers[cmd];

    if(cb) {
      cb(...args.slice(1))
    }
  }
}

let list_apps = async(offset = 0) => {
  offset = parseInt(offset)
  if(isNaN(offset)) {
    return terminal.log('HOST', 'ERROR', 'Offset Must Be A Number');
  }
  let apps = await AppConfig.get('apps', {}, 'app_id, repo, enabled', `LIMIT ${offset}, 10`)
  terminal.log('HOST', 'info', apps.map(app => JSON.stringify(app)).join('\n'))
}

let add_var = async(name, value = null) => {
  terminal.log('HOST', 'INFO', `'${name}' '${value}'`)
  if(!name || value === null) {
    return terminal.log('HOST', 'ERROR', 'Usage apps <variable> <value>')
  }

  await AppConfig.add('vars', { name, value });
}

let list_vars = async(offset) => {
  if(!offset) {
    offset = 0;
  }

  let vars = await AppConfig.get('vars', {}, 'name, value', `LIMIT ${offset}, 10`)
  terminal.log('HOST', 'INFO', vars.map(({ name, value }) => `Name: ${name}, Value: ${value}`).join('\n'))
}

let reload = async() => {
  server.destroy();
  server = await AppServer.Init();
}

let export_setup = async() => {
  let vars = await AppConfig.get('vars', {});
  let apps = await AppConfig.get('apps', {})
  let data = { vars, apps };

  let v_count = vars.length;
  let a_count = apps.length;

  let out_path = `${__dirname}/man_conf.json`

  let export_string = `Exported ${v_count} Vars, ${a_count} Apps to: "${out_path}"`
  fs.writeFileSync(out_path, JSON.stringify(data, null, '  '))
  terminal.log('HOST', 'INFO', export_string)
};

let import_setup = async() => {
  let path = `${__dirname}/man_conf.json`;
  try {
    let data = fs.readFileSync(path);
    data = JSON.parse(data);

    let { apps, vars } = data;

    await AppConfig.query('TRUNCATE apps');
    await AppConfig.query('TRUNCATE vars');

    for(var proc in server.procs) {
      server.stop(proc);
    }

    for(var v of vars) {
      await AppConfig.add('vars', v);
    }

    for(var app of apps) {
      await AppConfig.add('apps', app);
    }

    await clear_apps();
    await clone_apps();

    for(var app of apps) {
      server.start(app.app_id)
    }

  } catch(e) {
    terminal.log('HOST', 'ERROR', 'Error Importing configuration: ' + e.message)
  }
};

let runner = async() => {
  let ch = new CommandHandler();
  ch.on('exit', cleanup(server));
  ch.on('add', server.add);
  ch.on('start', server.start);
  ch.on('stop', server.stop);
  ch.on('apps', list_apps)
  ch.on('var', add_var)
  ch.on('vars', list_vars)
  ch.on('reload', reload)
  ch.on('export', export_setup)
  ch.on('import', import_setup)
  while(true) {
    let command = await terminal.command();
    ch.handle(command);
  }
}

AppServer.Init().then(srv => {
  server = srv;
  runner();
})
