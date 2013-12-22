"use strict";

var MongoFsError = function (code, message) {

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = 'MongoFsError';
    this.code = code;

    this.message = message || 'Error';
}

MongoFsError.prototype = Object.create(Error.prototype);
MongoFsError.prototype.constructor = MongoFsError;

MongoFsError.prototype.toJSON = function () {
    return {
        name: this.name,
        message: this.message
    }
}

module.exports = MongoFsError;
