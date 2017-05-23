(function() {
  var Promise, _, cleanInput, getErrorMessage, moment, nullValues, validate, validateDate, validateFloat, validateInteger, validatePercentage,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  _ = require('lodash');

  moment = require('moment');

  Promise = require('bluebird');

  nullValues = ['', void 0, null];

  cleanInput = function(input) {
    if (input) {
      input = input.toLowerCase();
      input = input.trim();
    }
    return input;
  };

  getErrorMessage = function(columnName, cellData, customErrorMessage) {
    var err;
    err = new Error("Unprocessable cell content in column " + columnName + " where content is '" + cellData + "' : " + customErrorMessage);
    err.status = 422;
    return err;
  };

  validateInteger = function(value) {
    if (typeof value === 'string' && /^(\-|\+)?[0-9]+$/.test(value)) {
      return isFinite(Number(value));
    }
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  };

  validateFloat = function(value) {
    return /^(\-|\+)?([0-9]+(\.[0-9]+)?|Infinity)$/.test(value);
  };

  validatePercentage = function(value) {
    return validateFloat(value) && parseFloat(value) <= 100;
  };

  validateDate = function(value) {
    return moment(value, 'DD/M/YYYY', true).isValid();
  };

  validate = function(line, validationConfig) {
    return new Promise((function(_this) {
      return function(resolve, reject) {
        var cellContent, cellName, ref, type;
        if (!validationConfig || !line) {
          return resolve();
        }
        for (cellName in line) {
          cellContent = line[cellName];
          if (((ref = validationConfig[cellName]) != null ? ref.required : void 0) && indexOf.call(_this.nullValues, cellContent) >= 0 && validationConfig[cellName].required) {
            return reject(_this.getErrorMessage(cellName, cellContent, cellName + " cannot be null"));
          }
          if (validationConfig[cellName] && cellContent) {
            type = validationConfig[cellName].type;
            switch (type) {
              case 'integer':
                if (!_this.validateInteger(cellContent)) {
                  return reject(_this.getErrorMessage(cellName, cellContent, cellName + " must be an integer"));
                }
                break;
              case 'float':
                if (!_this.validateFloat(cellContent)) {
                  return reject(_this.getErrorMessage(cellName, cellContent, cellName + " must be a float"));
                }
                break;
              case 'date':
                if (!_this.validateDate(cellContent)) {
                  return reject(_this.getErrorMessage(cellName, cellContent, cellName + " must be formatted as DD/MM/YYYY"));
                }
            }
          }
        }
        return resolve();
      };
    })(this));
  };

  module.exports = {
    validate: validate,
    validateDate: validateDate,
    cleanInput: cleanInput,
    getErrorMessage: getErrorMessage,
    validateInteger: validateInteger,
    nullValues: nullValues,
    validateFloat: validateFloat,
    validatePercentage: validatePercentage
  };

}).call(this);
