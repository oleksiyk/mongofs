"use strict";

var util = require('util');
var stream = require('stream');
var _ = require('lodash');

var MongoFsWriteStream = function(mongofs, _path, options) {

    if (!(this instanceof MongoFsWriteStream)) {
        return new MongoFsWriteStream(mongofs, _path, options);
    }

    options = _.partialRight(_.merge, _.defaults)(options || {}, {
        flags: 'w',
        encoding: null,
        highWaterMark: 256 * 1024,
        decodeStrings: true
    });

    stream.Writable.call(this, options)

    this.flags = options.flags;
    this.mongofs = mongofs;
    this.path = _path;
    this.bytesWritten = 0;

    this.open()

    this.once('finish', this.close);
}

util.inherits(MongoFsWriteStream, stream.Writable);

module.exports = MongoFsWriteStream;

MongoFsWriteStream.prototype.open = function() {
    var self = this;

    if (self._opening || self.fd) {
        return;
    }
    self._opening = true;

    self.mongofs.open(self.path, self.flags)
        .then(function(fd) {
            self.fd = fd;
            self.emit('open', self.fd)
        })
        .catch (function(err) {
            self.emit('error', err)
        })
}

MongoFsWriteStream.prototype.close = function() {
    var self = this;

    function _close() {
        self.mongofs.close(self.fd)
            .then(function() {
                self.fd = null;
                self.emit('close')
            })
            .catch (function(err) {
                self.emit('error', err)
            })
    }

    if (self._closed) {
        return process.nextTick(self.emit.bind(self, 'close'));
    }

    if (!self.fd) {
        return self.once('open', close)
    }

    self._closed = true

    _close()
}

MongoFsWriteStream.prototype._write = function(chunk, encoding, callback) {
    var self = this;

    if (!self.fd) {
        return self.once('open', function() {
            self._write(chunk, encoding, callback);
        });
    }

    self.mongofs.write(self.fd, chunk, 0, chunk.length, null)
        .then(function(written) {
            self.bytesWritten += written;
            return true
        })
        .nodeify(callback)
}
