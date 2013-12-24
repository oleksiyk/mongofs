"use strict";

var Binary  = require('mongomise').Binary;
var Promise = require('bluebird');
var _       = require('lodash');

var mmm = require('mmmagic'),
    Magic = mmm.Magic,
    magic = new Magic(mmm.MAGIC_MIME_TYPE);

var Chunk = function(file, n, collection) {
    if(!(this instanceof Chunk)) {
        return new Chunk(file, n, collection);
    }

    this.file = file;
    this.n = n;
    this.collection = collection;

    // this.data = new Binary();
    this.position = 0;
    this.length = 0;
    this.modified = false;
}

Chunk.CHUNK_SIZE = 256 * 1024;

module.exports = Chunk;

Chunk.prototype.load = function() {
    var self = this;

    return self.collection.findOne({
        'files_id': self.file._id,
        n: self.n
    }).then(function(chunk) {
        if(!chunk){
            throw new Error('No chunk for fileId=' + self.file._id.toString() + ', and n=' + self.n)
        }
        self._id = chunk._id;
        self.data = chunk.data.value(true);
        self.position = self.data.length
        self.length = self.data.length;
        self.modified = false;
    })
}

var mimetype = function (buffer) {
    var deferred = Promise.defer();
    magic.detect(buffer, function(err, result) {
        if (err) {
            return deferred.reject(err)
        }
        deferred.resolve(result)
    })
    return deferred.promise;
}

Chunk.prototype.save = function() {
    var self = this, p;

    if(!self.modified){
        return Promise.resolve()
    }

    var data = self.data.slice(0, self.length)

    if(self._id){
        p = self.collection.updateById(self._id, {
            $set: {
                data: new Binary(data)
            }
        }, {w: 1})
    } else {
        p = self.collection.insert({
            'files_id': self.file._id,
            n: self.n,
            data: new Binary(data)
        }, {w: 1})
    }

    return p.then(function() {
        self.mofified = false;
        if(self.n === 0){
            return mimetype(data)
                .then(function(_mt) {
                    self.file.contentType = _mt;
                })
                .catch(function() {})
        }
    })
}

Chunk.prototype.write = function(buffer, position) {
    var self = this;

    self.modified = true;

    // allocate new buffer
    if(!self.data){
        self.data = new Buffer(Chunk.CHUNK_SIZE);
    }

    // chunk data is appended, grow the buffer
    if(self.data.length < Chunk.CHUNK_SIZE){
        var newBuf = new Buffer(Chunk.CHUNK_SIZE)
        self.data.copy(newBuf)
        self.data = newBuf
    }

    if(position > self.length){
        return 0
    }

    self.position = position;

    var bytesToWrite = Chunk.CHUNK_SIZE - self.position
    if(bytesToWrite > buffer.length){
        bytesToWrite = buffer.length
    }

    if(bytesToWrite === 0){
        return 0
    }

    buffer.copy(self.data, self.position, 0, bytesToWrite)
    self.position += bytesToWrite

    if(self.position > self.length){
        self.length = self.position
    }

    return bytesToWrite;
}

Chunk.prototype.read = function(buffer, position, length) {
    var self = this;

    if(position >= self.data.length){
        return 0
    }

    var bytesToRead = self.data.length - position
    if(bytesToRead > length){
        bytesToRead = length
    }

    self.data.slice(position, position + bytesToRead).copy(buffer)
    self.position += bytesToRead

    return bytesToRead
}
