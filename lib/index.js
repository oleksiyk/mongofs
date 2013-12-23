"use strict";

/* jshint bitwise: false, maxparams: 6 */

var XRegExp    = require('xregexp').XRegExp;
var path       = require('path');
var _          = require('lodash');
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

exports.create = function(db, root, callback) {
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
    .nodeify(callback)
};

MongoFs.prototype.unlink = function(filename, callback) {
    var self = this;

    filename = path.normalize(filename)

    return self.files.findOne({
        filename: filename
    })
    .then(function(file) {
        if(!file){
            throw new MongoFsError('ENOENT', 'File doesn\'t exist')
        }
        if(file.isDirectory){
            throw new MongoFsError('EISDIR', 'File is a directory')
        }

        return self.chunks.remove({
            'files_id': file._id
        }).then(function() {
            return self.files.remove({
                _id: file._id
            })
        })
    })
    .nodeify(callback)
};

MongoFs.prototype.readdir = function(_path, callback) {
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
    .nodeify(callback)
};

MongoFs.prototype.mkdir = function(_path, mode, callback) {
    var self = this, d = path.dirname(_path),
        p = Promise.resolve(1);

    if(typeof mode === 'function'){
        callback = mode
    }

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
    .nodeify(callback)
};

MongoFs.prototype.rmdir = function(_path, callback) {
    var self = this;

    return self.files.count({
        filename: {
            $regex: new RegExp('^' + XRegExp.escape(path.normalize(_path + '/')))
        }
    })
    .then(function(count) {
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
    .nodeify(callback)
};


MongoFs.prototype.open = function(filename, flags, mode, callback) {
    var self = this, d, p = Promise.resolve({isDirectory: true});

    filename = path.normalize(filename)
    d = path.dirname(filename)

    if(typeof mode === 'function'){
        callback = mode;
    }

    if(!/^(r|r\+|w|wx|w\+|wx\+|a|ax|a\+|ax\+)$/.test(flags)){
        return Promise.reject(new MongoFsError('EINVAL', 'Invalid flags given: ' + flags)).nodeify(callback)
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
    }).nodeify(callback)
};

MongoFs.prototype.close = function(fd, callback) {
    var self = this;

    if(!fd || !fd.file){
        return Promise.reject(new MongoFsError('EBADF', 'Invalid file descriptor')).nodeify(callback)
    }

    var p = Promise.resolve()

    fd.closed = true;

    if(fd.chunk){
        p = fd.chunk.save()
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

    return p.nodeify(callback)
};

MongoFs.prototype.write = function(fd, buffer, offset, length, position, callback) {
    var self = this;

    offset = offset | 0;
    length = length | 0;

    if(!fd || fd.closed || !fd.file || !/^(w|w\+|wx|wx\+|a|a\+|ax|ax\+)$/.test(fd.flags)){
        return Promise.reject(new MongoFsError('EBADF', 'Invalid file descriptor')).nodeify(callback)
    }

    if(typeof buffer === 'string'){
        buffer = new Buffer(buffer, 'utf8')
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

MongoFs.prototype.rename = function(oldName, newName, callback) {
    var self = this;

    newName = path.normalize(newName)
    oldName = path.normalize(oldName)
    var re = new RegExp('^' + XRegExp.escape(oldName))

    if(re.test(newName)){
        return Promise.reject(new MongoFsError('EINVAL', 'old is a parent directory of new')).nodeify(callback)
    }

    function rename(cursor){
        return cursor.nextObject().then(function(file) {
            if(file === null){
                return
            }
            return self.files.updateById(file._id, {
                $set: {
                    filename: file.filename.replace(re, newName)
                }
            })
            .then(function() {
                return rename(cursor)
            })
        })
    }

    return Promise.all([
        self.files.findOne({
            filename: newName
        }),
        self.stat(path.dirname(newName)),
        self.files.findOne({
            filename: oldName
        }),
    ])
    .spread(function(newFile, newDirStat, oldFile) {
        if(!oldFile || !newDirStat){
            throw new MongoFsError('ENOENT', 'A component of the old path does not exist, or a path prefix of new does not exist')
        }
        if(!newDirStat.isDirectory()){
            throw new MongoFsError('ENOTDIR', 'A component of new path prefix is not a directory')
        }
        if(newFile){
            if(oldFile.isDirectory && !newFile.isDirectory){
                throw new MongoFsError('ENOTDIR', 'old is a directory, but new is not a directory')
            }
            if(newFile.isDirectory && !oldFile.isDirectory){
                throw new MongoFsError('EISDIR', 'new is a directory, but old is not a directory')
            }
            if(newFile.isDirectory){
                return self.rmdir(newName)
            } else {
                return self.unlink(newName)
            }
        }
    })
    .then(function() {
        return self.files.find({
            filename: new RegExp('^' + XRegExp.escape(oldName) + '(?:\/|$)')
        })
        .then(function(cursor) {
            return rename(cursor)
        })
    })
    .nodeify(callback)
};

MongoFs.prototype.stat = function(_path, callback) {
    var self = this;

    _path = path.normalize(_path)

    if(_path === '/'){
        return Promise.resolve(new Stats({
            filename: '/',
            isDirectory: true,
            ctime: new Date(0),
            mtime: new Date(0)
        })).nodeify(callback)
    }

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
    .nodeify(callback)
};

MongoFs.prototype.createWriteStream = function(_path, options) {
    return new MongoFsWriteStream(this, _path, options)
};

MongoFs.prototype.writeFile = function(filename, data, options, callback) {
    var self = this;

    if(typeof options === 'function'){
        callback = options;
    }

    options = _.partialRight(_.merge, _.defaults)(options || {}, {
        flags: 'w',
        encoding: 'utf8'
    });

    if(typeof data === 'string'){
        data = new Buffer(data, options.encoding)
    }

    return self.open(filename, options.flags)
        .then(function(fd) {
            return self.write(fd, data, 0, data.length, null)
                .then(function() {
                    return self.close(fd)
                })
        })
        .nodeify(callback)
};

MongoFs.prototype.createReadStream = function() {
};

MongoFs.prototype.readFile = function() {
};
