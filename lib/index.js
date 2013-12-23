"use strict";

/* jshint bitwise: false */

var XRegExp    = require('xregexp').XRegExp;
var path       = require('path');
// var _          = require('lodash');
var Promise    = require('bluebird');
// var mongomise  = require('mongomise');

var MongoFsError = require('./error')
var MongoFsWriteStream = require('./writestream')
var Stats = require('./stats')
var Chunk = require('./chunk')

var MongoFs = function(db, files, chunks, root) {
    var self = this;

    if (!(this instanceof MongoFs)){
        return new MongoFs(db, files, chunks, root);
    }

    self.db = db;
    self.files = files;
    self.chunks = chunks;
    self.root = root;
}

exports.create = function(db, root) {
    root = root || 'fs';

    return Promise.all([
        // fs.files
        db.createCollection(root + '.files').then(function (collection) {
            return Promise.all([
                    collection.ensureIndex({ 'filename': 1 }, { unique: true }),
                ])
                .return(collection)
        }),

        // fs.chunks
        db.createCollection(root + '.chunks').then(function (collection) {
            return Promise.all([
                    collection.ensureIndex({ 'files_id': 1, 'n': 1 }),
                ])
                .return(collection)
        }),
    ])
    .spread(function (files, chunks) {
        return new MongoFs(db, files, chunks)
    })
};

MongoFs.prototype.unlink = function() {
};

MongoFs.prototype.readdir = function(_path) {
    var self = this;

    return self.files.findAll({
        filename: {
            $regex: '^' + XRegExp.escape(path.normalize(_path + '/')) + '[^/]+$'
        }
    })
    .then(function(files) {
        files = files.map(function(f) {
            return path.basename(f.filename)
        })
        return files
    })
};

MongoFs.prototype.mkdir = function(_path) {
    var self = this, d = path.dirname(_path),
        p = Promise.resolve(1);

    if (d !== '/') {
        p = self.files.count({
            filename: d,
            isDirectory: true
        })
    }

    return p.then(function(count) {
        if(count === 0){
            throw new MongoFsError('ENOENT', 'Path doesn\'t exist: ' + d)
        }

        return self.files.insert({
            filename: _path,
            ctime: new Date(),
            mtime: new Date(),
            isDirectory: true
        })
    })
    .catch(function (err) {
        if(err.code == 11000 || err.code == 11001){ // duplicate key (on insert / on update)
            throw new MongoFsError('EEXIST', 'Path already exists: ' + _path)
        }
        throw err;
    })
};

MongoFs.prototype.open = function(filename, flags) {
    var self = this, d = path.dirname(filename),
        p = Promise.resolve({isDirectory: true});

    if(!/^(r|r\+|w|wx|w\+|wx\+|a|ax|a\+|ax\+)$/.test(flags)){
        return Promise.reject(new MongoFsError('EINVAL', 'Invalid flags given: ' + flags))
    }

    if (d !== '/') {
        p = self.files.findOne({
            filename: d,
        })
    }

    return Promise.all([
        self.files.findOne({
            filename: filename
        }), p
    ])
    .spread(function(file, parent) {
        if(file && file.isDirectory){
            throw new MongoFsError('EISDIR', 'File is a directory: ' + filename)
        }
        if(!parent){
            throw new MongoFsError('ENOENT', 'Path doesn\'t exist: ' + d)
        }
        if(!parent.isDirectory){
            throw new MongoFsError('ENOTDIR', 'Not a directory: ' + d)
        }
        if(file && /^(wx|wx\+|ax|ax\+)$/.test(flags)){
            throw new MongoFsError('EEXIST', 'File already exists: ' + filename)
        }
        if(!file && /^(r|r\+)$/.test(flags)){
            throw new MongoFsError('ENOENT', 'File doesn\'t exist: ' + filename)
        }

        if(/^(w|w\+|a|a\+|wx|wx\+|ax|ax\+)$/.test(flags)){
            if(file && /^(w|w\+)$/.test(flags)){
                // truncate file, remove all existing chunks
                return self.chunks.remove({
                    'files_id': file._id
                }).then(function() {
                    file.length = 0;
                    file.md5 = undefined;
                    file.contentType = undefined;
                    return {
                        flags: flags,
                        position: 0,
                        file: file,
                    }
                })
            }
            if(file && /^(a|a\+)$/.test(flags)){
                var chunk = new Chunk(file, Math.floor(file.length/Chunk.CHUNK_SIZE), self.chunks)
                return chunk.load().then(function() {
                    return {
                        flags: flags,
                        position: file.length,
                        chunk: chunk,
                        file: file,
                    }
                })
            }
            if(!file){ // create new file
                return self.files.insert({
                    filename: filename,
                    ctime: new Date(),
                    mtime: new Date(),
                    length: 0,
                }).get(0).then(function(_file) {
                    return {
                        flags: flags,
                        position: 0,
                        file: _file,
                    }
                })
            }
        }

        // flags = r or r+
        return {
            flags: flags,
            file: file,
            position: 0
        }
    })
};

MongoFs.prototype.close = function(fd) {
    var self = this;

    if(!fd || !fd.file){
        return Promise.reject(new MongoFsError('EBADF', 'Invalid file descriptor'))
    }

    fd.closed = true;

    if(fd.chunk){
        return fd.chunk.save()
            .then(function() {
                fd.chunk = null;
                return self.db.command({
                    filemd5: fd.file._id,
                    root: 'fs'
                })
            })
            .then(function(md5) {
                fd.file.md5 = md5.md5
                fd.file.length = fd.position;

                return self.files.updateById(fd.file._id, {
                    $set: {
                        md5: fd.file.md5,
                        length: fd.file.length,
                        contentType: fd.file.contentType || 'binary/octet-stream',
                        mtime: new Date()
                    }
                })
            })
    }
};

MongoFs.prototype.write = function(fd, buffer, offset, length, position, callback) {
    var self = this;

    offset = offset | 0;
    length = length | 0;

    if(!fd || fd.closed || !fd.file || !/^(w|w\+|wx|wx\+|a|a\+|ax|ax\+)$/.test(fd.flags)){
        return Promise.reject(new MongoFsError('EBADF', 'Invalid file descriptor')).nodeify(callback)
    }

    if(typeof buffer === 'string'){
        buffer = new Buffer(buffer, 'binary')
    }

    if(!Buffer.isBuffer(buffer)){
        return Promise.reject(new MongoFsError('EINVAL', 'buffer argument should be Buffer or String')).nodeify(callback)
    }

    if(position !== null && typeof position !== 'undefined'){
        return Promise.reject(new MongoFsError('EINVAL', 'Writing at position is not supported yet')).nodeify(callback)
    }

    if(!fd.chunk){
        fd.chunk = new Chunk(fd.file, 0, self.chunks)
    }

    var _write = function(_buffer) {
        var written = fd.chunk.write(_buffer)
        fd.position += written;

        if(written < _buffer.length){
            return fd.chunk.save().then(function() {
                fd.chunk = new Chunk(fd.file, Math.floor(fd.position/Chunk.CHUNK_SIZE), self.chunks)
                return _write(_buffer.slice(written))
            })
        }
        return Promise.resolve();
    }

    return _write(buffer.slice(offset, offset+length))
        .return(length)
        .nodeify(callback)
};

MongoFs.prototype.rmdir = function(_path) {
    var self = this;

    return self.files.count({
        filename: {
            $regex: new RegExp('^' + XRegExp.escape(path.normalize(_path + '/')))
        }
    }).then(function(count) {
        if(count){
            throw new MongoFsError('ENOTEMPTY', 'Directory not empty: ' + _path)
        }

        return self.files.remove({
            filename: _path,
            isDirectory: true
        })
        .then(function(count) {
            if(count === 0){
                throw new MongoFsError('ENOENT', 'Path doesn\'t exist:' + _path)
            }
        })
    })
};

MongoFs.prototype.rename = function(oldName, newName) {

};

MongoFs.prototype.stat = function(_path) {
    var self = this;

    return self.files.findOne({
        filename: _path
    })
    .then(function(file) {
        if(!file){
            throw new MongoFsError('ENOENT', 'Path doesn\'t exist: ' + _path)
        } else {
            return new Stats(file)
        }
    })
};

MongoFs.prototype.createWriteStream = function(_path, options) {
    return new MongoFsWriteStream(this, _path, options)
};

MongoFs.prototype.writeFile = function(filename, data, options, callback) {
};

MongoFs.prototype.createReadStream = function() {
};

MongoFs.prototype.readFile = function() {
};
