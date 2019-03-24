var fs = require("fs");
var multer = require('multer');
var mime = require('mime');

//mongodb
var mongo = require('mongodb');
var MongoClient = mongo.MongoClient;

var MongoUrl = "";
var dbo;

MongoClient.connect(MongoUrl, function(err, db) {
	if (err) throw err;
	dbo = db.db("gridfiles");
});

//express
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');

// 创建 application/x-www-form-urlencoded 编码解析
var urlencodedParser = bodyParser.urlencoded({
	extended: false
})

app.use(cookieParser());
app.use('/assets', express.static('assets'));
app.use(multer({
	dest: '/tmp/'
}).array('file'));

var htmlhome = "/";

app.get('/', function(req, res) {
	//console.log("redirect");
	res.redirect("/index.html");
	res.end();
})
app.get('/index.html', function(req, res) {
	if (req.cookies.hashcode == undefined || req.cookies.hashcode == "" || req.cookies.username == undefined) {
		console.log("index not login");
		res.redirect("/login.html");
		res.end();
	} else {
		console.log("index login: " + req.cookies.hashcode);
		res.sendFile(__dirname + htmlhome + "index.html");
	}

})
app.get('/login.html', function(req, res) {
	res.sendFile(__dirname + htmlhome + "login.html");
})
app.get('/register.html', function(req, res) {
	res.sendFile(__dirname + htmlhome + "register.html");
})
app.get('/about.html', function(req, res) {
	res.sendFile(__dirname + htmlhome + "about.html");
})

app.post('/cgi/register', urlencodedParser, function(req, res) {
	var userinfo = {
		"username": req.body.username,
		"password": req.body.password,
		"registtime": Date.now()
	};
	var ret;
	if(userinfo.username.length < 3 || userinfo.username > 16 || !checkInput(userinfo.username)){
		ret = "用户名长度应在3-16位之间，且为纯字母和数字";
		res.end(ret);
		return;
	}else if(userinfo.password.length < 3 || userinfo.password.length < 3 || !checkInput(userinfo.password)){
		ret = "密码长度应在3-16位之间，且为纯字母和数字"
		res.end(ret);
		return;
	}
	var whereStr = {
		"username": userinfo.username
	};
	dbo.collection("user").find(whereStr).toArray(function(err, result) {
		if (err) throw err;
		if (result.length != 0) {
			console.log("用户[%s]注册失败: 已存在的用户名", userinfo.username);
			ret = "用户[" + userinfo.username + "]已存在";
			res.end(ret);
			return;
		} else {
			dbo.collection("user").insertOne(userinfo, function(err, result) {
				if (err) throw err;
				console.log("用户[%s]注册成功", userinfo.username);
				ret = "ok";
				login(userinfo, function(hashcode) {
					if (hashcode == "") {
						ret = "login failed";
					} else {
						res.cookie("hashcode", hashcode);
						res.cookie("username", userinfo.username);
						//res.redirect("/index.html");
					}
					res.end(ret);
				});
			});
		}
	});

})

function login(param, callback) {
	var whereStr = {
		"username": param.username,
		"password": param.password
	};
	dbo.collection("user").find(whereStr).toArray(function(err, result) {
		if (err) throw err;
		if (result.length == 0) {
			callback("");
		} else {
			console.log(result);
			var hashcode = md5(param.username + "gridfiles" + param.password);
			console.log(hashcode);
			callback(hashcode);
		}
	});
}

app.post('/cgi/login', urlencodedParser, function(req, res) {
	var param = {
		"username": req.body.username,
		"password": req.body.password
	};
	var ret;
	if(param.username.length < 3 || param.username.length > 16 || !checkInput(param.username)){
		ret = "用户名错误";
		res.end(ret);
		return;
	}else if(param.password.length < 3 || param.password.length > 16 || !checkInput(param.password)){
		ret = "密码错误"
		res.end(ret);
		return;
	}
	login(param, function(hashcode) {
		if (hashcode == "") {
			ret = "用户不存在";
		} else {
			res.cookie("hashcode", hashcode);
			res.cookie("username", param.username);
			//res.redirect("/index.html");
			ret = "ok";
		}
		res.end(ret);
	});
})

app.post('/cgi/file_put', function(req, res) {
	console.log(req.files[0]); // 上传的文件信息

	var param = {
		"filename": req.files[0].originalname,
		"filepath": req.files[0].path,
		"username": req.cookies.username
	};
	gf_put(param);

	res.end();
})

app.post('/cgi/file_find', function(req, res) {
	var param = {
		"username": req.cookies.username,
		"callback": function(list) {
			console.log(list);
			res.end(JSON.stringify(list));
		}
	};
	gf_find(param);
})

app.get('/cgi/file_get', function(req, res) {
	var param = {
		"username": req.cookies.username,
		"filename": req.query.filename,
		"callback": function(data) {
			console.log("file_get cb");
			res.writeHead(200, {
				'Content-Type': mime.getType(req.query.filename),
				'Content-disposition': 'attachment; filename=' + encodeURI(req.query.filename)
			});
			res.end(data);
		}
	};
	gf_get(param);
})

app.post('/cgi/file_del', urlencodedParser, function(req, res) {
	var param = {
		"username": req.cookies.username,
		"filename": req.body.filename,
		"callback": function(ret) {
			res.end("ok");
		}
	};
	gf_del(param);
})

app.post('/cgi/user_size', function(req, res) {
	var param = {
		"username": req.cookies.username,
		"callback": function(ret) {
			console.log(ret);
			res.end(JSON.stringify(ret));
		}
	};
	gf_user_size(param);
})

app.get('/\*', function(req, res) {
	res.sendFile(__dirname + htmlhome + "error-404.html");
})
var server = app.listen(80, function() {
	var host = server.address().address;
	var port = server.address().port;
	console.log("port: %s", port);
})


//gridfs

/*

chunk
"_id" : ObjectId("..."),
"n" : 0,             //这个块在原文件中的顺序编号
"data" : BinData("..."),   //包含组成文件块的二进制数据
"files_id" : ObjectId("...")  //包含这个块元素的文件文档的_id

meta
_id :        文件的唯一id。在块中作为files_id键的值存储
length ：     文件内容总的字节数
chunkSize ：  每块的大小，以字节为单位。默认是256K
uploadDate ： 文件存入GridFS的时间戳
md5 ：         文件内容的md5校验和，有服务器端生成（用户可以校验md5键的值确保文件正确上传）

*/

function gf_put(param) {
	/*
	filepath
	username
	filename
	callback
	*/
	fs.readFile(param.filepath, function(err, data) {
		var flen = data.length;
		var fmd5 = md5(data);
		var fid = md5(param.username + param.filename);

		console.log("length: [%s]", flen);
		console.log("md5: " + fmd5);
		console.log("fid: " + fid);

		var chunkSize = 256000;
		var n = 0;

		function chunkslice(index) {
			var dataslice = data.slice(chunkSize * index, (function() {
				var end = chunkSize * (index + 1);
				if (end < flen) {
					return end;
				} else {
					return flen;
				}
			})());

			var bindata = mongo.Binary(dataslice);
			console.log("dataslice " + index + " len: " + dataslice.length + " binlen: " + bindata.length);
			return bindata;
		}
		while (n * chunkSize < flen) {
			var chunk = {
				"_id": md5(param.username + param.filename + n),
				"n": n,
				"data": chunkslice(n),
				"files_id": fid
			}

			function insert(chunk) {
				dbo.collection("chunks").insertOne(chunk, function(err, res) {
					if (err) throw err;
					console.log("insert chunk [" + chunk.files_id + "][" + chunk.n + "]");
				});
			}
			insert(chunk);
			n++;
		}
		var meta = {
			"_id": fid,
			"fname": param.filename,
			"uname": param.username,
			"length": flen,
			"chunkSize": chunkSize,
			"uploadDate": Date.now(),
			"md5": fmd5
		}
		dbo.collection("meta").insertOne(meta, function(err, res) {
			if (err) throw err;
			console.log("insert meta [" + meta._id + "][" + meta.fname + "][" + meta.uname + "][" + meta.length + "]");
		});
	});
}

function gf_find(param) {
	/*
	username
	callback(result)
	*/
	var whereStr = {
		"uname": param.username,
	};
	dbo.collection("meta").find(whereStr).toArray(function(err, result) {
		if (err) throw err;
		var list = new Array();
		result.forEach(function(item, index) {
			list[index] = {
				"fname": item.fname,
				"flen": item.length,
				"date": formatDate(new Date(item.uploadDate), "yyyy/MM/dd hh:mm:ss")
			};
		});
		param.callback(list);
	});
}

function gf_get(param) {
	var whereStr = {
		"uname": param.username,
		"fname": param.filename
	};
	//console.log(whereStr);
	var des_path = __dirname + "/tmp/" + param.username;
	var des_file = des_path + "/" + param.filename;
	fs.access(des_path, fs.constants.F_OK, function(err) {
		if (err) {}
	});
	dbo.collection("meta").find(whereStr).toArray(function(err, result) {
		if (err) throw err;
		//console.log(result.length);
		if (result.length == 0) {
			param.callback("");
		} else {
			console.log(result);
			var file_id = result[0]._id;
			var chunkSize = result[0].chunkSize;
			var flen = result[0].length;
			var fmd5 = result[0].md5;
			var whereStr = {
				"files_id": file_id
			};
			var data = new Buffer(0);
			dbo.collection("chunks").find(whereStr).toArray(function(err, result) {
				if (err) throw err;
				result = result.sort(function(a, b) {
					return a.n - b.n;
				});
				result.forEach(function(item, index) {
					data = Buffer.concat([data, item.data.read(0, chunkSize)]);
					console.log(item.n);
					console.log("item.n: " + item.n + " data.length: " + data.length);
				});

				param.callback(data);
				/*
				function creatDir(path, cb) {
					fs.access(des_path, fs.constants.F_OK, function(err) {
						if (err) {
							fs.mkdir(des_path, function(err) {
								if (err) throw err;
								cb();
							});
						}
						cb();
					});
				}
				creatDir(des_path, function() {
					fs.writeFile(des_file, data, function(err) {
						if (err) throw err;
						param.callback(des_file);
					});
				});
				*/
			});
		}

	});
}

function gf_del(param) {
	var whereStr = {
		"uname": param.username,
		"fname": param.filename
	};
	console.log(whereStr);
	dbo.collection("meta").find(whereStr).toArray(function(err, result) {
		if (result.length == 0) {
			param.callback();
		} else {
			var file_id = result[0]._id;
			var whereStr = {
				"files_id": file_id
			};
			dbo.collection("chunks").deleteMany(whereStr, function(err, obj) {
				if (err) throw err;
				console.log("delete chunks: " + obj.result.n);

				var whereStr = {
					"uname": param.username,
					"fname": param.filename
				};
				dbo.collection("meta").deleteOne(whereStr, function(err, obj) {
					if (err) throw err;
					console.log("delete meta: " + param.username + "|" + param.filename);

					param.callback();
				});
			});
		}
	});
}

function gf_user_size(param) {
	var whereStr = {
		"uname": param.username
	};
	console.log(whereStr);
	dbo.collection("meta").find(whereStr).toArray(function(err, result) {
		var ret = {
			"total": 0,
			"used": 0
		}
		callback(ret);
	});
}


//tools

function checkInput(text){
	var re = /^[0-9a-zA-Z]+$/;
　return re.test(text);
}

function md5(data) {
	const crypto = require('crypto');
	const hash = crypto.createHash('md5');
	hash.update(data);
	return hash.digest('hex');
}

function formatDate(timestamp, fmt) { //
	var o = {
		"M+": timestamp.getMonth() + 1, //Month
		"d+": timestamp.getDate(), //Day
		"h+": timestamp.getHours(), //Hour
		"m+": timestamp.getMinutes(), //Minute
		"s+": timestamp.getSeconds(), //Second
		"q+": Math.floor((timestamp.getMonth() + 3) / 3), //Season
		"S": timestamp.getMilliseconds() //millesecond
	};
	if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (timestamp.getFullYear() +

		"").substr(4 - RegExp.$1.length));
	for (var k in o)
		if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k])
			.substr(("" + o[k]).length)));
	return fmt;
};

function formatSize(value) {
	if (null == value || value == '') {
		return "0 Bytes";
	}
	var unitArr = new Array("Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB");
	var index = 0;
	var srcsize = parseFloat(value);
	index = Math.floor(Math.log(srcsize) / Math.log(1024));
	var size = srcsize / Math.pow(1024, index);
	size = size.toFixed(2); //保留的小数位数
	return size + " " + unitArr[index];
}
