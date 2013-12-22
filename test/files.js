"use strict";

/* global before, describe, it, connect */

var Promise = require('bluebird');

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
            return Promise.all([
                mongofs.open('/testfile', 'as').should.be.rejected.and.eventually.have.property('code', 'EINVAL'),
                mongofs.open('/testfile').should.be.rejected.and.eventually.have.property('code', 'EINVAL'),
                mongofs.open('/testfile', '').should.be.rejected.and.eventually.have.property('code', 'EINVAL'),
                mongofs.open('/testfile', 1).should.be.rejected.and.eventually.have.property('code', 'EINVAL')
            ])
        });

        ['w', 'w+', 'a', 'a+', 'wx', 'wx+', 'ax', 'ax+'].forEach(function(flag) {
            it('should create new file wih flags=' + flag, function() {
                return mongofs.open('/testnewfile_' + flag, flag)
                    .then(function(fd) {
                        fd.should.be.an('object')
                        fd.should.have.property('flags', flag)
                        fd.should.have.property('file').that.is.an('object')
                        fd.file.should.have.property('filename', '/testnewfile_' + flag)
                        fd.file.should.have.property('mtime').that.is.closeTo(new Date(), 500)
                        fd.file.should.have.property('ctime').that.is.closeTo(new Date(), 500)
                        fd.file.should.have.property('length')
                    })
            })
        });

        ['wx', 'wx+', 'ax', 'ax+'].forEach(function(flag) {
            it('should fail for existing file with flags=' + flag + ' - EEXIST', function() {
                return mongofs.open('/testnewfile_' + flag, flag).should.be.rejected.and.eventually.have.property('code', 'EEXIST');
            })
        });

        ['r', 'r+'].forEach(function(flag) {
            it('should fail for missing file (or folder) flags=' + flag + ' - ENOENT', function() {
                return mongofs.open('/abracadabra', flag).should.be.rejected.and.eventually.have.property('code', 'ENOENT');
            })
        });

        ['r', 'r+', 'w', 'w+', 'wx', 'wx+', 'a', 'a+', 'ax', 'ax+'].forEach(function(flag) {
            it('should fail for missing path for file (or folder) flags=' + flag + ' - ENOENT', function() {
                return mongofs.open('/abracadabra/abracadabra', flag).should.be.rejected.and.eventually.have.property('code', 'ENOENT');
            })
        });

        ['r', 'r+', 'w', 'w+', 'wx', 'wx+', 'a', 'a+', 'ax', 'ax+'].forEach(function(flag) {
            it('should fail for existing folder with flags=' + flag + ' - EISDIR', function() {
                return mongofs.open('/testFolder', flag).should.be.rejected.and.eventually.have.property('code', 'EISDIR');
            })
            it('should fail when part of path prefix is not a directory, flags=' + flag + ' - ENOTDIR', function() {
                return mongofs.open('/testnewfile_w/anotherfile', flag).should.be.rejected.and.eventually.have.property('code', 'ENOTDIR');
            })
        })
    })

    describe.only('#write', function() {
        var fd;
        before(function() {
            return mongofs.open('/testWriteFile', 'w').then(function(_fd) {
                fd = _fd;
            })
        })

        it('should write data to file', function() {
            return mongofs.write(fd, 'test', 0, 4).then(function() {
                return mongofs.close(fd).then(function() {
                    fd.file.should.have.property('length', 4)
                    fd.file.should.have.property('md5', '098f6bcd4621d373cade4e832627b4f6')
                    fd.file.should.have.property('contentType', 'text/plain')
                })
            })
        })
    })

})
