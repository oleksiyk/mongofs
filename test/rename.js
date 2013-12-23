"use strict";

/* global before, describe, it, connect, sinon */

var Promise = require('bluebird')

describe('#rename', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
        .then(function() {
            return Promise.all([
                mongofs.mkdir('/aaa'),
                mongofs.mkdir('/aaa1'),
                mongofs.mkdir('/bbb'),
                mongofs.mkdir('/zzz'),
                mongofs.mkdir('/aaaaa')
            ]).then(function() {
                return Promise.all([
                    mongofs.mkdir('/aaa/bbb'),

                    mongofs.open('/aaa/file1', 'w').then(function(fd) {
                        return mongofs.close(fd)
                    }),

                    mongofs.open('/aaa/file3', 'w').then(function(fd) {
                        return mongofs.close(fd)
                    })
                ]).then(function() {
                    return Promise.all([
                        mongofs.mkdir('/aaa/bbb/ccc'),

                        mongofs.open('/aaa/bbb/file2', 'w').then(function(fd) {
                            return mongofs.close(fd)
                        })
                    ])
                })
            })
        })
    })

    it('should fail if old is parent for new', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/aaa', '/aaa/xxxx', cb).should.be.rejected.and.eventually.have.property('code', 'EINVAL')
            .then(function() {
                cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'EINVAL')
            })
    })

    it('should fail if path prefix for new doesn\'t exist', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/aaa/bbb', '/xxx/bbb', cb).should.be.rejected.and.eventually.have.property('code', 'ENOENT')
            .then(function() {
                cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOENT')
            })
    })

    it('should fail if old doesn\'t exist', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/abracadabra', '/aaa/abracadabra', cb).should.be.rejected.and.eventually.have.property('code', 'ENOENT')
            .then(function() {
                cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOENT')
            })
    })

    it('should fail if old is dir and new is a file', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/aaa/bbb', '/aaa/file1', cb).should.be.rejected.and.eventually.have.property('code', 'ENOTDIR')
            .then(function() {
                cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOTDIR')
            })
    })

    it('should fail if old is file and new is a dir', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/aaa/file1', '/aaa/bbb', cb).should.be.rejected.and.eventually.have.property('code', 'EISDIR')
            .then(function() {
                cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'EISDIR')
            })
    })

    it('should fail if new is a directory and is not empty', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/bbb', '/aaa/bbb', cb).should.be.rejected.and.eventually.have.property('code', 'ENOTEMPTY')
            .then(function() {
                cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOTEMPTY')
            })
    })

    it('should rename single empty directory to new name', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/bbb', '/aaa/bbb1', cb)
            .then(function() {
                cb.should.have.been.calledWith(null)
            })
    })

    it('should rename single file to new name', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/aaa/file1', '/aaa/file2', cb)
            .then(function() {
                cb.should.have.been.calledWith(null)
            })
    })

    it('should rename (move) single file removing existing file', function() {
        var cb = sinon.spy(function() {})
        return mongofs.rename('/aaa/file2', '/aaa/file3', cb)
            .then(function() {
                cb.should.have.been.calledWith(null)
            })
    })

    it('should rename (move) directory recursively to existing empty directory', function() {
        var cb = sinon.spy(function() {})

        return mongofs.rename('/aaa', '/zzz', cb).then(function() {
            cb.should.have.been.calledWith(null)

            return mongofs.readdir('/').then(function(list) {
                list.should.be.an('array').and.have.length(3)
                list.should.contain('zzz')
                list.should.not.contain('aaa')
            })
            .then(function() {
                return mongofs.readdir('/zzz').then(function(list) {
                    list.should.be.an('array').and.have.length(3)
                    list.should.contain('bbb')
                        .and.include('file3')
                        .and.include('bbb1')
                        .and.not.include('file2')
                        .and.not.include('file1')
                })
            })
            .then(function() {
                return mongofs.readdir('/zzz/bbb').then(function(list) {
                    list.should.be.an('array').and.have.length(2)
                    list.should.contain('ccc')
                        .and.include('file2')
                })
            })
        })
    })

})
