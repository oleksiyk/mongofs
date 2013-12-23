"use strict";

/* global before, describe, it, should, connect, sinon */

var Promise = require('bluebird')

describe('Directories', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    })

    describe('#mkdir', function() {
        var cb = sinon.spy(function() {})
        it('should create directory', function() {
            return mongofs.mkdir('/test', cb)
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

                    cb.should.have.been.calledWith(null)
                })
        })

        it('should not create duplicate directory - EEXIST', function() {
            var cb = sinon.spy(function() {})
            return mongofs.mkdir('/test', cb).should.be.rejected.and.eventually.have.property('code', 'EEXIST')
                .then(function() {
                    cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'EEXIST')
                })
        })

        it('should not create directories recursively - ENOENT', function() {
            var cb = sinon.spy(function() {})
            return mongofs.mkdir('/aaa/bbb/ccc', cb).should.be.rejected.and.eventually.have.property('code', 'ENOENT')
                .then(function() {
                    cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOENT')
                })
        })
    })

    describe('#rmdir', function() {
        it('should remove empty directory', function() {
            var cb = sinon.spy(function() {})
            return mongofs.rmdir('/test', cb)
                .then(function() {
                    return mongofs.db.collection('fs.files').then(function(collection) {
                        return collection.findOne({
                            filename: '/test'
                        })
                    })
                })
                .then(function(dir) {
                    should.not.exist(dir)
                    cb.should.have.been.calledWith(null)
                })
        })

        it('should fail for not existent directory', function() {
            var cb = sinon.spy(function() {})
            return mongofs.rmdir('/aaa/bbb/ccc', cb).should.be.rejected.and.eventually.have.property('code', 'ENOENT')
                .then(function() {
                    cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOENT')
                })
        })

        it('should fail when directory is not empty', function() {
            var cb = sinon.spy(function() {})
            return mongofs.mkdir('/test')
                .then(function() {
                    return mongofs.open('/test/file', 'w')
                        .then(function(fd) {
                            return mongofs.close(fd)
                        })
                })
                .then(function() {
                    return mongofs.rmdir('/test', cb).should.be.rejected.and.eventually.have.property('code', 'ENOTEMPTY');
                })
                .then(function() {
                    cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOTEMPTY')
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

        it('should return empty array for empty directory', function() {
            var cb = sinon.spy(function() {})

            return mongofs.mkdir('/readdir2').then(function() {
                return mongofs.readdir('/readdir2', cb).then(function(files) {
                    files.should.be.an('array').and.have.length(0)
                    cb.should.have.been.calledWith(null, files)
                })
            })
        })

        it('should list files and sub-directories in a directory', function() {
            var cb = sinon.spy(function() {})
            return mongofs.readdir('/readdir', cb).then(function(files) {
                files.should.be.an('array').and.have.length(2)
                files.should.include('directory')
                files.should.include('file')

                cb.should.have.been.calledWith(null, files)
            })
        })

    })

})
