"use strict";

/* global before, describe, it, should, connect */

var Promise = require('bluebird')

describe('Directories', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    })

    describe('#mkdir', function() {
        it('should create directory', function() {
            return mongofs.mkdir('/test')
                .then(function() {
                    return mongofs.db.collection('fs.files').then(function(collection) {
                        return collection.findOne({
                            filename: '/test'
                        })
                    })
                })
                .then(function(dir) {
                    dir.should.be.an('object')
                    dir.should.have.property('filename', '/test')
                    dir.should.have.property('isDirectory', true)
                    dir.should.have.property('mtime').that.is.closeTo(new Date(), 500)
                    dir.should.have.property('ctime').that.is.closeTo(new Date(), 500)
                })
        })

        it('should not create duplicate directory - EEXIST', function() {
            return mongofs.mkdir('/test').should.be.rejected.and.eventually.have.property('code', 'EEXIST')
        })

        it('should not create directories recursively - ENOENT', function() {
            return mongofs.mkdir('/aaa/bbb/ccc').should.be.rejected.and.eventually.have.property('code', 'ENOENT')
        })
    })

    describe('#rmdir', function() {
        it('should remove empty directory', function() {
            return mongofs.rmdir('/test')
                .then(function() {
                    return mongofs.db.collection('fs.files').then(function(collection) {
                        return collection.findOne({
                            filename: '/test'
                        })
                    })
                })
                .then(function(dir) {
                    should.not.exist(dir)
                })
        })

        it('should fail for not existent directory', function() {
            return mongofs.rmdir('/aaa/bbb/ccc').should.be.rejected.and.eventually.have.property('code', 'ENOENT');
        })

        it('should fail when directory is not empty', function() {
            return mongofs.mkdir('/test')
                .then(function() {
                    return mongofs.open('/test/file', 'w')
                        .then(function(fd) {
                            return mongofs.close(fd)
                        })
                })
                .then(function() {
                    return mongofs.rmdir('/test').should.be.rejected.and.eventually.have.property('code', 'ENOTEMPTY');
                })
        })
    })

    describe('#readdir', function() {
        before(function() {
            return mongofs.mkdir('/readdir').then(function() {
                return Promise.all([
                    mongofs.mkdir('/readdir/directory'),

                    mongofs.open('/readdir/file', 'w').then(function(fd) {
                        return mongofs.close(fd)
                    })
                ]).then(function() {
                    return Promise.all([
                        mongofs.mkdir('/readdir/directory/level2'),

                        mongofs.open('/readdir/directory/file', 'w').then(function(fd) {
                            return mongofs.close(fd)
                        })
                    ])
                })
            })
        })

        it('should list files and sub-directories in a directory', function() {
            return mongofs.readdir('/readdir').then(function(files) {
                files.should.be.an('array').and.have.length(2)
                files.should.include('directory')
                files.should.include('file')
            })
        })
    })

})
