
(function() {
  var Promise, _, async, debug, fork, loopback, path;

  _ = require('lodash');

  debug = require('debug')('loopback-csv-example:upload');

  fork = require('child_process').fork;

  loopback = require('loopback');

  path = require('path');

  Promise = require('bluebird');

  async = require('async');

  module.exports = function(Model, options) {
    Model.upload = function(req, callback) {
      var Container, FileUpload, answer, containerName;
      Container = Model.app.models.Container;
      FileUpload = Model.app.models.FileUpload;
      containerName = Model.modelName + "-" + (Math.round(Date.now())) + "-" + (Math.round(Math.random() * 1000));
      answer = null;
      return async.waterfall([
        function(done) {
          return Container.createContainer({
            name: containerName
          }, done);
        }, function(container, done) {
          req.params.container = containerName;
          return Container.upload(req, {}, done);
        }
      ], function(err, uploadAnswer) {
        if (err) {
          return callback(err);
        }
        answer = uploadAnswer;
        return Model.create_file_upload().then(function(fileUpload) {
          return Model.fork_file_upload(answer, fileUpload);
        }).then(function(answer) {
          return callback(null, answer);
        })["catch"](function(err) {
          return callback(err);
        });
      });
    };
    Model.create_file_upload = function() {
      return Model.app.models.FileUpload.create({
        date: new Date(),
        fileType: Model.modelName,
        status: 'PENDING'
      });
    };
    Model.fork_file_upload = function(answer, fileUpload) {
      return new Promise(function(resolve, reject) {
        var params;
        if (Model.upload_extractParams) {
          params = Model.upload_extractParams(answer);
        } else {
          params = {};
        }
        params = _.merge(params, {
          model: Model.modelName,
          fileUpload: fileUpload.id,
          root: Model.app.datasources.container.settings.root,
          container: answer.files.req[0].container,
          file: answer.files.req[0].name
        });
        Model.upload_fork(params);
        return resolve(answer);
      });
    };
    Model.upload_fork = function(params) {
      return fork(__dirname + "/../../server/scripts/import-script.js", [JSON.stringify(params)]);
    };
    if (!Model.import_postprocess_hook) {
      Model.import_postprocess_hook = function(ctx, container, file, options) {
        return new Promise(function(resolve, reject) {
          return resolve();
        });
      };
    }
    Model["import"] = function(container, file, options, callback) {
      var ctx;
      debug('import', file, options);
      ctx = {};
      return Model.import_preprocess(ctx, container, file, options).then(function() {
        return Model.import_process(ctx, container, file, options);
      }).then(function() {
        return Model.import_postprocess_hook(ctx, container, file, options);
      }).then(function() {
        return ctx.transaction.commit(function(err) {
          return Model.exit_safely_after_success(ctx, container, file, options, callback);
        });
      })["catch"](function(err) {
        return ctx.transaction.rollback(function(rollbackError) {
          if (rollbackError) {
            console.error(rollbackError);
          }
          return Model.exit_safely_after_error(ctx, container, file, options, callback);
        });
      });
    };
    Model.exit_safely_after_success = function(ctx, container, file, options, callback) {
      return Model.import_postprocess('SUCCESS', ctx, container, file, options).then(function() {
        return Model.import_clean(ctx, container, file, options);
      }).then(function() {
        return callback();
      })["catch"](function(err) {
        return callback(err);
      });
    };
    Model.exit_safely_after_error = function(ctx, container, file, options, callback) {
      return Model.import_postprocess('ERROR', ctx, container, file, options).then(function() {
        return Model.import_clean(ctx, container, file, options);
      }).then(function() {
        return callback();
      })["catch"](function(err) {
        return callback(err);
      });
    };
    Model.import_preprocess = function(ctx, container, file, options) {
      debug('import_preprocess', file, options);
      return new Promise(function(resolve, reject) {
        return Model.beginTransaction({
          isolationLevel: Model.Transaction.READ_UNCOMMITTED
        }, function(err, transaction) {
          ctx.transaction = transaction;
          if (err) {
            return reject(err);
          }
          return resolve();
        });
      });
    };
    Model.import_postprocess = function(status, ctx, container, file, options) {
      return new Promise(function(resolve, reject) {
        debug('import_postprocess', status, file, options);
        return Model.app.models.FileUpload.findById(options.fileUpload).then(function(fileUpload) {
          fileUpload.status = status;
          return fileUpload.save(function(err, data) {
            return resolve(data);
          });
        })["catch"](function(err) {
          return reject(err);
        });
      });
    };
    Model.import_clean = function(ctx, container, file, options) {
      debug('import_clean', file, options);
      return new Promise(function(resolve, reject) {
        return Model.app.models.Container.destroyContainer(container, function(err, data) {
          if (err) {
            return reject(err);
          }
          return resolve(data);
        });
      });
    };
    if (!Model.import_handleLine) {
      Model.import_handleLine = function(ctx, line, options) {
        return new Promise(function(resolve, reject) {
          return resolve();
        });
      };
    }
    Model.importLine = function(line, index, ctx, options, errors) {
      if (line == null) {
        return;
      }
      return Model.import_handleLine(ctx, line, options)["catch"](function(err) {
        if (err.status !== 422) {
          throw err;
        }
        errors.push(err);
        return Model.app.models.FileUploadError.create({
          line: index + 2,
          message: err.message,
          fileUploadId: options.fileUpload
        });
      });
    };
    Model.import_mapHandleLine = function(ctx, fileContent, options) {
      debug('import_mapHandleLine');
      return new Promise(function(resolve, reject) {
        var errors;
        errors = [];
        return Promise.mapSeries(fileContent, function(line, index) {
          debug('importLine of index: ', index);
          return Model.importLine(line, index, ctx, options, errors);
        })["catch"](function(unexpectedError) {
          debug('unexpectedError', unexpectedError);
          if (unexpectedError) {
            return reject(unexpectedError);
          }
        }).then(function() {
          debug('errors', errors);
          if (errors.length > 0) {
            return reject(errors);
          }
          debug('all lines imported');
          return resolve();
        });
      });
    };
    Model.handle_import_error = function(error, options, callback) {
      if (_.isArray(error)) {
        return callback(error);
      }
      return Model.app.models.FileUploadError.create({
        line: null,
        message: error.message,
        fileUploadId: options.fileUpload
      }).then(function(data) {
        return callback(data);
      })["catch"](function(err) {
        return callback(err);
      });
    };
  };

}).call(this);
