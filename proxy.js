let http = require("http")
let Rules = require('./proxy-rules')
let httpProxy = require('http-proxy')
let Terminal = require('./terminal')
let terminal = Terminal.Get();
const httpAgent = http.globalAgent

class Proxy {
  constructor() {
    this.proxies = {};
    this.getMatches = this.getMatches.bind(this);
    this.addProxy = this.addProxy.bind(this);
    this.proxyRequest = this.proxyRequest.bind(this);
    this.proxyWebsocketRequest = this.proxyWebsocketRequest.bind(this);
    this.proxy = httpProxy.createProxy({
      agent: httpAgent,
      autoRewrite: true
    });
  }

  proxyRequest(req, res) {
    let { authorization } = req.headers;

    if(!authorization || authorization) {
      let url = req.url;
      let mode = 'Basic';

      if(url.includes('?')) {
        let qs = url.slice(url.indexOf('?') + 1);
        let params = qs.split('&');
        let obj = {}
        params = params.forEach(param => {
          let [ key, value = '' ] = param.split('=');
          obj[key] = value;
        })

        if(obj.mode) {
          mode = obj.mode;
        }
      }



      res.writeHead(401, {
        'WWW-Authenticate': `${mode} realm=Secure Content`
      });
      res.end("denied");
      return;
    }

    let target = this.getMatches(req);
    if(target) {
      this.proxy.web(req, res, {
        target: {
          socketPath: target
        }
      }, (e) => {
        terminal.log('HOST', 'Proxy Error', `Failed To Proxy ${target}`);
        // console.log(e);
        res.writeHead('503', { "Content-Type": "text/html" });
        res.end(`Could not proxy ${target}`);
      })
    } else {
      res.writeHead("404", { "Content-Type": "text/plain" });
      res.end("Unknown url, please double check the url and try again later!");
    }
  }

  proxyWebsocketRequest(req, socket, head) {
    var target = this.getMatches(req);
    this.proxy.ws(req, socket, head, {
      target: {
        socketPath: target
      }
    }, (e) => {});
  }

  getMatches(req) {
    var proxyPaths = this.proxies
    var baseScore = 0, wildScore = 0;
    var basePrefix, wildPrefix;

    let host = req.headers.host.split(":")[0]

    var base = proxyPaths[host];
    if(base) base = base.match(req);
    if(base)  {
      baseScore = base.strength;
      basePrefix = base.bestPrefix;
      base = base.match;
    }
    var wild = proxyPaths["*"];
    if(wild) wild = wild.match(req);
    if(wild) {
      wildScore = wild.strength;
      wildPrefix = wild.bestPrefix;
      wild = wild.match;
    }
    if(wildScore > baseScore) {
      if(wildPrefix)
        req.url = req.url.slice(wildPrefix.length);
      if(req.url.charAt(0) != "/")
        req.url = "/" + req.url;
      return wild;
    }
    if(basePrefix)
      req.url = req.url.slice(basePrefix.length);
    if(req.url.charAt(0) != "/")
      req.url = "/" + req.url;
    return base;
  }

  addProxy(domain, path, dest) {
    if(!this.proxies[domain]) {
      this.proxies[domain] = new Rules({
        rules: {}
      })
    }
    this.proxies[domain].rules[path] = dest;
  }
}

module.exports = Proxy

