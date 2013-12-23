"use strict";

/* global before, describe, it, connect, sinon, testfiles */

var Promise = require('bluebird');
var fs      = require('fs');
var path    = require('path')

describe('Files', function() {

    var mongofs;

    before(function() {
        return connect().then(function(_fs) {
            mongofs = _fs
        })
    })

    describe('#open', function() {

        before(function() {
            return mongofs.mkdir('/testFolder')
        })

        it('should fail for wrong flags - EINVAL', function() {
            var cb = sinon.spy(function() {})
            return Promise.all([
                mongofs.open('/testfile', 'as', cb).should.be.rejected.and.eventually.have.property('code', 'EINVAL'),
                mongofs.open('/testfile').should.be.rejected.and.eventually.have.property('code', 'EINVAL'),
                mongofs.open('/testfile', '').should.be.rejected.and.eventually.have.property('code', 'EINVAL'),
                mongofs.open('/testfile', 1).should.be.rejected.and.eventually.have.property('code', 'EINVAL'),
            ]).then(function() {
                cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'EINVAL')
            })
        });

        ['w', 'w+', 'a', 'a+', 'wx', 'wx+', 'ax', 'ax+'].forEach(function(flag) {
            it('should create new file wih flags=' + flag, function() {
                var cb = sinon.spy(function() {})
                return mongofs.open('/testnewfile_' + flag, flag, cb)
                    .then(function(fd) {
                        fd.should.be.an('object')
                        fd.should.have.property('flags', flag)
                        fd.should.have.property('file').that.is.an('object')
                        fd.file.should.have.property('filename', '/testnewfile_' + flag)
                        fd.file.should.have.property('mtime').that.is.closeTo(new Date(), 500)
                        fd.file.should.have.property('ctime').that.is.closeTo(new Date(), 500)
                        fd.file.should.have.property('length')

                        cb.should.have.been.calledWith(null, fd)
                    })
            })
        });

        ['wx', 'wx+', 'ax', 'ax+'].forEach(function(flag) {
            it('should fail for existing file with flags=' + flag + ' - EEXIST', function() {
                var cb = sinon.spy(function() {})
                return mongofs.open('/testnewfile_' + flag, flag, cb).should.be.rejected.and.eventually.have.property('code', 'EEXIST')
                    .then(function() {
                        cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'EEXIST')
                    })
            })
        });

        ['r', 'r+'].forEach(function(flag) {
            it('should fail for missing file (or folder) flags=' + flag + ' - ENOENT', function() {
                var cb = sinon.spy(function() {})
                return mongofs.open('/abracadabra', flag, cb).should.be.rejected.and.eventually.have.property('code', 'ENOENT')
                    .then(function() {
                        cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOENT')
                    })
            })
        });

        ['r', 'r+', 'w', 'w+', 'wx', 'wx+', 'a', 'a+', 'ax', 'ax+'].forEach(function(flag) {
            it('should fail for missing path for file (or folder) flags=' + flag + ' - ENOENT', function() {
                var cb = sinon.spy(function() {})
                return mongofs.open('/abracadabra/abracadabra', flag, cb).should.be.rejected.and.eventually.have.property('code', 'ENOENT')
                    .then(function() {
                        cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOENT')
                    })
            })
        });

        ['r', 'r+', 'w', 'w+', 'wx', 'wx+', 'a', 'a+', 'ax', 'ax+'].forEach(function(flag) {
            it('should fail for existing folder with flags=' + flag + ' - EISDIR', function() {
                var cb = sinon.spy(function() {})
                return mongofs.open('/testFolder', flag, cb).should.be.rejected.and.eventually.have.property('code', 'EISDIR')
                    .then(function() {
                        cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'EISDIR')
                    })
            })
            it('should fail when part of path prefix is not a directory, flags=' + flag + ' - ENOTDIR', function() {
                var cb = sinon.spy(function() {})
                return mongofs.open('/testnewfile_w/anotherfile', flag, cb).should.be.rejected.and.eventually.have.property('code', 'ENOTDIR')
                    .then(function() {
                        cb.getCall(0).args[0].should.be.instanceOf(Error).and.have.property('code', 'ENOTDIR')
                    })
            })
        })
    })

    describe('#write', function() {

        it('should write data to file', function() {
            return mongofs.open('/testWriteFile', 'w').then(function(fd) {
                return mongofs.write(fd, 'test', 0, 4, null).then(function() {
                    return mongofs.close(fd).then(function() {
                        fd.file.should.have.property('length', 4)
                        fd.file.should.have.property('md5', '098f6bcd4621d373cade4e832627b4f6')
                        fd.file.should.have.property('contentType', 'text/plain')
                    })
                })
            })
        })

        it('should write data to file in several steps', function() {
            return mongofs.open('/testWriteFile', 'w').then(function(fd) {
                return mongofs.write(fd, 'test', 0, 2, null)
                .then(function() {
                    return mongofs.write(fd, 'test', 2, 2, null)
                })
                .then(function() {
                    return mongofs.close(fd).then(function() {
                        fd.file.should.have.property('length', 4)
                        fd.file.should.have.property('md5', '098f6bcd4621d373cade4e832627b4f6')
                        fd.file.should.have.property('contentType', 'text/plain')
                    })
                })
            })
        })

        it('should append data to file (flags=a)', function() {
            return mongofs.open('/testWriteFile', 'a').then(function(fd) {
                return mongofs.write(fd, '+test', 0, 5, null)
                .then(function() {
                    return mongofs.close(fd).then(function() {
                        fd.file.should.have.property('length', 9)
                        fd.file.should.have.property('md5', 'abeb37e2fa0e063ddb9e15a27be9890c')
                        fd.file.should.have.property('contentType', 'text/plain')
                    })
                })
            })
        })

        it('should call callback on success', function() {

            var cb = sinon.spy(function() {})

            return mongofs.open('/testWriteFile', 'w').then(function(fd) {
                return mongofs.write(fd, 'test', 0, 4, null, cb).then(function() {
                    return mongofs.close(fd).then(function() {
                        cb.should.have.been.calledWith(null, 4)
                    })
                })
            })
        })

        it('should call callback with error on error', function() {

            var cb = sinon.spy(function() {})
            var data = 'test'

            return mongofs.write(null, data, 0, 4, null, cb).catch(function() {
                cb.firstCall.args[0].should.be.instanceOf(Error).and.have.property('code', 'EBADF')
            })
        })
    })

    describe('#close', function() {
        it('should call callback on success without write', function() {

            var cb = sinon.spy(function() {})

            return mongofs.open('/testCloseFile', 'w').then(function(fd) {
                return mongofs.close(fd, cb).then(function() {
                    cb.should.have.been.calledWith(null)
                })
            })
        })

        it('should call callback on success with write', function() {

            var cb = sinon.spy(function() {})

            return mongofs.open('/testWriteFile', 'w').then(function(fd) {
                return mongofs.write(fd, 'test', 0, 4, null).then(function() {
                    return mongofs.close(fd, cb).then(function() {
                        cb.should.have.been.calledWith(null)
                    })
                })
            })
        })

        it('should call callback with error on error', function() {

            var cb = sinon.spy(function() {})

            return mongofs.close(null, cb).catch(function() {
                cb.firstCall.args[0].should.be.instanceOf(Error).and.have.property('code', 'EBADF')
            })
        })
    })

    describe('#writefile', function() {

        testfiles.forEach(function(f) {
            it('should create and write file', function() {
                var cb = sinon.spy(function() {})
                return Promise.promisify(fs.readFile)(f.path).then(function(data) {
                    return mongofs.writeFile('/' + path.basename(f.path), data, cb)
                })
                .then(function() {
                    cb.should.have.been.calledWith(null)
                    return mongofs.stat('/' + path.basename(f.path)).then(function(file) {
                        file.size.should.be.eql(f.size)
                        file.md5.should.be.eql(f.md5)
                        file.contentType.should.be.eql(f.contentType)
                    })
                })
            })
        })
    })

})
