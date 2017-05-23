
  var Promise, _, async, charsetDetector, csv, debug, fs, iconv, importService, magic, path;

  _ = require('lodash');

  async = require('async');

  csv = require('fast-csv');

  debug = require('debug')('loopback-csv-example:csv-upload');

  fs = require('fs');

  iconv = require('iconv-lite');

  charsetDetector = require('node-icu-charset-detector');

  magic = require('mmmagic');

  path = require('path');

  Promise = require('bluebird');

  importService = require('../../server/services/import-utils');

  module.exports = function(Model, options) {
    var detectFileEncoding;
    if (!Model.import_validateLine) {
      Model.import_validateLine = function(line) {
        if (options != null ? options.validators : void 0) {
          return importService.validate(line, options.validators);
        }
        return new Promise(function(resolve, reject) {
          return resolve();
        });
      };
    }
    detectFileEncoding = function(file) {
      var buffer, charset;
      buffer = fs.readFileSync(file);
      charset = charsetDetector.detectCharset(buffer);
      return charset.toString();
    };
    Model.check_file_type = function(fileType) {
      return new Promise(function(resolve, reject) {
        if (/application\/(csv|excel|vnd\.msexcel|vnd\.ms\-excel)|text\/plain/g.test(fileType)) {
          return resolve();
        } else {
          return reject({
            message: 'File is not a valid csv'
          });
        }
      });
    };
    Model.getCsvStream = function(options) {
      var stream;
      if (options) {
        return csv(options);
      }
      stream = csv({
        delimiter: ';',
        headers: true,
        trim: true,
        ignoreEmpty: true
      });
      return stream;
    };
    Model.handleCsvStream = function(ctx, filename, options, callback) {
      var encoding, err, fileContent, stream;
      fileContent = [];
      stream = Model.getCsvStream();
      stream.on('data', function(data) {
        return fileContent.push(data);
      });
      stream.on('error', function(error) {
        return Model.handle_import_error(error, options, callback);
      });
      stream.on('end', function() {
        return Model.import_mapHandleLine(ctx, fileContent, options).then(function() {
          return callback();
        })["catch"](function(error) {
          return Model.handle_import_error(error, options, callback);
        });
      });
      try {
        encoding = detectFileEncoding(filename);
        return fs.createReadStream(filename).pipe(iconv.decodeStream(encoding)).pipe(stream);
      } catch (error1) {
        err = error1;
        return Model.handle_import_error(err, options, callback);
      }
    };
    return Model.import_process = function(ctx, container, file, options, callback) {
      debug('import_process', file, options);
      return new Promise(function(resolve, reject) {
        var filename, m;
        filename = path.join(Model.app.datasources.container.settings.root, container, file);
        m = new magic.Magic(magic.MAGIC_MIME_TYPE);
        m.detectFileSync = Promise.promisify(m.detectFile.bind(m));
        return m.detectFileSync(filename).then(function(fileType) {
          return Model.check_file_type(fileType);
        }).then(function() {
          return Model.handleCsvStream(ctx, filename, options, function(err) {
            if (err) {
              return reject(err);
            }
            return resolve();
          });
        })["catch"](function(error) {
          return Model.handle_import_error(error, options, function(err) {
            if (err) {
              return reject(err);
            }
            return resolve();
          });
        });
      });
    };
  };

