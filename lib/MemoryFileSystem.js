/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

var normalize = require("./normalize");
var errors = require("errno");
var stream = require("readable-stream");

var ReadableStream = stream.Readable;
var WritableStream = stream.Writable;

function MemoryFileSystemError(err, path) {
	Error.call(this)
	if (Error.captureStackTrace)
		Error.captureStackTrace(this, arguments.callee)
	this.code = err.code;
	this.errno = err.errno;
	this.message = err.description;
	this.path = path;
}
MemoryFileSystemError.prototype = new Error();

function MemoryFileSystem(data) {
	this.data = data || {};

	this._watchCallback=[];//文件变化时的回调
}
module.exports = MemoryFileSystem;

function isDir(item) {
	if(typeof item !== "object") return false;
	return item[""] === true;
}

function isFile(item) {
	if(typeof item !== "object") return false;
	return !item[""];
}

function pathToArray(path) {
	path = normalize(path);
	var nix = /^\//.test(path);
	if(!nix) {
		if(!/^[A-Za-z]:/.test(path)) {
			throw new MemoryFileSystemError(errors.code.EINVAL, path);
		}
		path = path.replace(/[\\\/]+/g, "\\"); // multi slashs
		path = path.split(/[\\\/]/);
		path[0] = path[0].toUpperCase();
	} else {
		path = path.replace(/\/+/g, "/"); // multi slashs
		path = path.substr(1).split("/");
	}
	if(!path[path.length-1]) path.pop();
	return path;
}

function trueFn() { return true; }
function falseFn() { return false; }

MemoryFileSystem.prototype.meta = function(_path) {
	var path = pathToArray(_path);
	var current = this.data;
	for(var i = 0; i < path.length - 1; i++) {
		if(!isDir(current[path[i]]))
			return;
		current = current[path[i]];
	}
	return current[path[i]];
}

MemoryFileSystem.prototype.existsSync = function(_path) {
	return !!this.meta(_path);
}

MemoryFileSystem.prototype.statSync = function(_path) {
	var current = this.meta(_path);
	if(_path === "/" || isDir(current)) {
		return {
			isFile: falseFn,
			isDirectory: trueFn,
			isBlockDevice: falseFn,
			isCharacterDevice: falseFn,
			isSymbolicLink: falseFn,
			isFIFO: falseFn,
			isSocket: falseFn
		};
	} else if(isFile(current)) {
        var stat=current.stat;
        if(stat){
            stat.atime=new Date();
        }
		return Object.assign({
			isFile: trueFn,
			isDirectory: falseFn,
			isBlockDevice: falseFn,
			isCharacterDevice: falseFn,
			isSymbolicLink: falseFn,
			isFIFO: falseFn,
			isSocket: falseFn
		},stat);
	} else {
		throw new MemoryFileSystemError(errors.code.ENOENT, _path);
	}
};

MemoryFileSystem.prototype.readFileSync = function(_path, encoding) {
	var path = pathToArray(_path);
	var current = this.data;
	for(var i = 0; i < path.length - 1; i++) {
		if(!isDir(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOENT, _path);
		current = current[path[i]];
	}
	if(!isFile(current[path[i]])) {
		if(isDir(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.EISDIR, _path);
		else
			throw new MemoryFileSystemError(errors.code.ENOENT, _path);
	}
	current = current[path[i]];
    var stat=current && current.stat;
    if(stat){
        stat.atime=new Date();
    }
	return encoding ? current.content.toString(encoding) : current.content;
};

MemoryFileSystem.prototype.readdirSync = function(_path) {
	if(_path === "/") return Object.keys(this.data).filter(Boolean);
	var path = pathToArray(_path);
	var current = this.data;
	for(var i = 0; i < path.length - 1; i++) {
		if(!isDir(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOENT, _path);
		current = current[path[i]];
	}
	if(!isDir(current[path[i]])) {
		if(isFile(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOTDIR, _path);
		else
			throw new MemoryFileSystemError(errors.code.ENOENT, _path);
	}
	return Object.keys(current[path[i]]).filter(Boolean);
};

MemoryFileSystem.prototype.mkdirpSync = function(_path) {
	var path = pathToArray(_path);
	if(path.length === 0) return;
	var current = this.data;
	for(var i = 0; i < path.length; i++) {
		if(isFile(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOTDIR, _path);
		else if(!isDir(current[path[i]]))
			current[path[i]] = {"":true};
		current = current[path[i]];
	}
	return;
};

MemoryFileSystem.prototype.mkdirSync = function(_path) {
	var path = pathToArray(_path);
	if(path.length === 0) return;
	var current = this.data;
	for(var i = 0; i < path.length - 1; i++) {
		if(!isDir(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOENT, _path);
		current = current[path[i]];
	}
	if(isDir(current[path[i]]))
		throw new MemoryFileSystemError(errors.code.EEXIST, _path);
	else if(isFile(current[path[i]]))
		throw new MemoryFileSystemError(errors.code.ENOTDIR, _path);
	current[path[i]] = {"":true};
	return;
};

MemoryFileSystem.prototype._remove = function(_path, name, testFn) {
	var path = pathToArray(_path);
	if(path.length === 0) {
		throw new MemoryFileSystemError(errors.code.EPERM, _path);
	}
	var current = this.data;
	for(var i = 0; i < path.length - 1; i++) {
		if(!isDir(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOENT, _path);
		current = current[path[i]];
	}
	if(!testFn(current[path[i]]))
		throw new MemoryFileSystemError(errors.code.ENOENT, _path);
	delete current[path[i]];
	return;
};

MemoryFileSystem.prototype.rmdirSync = function(_path) {
	return this._remove(_path, "Directory", isDir);
};

MemoryFileSystem.prototype.unlinkSync = function(_path) {
	return this._remove(_path, "File", isFile);
};

MemoryFileSystem.prototype.readlinkSync = function(_path) {
	throw new MemoryFileSystemError(errors.code.ENOSYS, _path);
};

MemoryFileSystem.prototype.writeFileSync = function(_path, content, encoding) {
	var _that=this;
	if(!content && !encoding) throw new Error("No content");
	var path = pathToArray(_path);
	if(path.length === 0) {
		throw new MemoryFileSystemError(errors.code.EISDIR, _path);
	}
	var current = this.data;
	for(var i = 0; i < path.length - 1; i++) {
		if(!isDir(current[path[i]]))
			throw new MemoryFileSystemError(errors.code.ENOENT, _path);
		current = current[path[i]];
	}
	if(isDir(current[path[i]]))
		throw new MemoryFileSystemError(errors.code.EISDIR, _path);
    var stat=current[path[i]] && current[path[i]].stat||{
        atime:new Date(),// 是在读取文件或者执行文件时更改的。
        //mtime:new Date(),// 是在写入文件时随文件内容的更改而更改的。
        //ctime:new Date(),// 是在写入文件、更改所有者、权限或链接设置时随 Inode 的内容更改而更改的。
        birthtime:new Date()// 即文件创建时间
	};
	current[path[i]]=current[path[i]]||{
		path:_path,
		fileName:path[i]
	};
	current[path[i]].content = encoding || typeof content === "string" ? new Buffer(content, encoding) : content;
    stat.mtime=new Date();
    stat.ctime=new Date();
    stat.size=current[path[i]].content.length;
	current[path[i]].stat=stat;
	_that._invokingWatch(current[path[i]]);
	return;
};

MemoryFileSystem.prototype.join = require("./join");
MemoryFileSystem.prototype.pathToArray = pathToArray;
MemoryFileSystem.prototype.normalize = normalize;

// stream functions

MemoryFileSystem.prototype.createReadStream = function(path, options) {
	var stream = new ReadableStream();
	var done = false;
	var data;
	try {
		data = this.readFileSync(path);
	} catch (e) {
		stream._read = function() {
			if (done) {
				return;
			}
			done = true;
			this.emit('error', e);
			this.push(null);
		};
		return stream;
	}
	options = options || { };
	options.start = options.start || 0;
	options.end = options.end || data.length;
	stream._read = function() {
		if (done) {
			return;
		}
		done = true;
		this.push(data.slice(options.start, options.end));
		this.push(null);
	};
	return stream;
};

MemoryFileSystem.prototype.createWriteStream = function(path, options) {
	var stream = new WritableStream(), self = this;
	try {
		// Zero the file and make sure it is writable
		this.writeFileSync(path, new Buffer(0));
	} catch(e) {
		// This or setImmediate?
		stream.once('prefinish', function() {
			stream.emit('error', e);
		});
		return stream;
	}
	var bl = [ ], len = 0;
	stream._write = function(chunk, encoding, callback) {
		bl.push(chunk);
		len += chunk.length;
		self.writeFile(path, Buffer.concat(bl, len), callback);
	}
	return stream;
};

// async functions

["stat", "readdir", "mkdirp", "rmdir", "unlink", "readlink"].forEach(function(fn) {
	MemoryFileSystem.prototype[fn] = function(path, callback) {
		try {
			var result = this[fn + "Sync"](path);
		} catch(e) {
			setImmediate(function() {
				callback(e);
			});

			return;
		}
		setImmediate(function() {
			callback(null, result);
		});
	};
});

["mkdir", "readFile"].forEach(function(fn) {
	MemoryFileSystem.prototype[fn] = function(path, optArg, callback) {
		if(!callback) {
			callback = optArg;
			optArg = undefined;
		}
		try {
			var result = this[fn + "Sync"](path, optArg);
		} catch(e) {
			setImmediate(function() {
				callback(e);
			});

			return;
		}
		setImmediate(function() {
			callback(null, result);
		});
	};
});

MemoryFileSystem.prototype.exists = function(path, callback) {
	return callback(this.existsSync(path));
}

MemoryFileSystem.prototype.writeFile = function (path, content, encoding, callback) {
	if(!callback) {
		callback = encoding;
		encoding = undefined;
	}
	try {
		this.writeFileSync(path, content, encoding);
	} catch(e) {
		return callback(e);
	}
	return callback();
};

/**
 * 调用文件更新
 *
 * @param {any} data
 */
MemoryFileSystem.prototype._invokingWatch=function(file){
	var _watchCallback=this._watchCallback;
	if(_watchCallback && _watchCallback.length){
		for (var i = 0; i < _watchCallback.length; i++) {
			var callback = _watchCallback[i];
			if(callback instanceof Function){
				callback(file);
			}
		}
	}
};
/**
 * 监听文件更新
 *
 * @param {any} callback
 */
MemoryFileSystem.prototype.watch=function(callback){
	if(callback instanceof Function){
		this._watchCallback.push(callback);
	}
};