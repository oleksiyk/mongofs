"use strict";

var Stats = function(file) {
    this.file = file;

    this.ino = file._id.toString();
    this.size = file.length;
    this.atime = file.atime;
    this.mtime = file.mtime;
    this.ctime = file.ctime;

    this.md5 = file.md5;
    this.contentType = file.contentType;
    // mode: 33188
}

Stats.prototype.isFile = function() {
    return !this.file.isDirectory;
}
Stats.prototype.isDirectory = function() {
    return !!this.file.isDirectory;
}
Stats.prototype.isBlockDevice = function() { return false; }
Stats.prototype.isCharacterDevice = function() { return false; }
Stats.prototype.isSymbolicLink = function() { return false; }
Stats.prototype.isFIFO = function() { return false; }
Stats.prototype.isSocket = function() { return false; }


module.exports = Stats;
