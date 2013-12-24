"use strict";

var util = require('util');
var stream = require('stream');
var _ = require('lodash');

var MongoFsReadStream = function(mongofs, _path, options) {

    if (!(this instanceof MongoFsReadStream)) {
        return new MongoFsReadStream(mongofs, _path, options);
    }

    options = _.partialRight(_.merge, _.defaults)(options || {}, {
        flags: 'r',
        encoding: null,
        fd: null,
        autoClose: true
    });

    stream.Readable.call(this, options)

    this.flags = options.flags;
    this.autoClose = options.autoClose;
    this.mongofs = mongofs;
    this.path = _path;
    this.bytesRead = 0;

    if(options.fd){
        this.fd = options.fd;
        this.emit('open', this.fd)
    } else {
        this.open()
    }

    this.once('finish', this.close);
}

util.inherits(MongoFsReadStream, stream.Readable);

module.exports = MongoFsReadStream;

MongoFsReadStream.prototype.open = function() {
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
            if(self.autoClose){
                self.close()
            }
            self.emit('error', err)
        })
}

MongoFsReadStream.prototype.close = function() {
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

MongoFsReadStream.prototype._read = function(size) {
    var self = this;

    if (!self.fd) {
        return self.once('open', function() {
            self._read(size);
        });
    }

    if(size > self.fd.file.length){
        size = self.fd.file.length
    }

    var buffer = new Buffer(size)

    self.mongofs.read(self.fd, buffer, 0, size, null)
        .then(function(read) {
            self.bytesRead += read;
            if(read > 0){
                return self.push(buffer.slice(0, read))
            }
            self.push(null)
        })
        .catch(function(err) {
            if(self.autoClose){
                self.close()
            }
            self.emit('error', err)
        })
}
