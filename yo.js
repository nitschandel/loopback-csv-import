// Generated by CoffeeScript 1.12.6
(function() {
  var app, boot, loopback;

  loopback = require('loopback');

  boot = require('loopback-boot');

  app = module.exports = loopback();

  app.start = function() {
    return app.listen(function() {
      app.emit('started');
      logger.info('Web server listening at: %s', app.get('url'));
    });
  };

  boot(app, __dirname, function(err) {
    if (err) {
      throw err;
    }
    require('loopback-promisify')(app);
    if (require.main === module) {
      app.start();
    }
  });

}).call(this);
