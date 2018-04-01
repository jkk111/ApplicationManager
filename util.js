let mysql = require('mysql2');
let crypto = require('crypto')
let os = require('os')
let fs = require('fs')
let { spawn, exec, execSync } = require('child_process')
require('colors');
let Database = require('./database');
let AppConfig = Database.Get('AppConfig');
let Terminal = require('./terminal');
let terminal = Terminal.Get();

try {
  fs.mkdirSync(`${__dirname}/apps`);
} catch(e) {}

let expand_app_var = (str, id, domain) => {
  return str
  .replace(/\${__dirname}/g, __dirname)
  .replace(/\${__base_domain__}/g, domain)
  .replace(/\${__app_id__}/g, id);
}

let get_app_vars = async(id) => {
  let vars = await AppConfig.get('vars', {});
  vars = vars.map(v => {
    v.value = expand_app_var(v.value, id)
    return v;
  })

  let parsed = {};
  vars.forEach(v => {
    parsed[v.name] = v.value;
  })
  return parsed
}

let compute_app_path = (id) => `${__dirname}/apps/${id}`;

let git_pull = (id) => {
  return new Promise(resolve => {
    let path = compute_app_path(id);
    let proc = exec('git pull', {
      cwd: path
    });

    proc.stdout.on('data', (d) => {
      d = d.toString();
      terminal.log(id, 'git log', d)
    })

    proc.on('close', () => {
      resolve()
    })
  })
}

let fetch_app = (repo, id) => {
  if(!id) {
    id = random_id(16);
  }
  return new Promise((resolve) => {
    terminal.log('HOST', 'info', 'Fetching'.blue, repo)
    let path = compute_app_path(id);
    let proc = exec(`git clone ${repo} ${path}`)

    proc.on('close', (code) => {
      if(code == 0) {
        terminal.log('HOST', 'info', 'Fetch Success'.green)
        resolve(id);
      } else {
        terminal.log('HOST', 'info', 'Fetch Fail'.red)
        resolve(false);
      }
    })
  });
}

let load_config = (id) => {
  let path = compute_app_path(id)
  let config_path = `${path}/config.json`
  try {
    return JSON.parse(fs.readFileSync(config_path))
  } catch(e) {
    terminal.log('HOST', 'info', 'Loading Config Failed'.red + " " + e.message)
    return false;
  }
}

let install_node_app = (id) => {
  return new Promise((resolve) => {
    let path = compute_app_path(id);
    terminal.log('HOST', 'info', 'Installing'.blue, id)
    let proc = exec('npm install' , {
      cwd: path
    })

    proc.on('close', code => {
      if(code === 0) {
        terminal.log('HOST', 'info', 'Install Success'.green)
        resolve(true);
      } else {
        terminal.log('HOST', 'info', 'Install Fail'.red)
        resolve(false);
      }
    })
  })
}

let install_other_app = (id, command) => {
  return new Promise(resolve => {
    let path = compute_app_path(id);
    let proc = exec(command, { cwd: path })

    proc.on('close', code => {
      resolve(code === 0)
    })
  })
}

let install_app = (id) => {
  return new Promise(async(resolve) => {
    let path = compute_app_path(id);
    let success = true;
    let config = load_config(id);
    let node_app = config.node_app;


    if(!config) {
      return resolve(false);
    }

    if(node_app) {
      success = await install_node_app(id);
    } else {
      success = await install_other_app(id, command);
    }

    resolve(success);
  });
}

let start_node_app = (id, app_vars) => {
  let path = compute_app_path(id);
  let pkg = JSON.parse(fs.readFileSync(`${path}/package.json`));
  let start_script = pkg.scripts.start;
  let args = start_script.split(' ');
  let cmd = args[0]
  let proc = spawn(cmd, args.slice(1), {
    cwd: path,
    detacthed: false,
    env: Object.assign(process.env, app_vars, {
      socket: get_socket(id)
    })
  })

  proc.on('exit', (code) => {
    terminal.log(id, 'exit', `${code}`)
  })

  proc.stdout.on('data', (d) => {
    d = d.toString();
    terminal.log(id, 'log', d)
  })

  proc.stderr.on('data', (d) => {
    d = d.toString();
    terminal.log(id, 'error', d)
  })

  return proc;
}

let start_other_app = (id, command) => {
  let path = compute_app_path(id);
  let proc = exec(command, {
    cwd: path
  })
}

let start_app = (id) => {
  return new Promise(async(resolve) => {
    let path = compute_app_path(id);
    await git_pull(id);
    let config = load_config(id);

    if(!config) {
      return resolve(false);
    }

    let node_app = config.node_app;

    let vars = await get_app_vars(id);

    let start_str = '[Starting]'.blue + ' ' + id;

    terminal.log('HOST', 'info', start_str)

    if(node_app) {
      resolve(start_node_app(id, vars));
    } else {
      resolve(start_other_app(id));
    }
  })
}

let get_socket = (id) => {
  if(os.platform() === 'win32') {
    return `\\\\.\\pipe\\${id}`
  } else {
    return `/var/run/${id}`
  }
}

let random_id = (len = 8) => {
  return crypto.randomBytes(len).toString('hex')
}

let clear_apps = () => {
  if(os.platform() === 'win32') {
    execSync('del /s /q apps', { stdio: 'ignore' });
    execSync('rmdir /s /q apps', { stdio: 'ignore' });
  } else {
    execSync(`rm -rf ${__dirname}/apps`, { stdio: 'ignore' });
  }
}

let clone_apps = async() => {
  try {
    fs.mkdirSync(`${__dirname}/apps`);
  } catch(e) {}

  let apps = await AppConfig.get('apps');

  for(var app of apps) {
    await fetch_app(app.repo, app.app_id)
  }
}

module.exports = {
  get_socket,
  random_id,
  fetch_app,
  install_app,
  start_app,
  load_config,
  compute_app_path,
  clear_apps,
  clone_apps
}
