let fs = require('fs')
let sql = require('mysql2');
let Config = require('./config')
let config = new Config();
let Terminal = require('./terminal');
let terminal = Terminal.Get();

let construct_select_query = (table, keys = '*', params = {}, extra = '') => {
  if(Array.isArray(keys)) {
    keys = keys.join(', ');
  }

  let WHERE = ''

  let params_keys = Object.keys(params)
  if(params_keys && params_keys.length > 0) {
    WHERE = 'WHERE '
    let first = true;
    for(var key in params) {
      let param = params[key];

      param.comparator = param.comparator || '='

      if(!first)
        WHERE += ' AND ';
      first = false;
      WHERE += `${key} ${param.comparator} :${key}`
    }
  }

  return `SELECT ${keys} FROM ${table} ${WHERE} ${extra}`
}

let construct_insert_query = (table, params, extra = '') => {
  let keys = [];
  for(var key in params) {
    keys.push(key);
  }
  let keys_mapped = keys.map(key => `:${key}`)

  return `INSERT INTO ${table} (${keys.join(', ')}) VALUES(${keys_mapped.join(', ')}) ${extra}`;
}

let map_params = (params) => {
  let mapped = {};
  for(var param in params) {
    mapped[`${param}`] = params[param].value
  }
  return mapped
}

const CREATE_TABLE = (table) => {
  let keys = [
    'id INT PRIMARY KEY AUTO_INCREMENT'
  ]

  for(var key in table.keys) {
    let str = `${key} ${table.keys[key]}`
    keys.push(str);
  }

  keys = keys.join(',\n');

  return `CREATE TABLE IF NOT EXISTS ${table.name} ( ${keys} )`
}

const CREATE_DB = (name) => `CREATE DATABASE IF NOT EXISTS ${name}`

let change_db = (conn, name) => {
  return new Promise(resolve => {
    conn.changeUser({ database: name }, () => {
      terminal.log('HOST', 'log', 'Database Changed To'.green, name.yellow)
      resolve();
    })
  });
}

let run_query = (conn, query, args = []) => {
  return new Promise((resolve) => {
    conn.query(query, args, (err, data) => {
      if(err) {
        console.error('[ERROR]'.red, query, args, err)
        resolve(false)
      } else {
        resolve(data);
      }
    })
  })
}

let schema_cache = null;

let load_schema = (name) => {
  let schema_path = `${__dirname}/schemas/${name}_schema.json`;
  return JSON.parse(fs.readFileSync(schema_path))
}

let DatabaseCache = {};

class Database {
  constructor(name) {
    this.schema = load_schema(name);
    this.ready = false;
    this.name = name;
    this.waiting = [];
    DatabaseCache[name] = this;

    this.prepare = this.prepare.bind(this);
    this.reload = this.reload.bind(this);
    this.get = this.get.bind(this);
    this.add = this.add.bind(this);
  }

  static Get(name) {
    if(DatabaseCache[name]) {
      return DatabaseCache[name];
    } else {
      console.warn("Database %s not ready", name.blue)
    }
    let db = new Database(name);
    return db;
  }

  prepare() {
    return new Promise(async(resolve) => {
      if(this.ready) {
        return resolve();
      }

      if(this.preparing) {
        this.waiting.push(resolve);
        return;
      }

      this.preparing = true;

      let conn = sql.createConnection({
        user: config.get('db_user'),
        password: config.get('db_pass'),
        namedPlaceholders: true
      })

      if(this.conn) {
        this.conn.end();
      }

      this.conn = conn;

      await run_query(conn, CREATE_DB(this.name));
      await change_db(conn, this.name);

      for(var table of this.schema) {
        let query = CREATE_TABLE(table);
        await run_query(conn, query);
      }

      this.ready = true;
      this.preparing = false;
      resolve();

      while(this.waiting.length) {
        let res = this.waiting.pop();
        res();
      }
    });
  }

  reload() {
    this.ready = false;
    this.schema = load_schema(this.name);
  }

  async get(table, select, keys = '*', extra = '') {
    await this.prepare();
    for(var key in select) {
      var param = select[key]
      if(typeof param !== 'object') {
        param = {
          value: param
        }
      }
      select[key] = param
    }
    let query = construct_select_query(table, keys, select, extra)
    return run_query(this.conn, query, map_params(select));
  }

  async add(table, params, extra) {
    await this.prepare();
    let query = construct_insert_query(table, params, extra);

    let mapped_params = {};
    for(var param in params) {
      mapped_params[`${param}`] = params[param];
    }

    return run_query(this.conn, query, mapped_params);
  }

  async query(q) {
    await this.prepare();

    run_query(this.conn, q, [])
  }
}

module.exports = Database
