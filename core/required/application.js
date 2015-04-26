module.exports = (function() {

  var Database = require('./db/database.js');
  var Router = require('./router.js')(Application);
  var SocketServer = require('./socket.js');
  var Template = require('./template.js');

  var dot = require('dot');
  var fs = require('fs');
  var http = require('http');
  var httpProxy = require('http-proxy');
  var mime = require('mime-types');

  dot.templateSettings.varname = 'template';

  function Application() {

    this._router = new Router(this);
    this._server = null;
    this._proxy = null;

    this._templates = {
      '!': new Template(this, function() { return '<!-- Invalid Template //-->'; })
    };

    this._static = {};

    this._db = {};

    this.socket = null;

  }

  Application.prototype.static = function(name) {

    if(this._static[name]) {
      return this._static[name];
    }

    var filename = './static/' + name;

    try {
      this._static[name] = {
        mime: mime.lookup(filename) || 'application/octet-stream',
        buffer: fs.readFileSync(filename)
      };
      return this._static[name];
    } catch(e) {
      return null;
    }

    return null;

  };

  Application.prototype.addDatabase = function(alias, connectionDetails) {

    var db = new Database();
    db.connect(connectionDetails);

    if (this._db[alias]) {
      throw new Error('Database aliased with "' + alias + '" already added to application.');
    }

    this._db[alias] = db;

    return true;

  };

  Application.prototype.db = function(alias) {

    return this._db[alias] || null;

  };

  Application.prototype.template = function(name) {

    if(this._templates[name]) {
      return this._templates[name];
    }

    var filename = './app/templates/' + name + '.html';

    var contents;
    try {
      contents = fs.readFileSync(filename);
      this._templates[name] = new Template(this, dot.template(contents));
      return this._templates[name];
    } catch(e) {
      console.log('Could not load template ' + name);
    }
    return this._templates['!'];

  };

  Application.prototype._proxyWebSocketRequests = function() {

    if (this._server && this.socket && !this._proxy) {

      this._proxy = httpProxy.createProxyServer({ws: true});

      this._server.on('upgrade', (function (req, socket, head) {
        this._proxy.ws(req, socket, head, {target: 'ws://localhost:' + this.socket._port});
      }).bind(this));

    }

    return true;

  };

  Application.prototype.listen = function(port) {

    if (this._server) {
      console.error('HTTP server already listening');
      return;
    }

    this._server = http.createServer(this._router.execute.bind(this._router)).listen(port);

    this._proxyWebSocketRequests();

    console.log('Nodal HTTP server listening on port ' + port);

    return true;

  };

  Application.prototype.route = function() {
    this._router.route.apply(this._router, arguments);
  };

  Application.prototype.socketListen = function(port) {

    if (this.socket) {
      console.error('WebSocket server already listening');
      return;
    }

    this.socket = new SocketServer(port);

    this._proxyWebSocketRequests();

    console.log('Nodal WebSocket server listening on port ' + port);

    return true;

  };

  Application.prototype.command = function() {
    if(!this.socket) {
      throw new Error('Application must socketListen before it can use commands');
    }
    this.socket.command.apply(this.socket, arguments);
  };

  return Application;

})();
